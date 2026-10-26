/* Studio pleine page : panneau de réglages à gauche, résultats en direct et historique à droite. */
import { api } from '../api.js';
import { describeError, fillTemplate, stubAsset } from '../lib.js';
import { mountPanel } from '../panel.js';
import { state, subscribe, trackJob } from '../state.js';
import { assetField, clear, consentBox, errorBox, field, h, nextId, openViewer, realFacesNotice, thumb } from '../ui.js';
import { camFor, canvasFor, clipForCam } from '../showcase.js';

const SCENES = ['aurora', 'planet', 'ocean', 'city', 'orbit', 'tunnel'];

export function mount(root, qs) {
  const cat = state.catalog;
  const cfg = state.config;
  if (!cat || !cfg) {
    root.appendChild(h('div', { class: 'page' }, errorBox('Catalogue indisponible. Rechargez la page.')));
    return () => {};
  }

  let tab = qs.get('tab') === 'video' ? 'video' : 'image';
  let vmode = qs.get('mode') === 't2v' ? 't2v' : 'i2v';
  if (qs.get('inputAssetId') && !qs.get('tab')) tab = 'video';
  let presetId = null;
  let template = null;
  let tplValues = {};
  let characterId = '';
  let sizeId = cat.sizes[0] ? cat.sizes[0].id : 'square';
  let duration = 4;
  let view = 'results';
  const engines = cat.engines || [];
  const engineSel = { image: 'auto', video: 'auto' };
  const enginesFor = () => engines.filter((e) => e.kinds.includes(kindNow()));
  const isAuto = () => engineSel[tab] === 'auto' || engineSel[tab] === 'auto-premium';
  // Choix automatique (même règle que le serveur) : brouillon → moteur du site le moins cher ; sinon le moins cher du niveau.
  function autoPick(premium) {
    const end = kindNow() === 'i2v' && !!endField.getAsset();
    const list = enginesFor().filter((e) => !end || e.endImage);
    const d = tab === 'video' && draft.checked;
    const pick = d ? list.filter((e) => e.draftCredits) : premium ? list.filter((e) => e.premium) : list;
    const price = (e) => (d && e.draftCredits ? e.draftCredits : e.credits);
    return [...(pick.length ? pick : list)].sort((a, b) => price(a) - price(b))[0] || null;
  }
  const engineNow = () => {
    if (isAuto()) return autoPick(engineSel[tab] === 'auto-premium');
    const list = enginesFor();
    return list.find((e) => e.id === engineSel[tab]) || list[0] || null;
  };
  const kindNow = () => (tab === 'image' ? 't2i' : vmode === 't2v' ? 't2v' : 'i2v');

  /* ----- champs ----- */
  const prompt = h('textarea', { rows: 4, maxLength: cfg.limits.maxPromptLength, placeholder: 'Décrivez ce que vous voulez voir…', 'aria-label': 'Prompt' });
  prompt.value = qs.get('prompt') || '';
  const counter = h('span', { class: 'hint counter' });
  const negative = h('textarea', { rows: 2, placeholder: 'Ce que vous ne voulez pas voir…' });
  const seed = h('input', { type: 'number', min: '0', step: '1', placeholder: 'Aléatoire' });
  const draft = h('input', { type: 'checkbox', id: nextId('draft') });
  const charSel = h('select', {}, h('option', { value: '' }, 'Aucun personnage'));
  const countSel = h('select', { 'aria-label': 'Nombre de générations' }, ...[1, 2, 3, 4].map((n) => h('option', { value: String(n) }, `x${n}`)));
  const inputField = assetField({ kind: 'image', label: 'Image de départ', onChange: () => syncConsent() });
  const endField = assetField({ kind: 'image', label: 'Image de fin (facultative)', onChange: () => { syncConsent(); renderModel(); updateCost(); } });
  const endWrap = h('div', { class: 'end-wrap', hidden: true }, endField.el, h('p', { class: 'hint' }, 'Verrouille la dernière image : formes et cadrage respectés, moins d’essais ratés.'));
  const consent = consentBox(`J'ai le droit d'utiliser cette image (visages réels : voir l'avertissement)`);
  const consentWrap = h('div', { hidden: true }, consent.el);
  const err = h('div', { 'aria-live': 'polite' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Générer');
  const updateCounter = () => (counter.textContent = `${prompt.value.length} / ${cfg.limits.maxPromptLength}`);
  prompt.addEventListener('input', updateCounter);
  updateCounter();

  /* ----- modèle ----- */
  const modelName = h('b', {});
  const modelSub = h('span', {});
  const modelCanvasBox = h('div', { class: 'model-card' });
  const enginePick = h('div', { class: 'engine-pick', role: 'radiogroup', 'aria-label': 'Modèle', hidden: true });
  function renderModel() {
    const kind = tab === 'image' ? 'image' : 'video';
    const m = cat.models.find((x) => x.kind === kind);
    const e = engineNow();
    const c = e ? costNow() / Number(countSel.value || 1) : 0;
    modelName.textContent = e ? `${isAuto() ? 'Auto → ' : ''}${e.name}` : tab === 'image' ? 'Texte vers image' : vmode === 't2v' ? 'Texte vers vidéo' : 'Image vers vidéo';
    modelSub.textContent = e ? `${e.vendor} · ✦ ${c} crédit${c > 1 ? 's' : ''} (≈ ${(c / 100).toFixed(2).replace('.', ',')} $)` : `${m ? m.name : 'Modèle'} · moteur ${cfg.backend === 'mock' ? 'de démonstration' : cfg.backend}`;
    clear(enginePick);
    const list = enginesFor();
    enginePick.hidden = list.length < 2;
    if (!enginePick.hidden) {
      for (const [id, label, premium] of [['auto', 'Auto', false], ['auto-premium', 'Auto premium', true]]) {
        const pick = autoPick(premium);
        if (!pick || (premium && !list.some((x) => x.premium))) continue;
        enginePick.appendChild(h('button', { type: 'button', role: 'radio', class: 'engine', 'aria-checked': String(engineSel[tab] === id), onclick: () => { engineSel[tab] = id; renderModel(); updateCost(); } },
          h('b', {}, label), h('span', {}, `→ ${pick.name}`)));
      }
    }
    for (const x of list) {
      enginePick.appendChild(h('button', { type: 'button', role: 'radio', class: 'engine', 'aria-checked': String(!isAuto() && x.id === (e && e.id)), onclick: () => { engineSel[tab] = x.id; renderModel(); updateCost(); endWrap.hidden = !(kindNow() === 'i2v' && x.endImage); } },
        h('b', {}, x.name), h('span', {}, `${x.tag ? `${x.tag} · ` : ''}✦ ${x.credits}`)));
    }
    clear(modelCanvasBox);
    modelCanvasBox.append(canvasFor({ scene: tab === 'image' ? 'aurora' : 'planet', seed: tab === 'image' ? 3 : 21, cam: tab === 'image' ? 'pan-l' : 'orbit', ratio: 0.3, width: 400 }), h('div', {}, modelName, modelSub));
  }

  /* ----- formats ----- */
  const sizeBox = h('div', { class: 'size-chips', role: 'group', 'aria-label': 'Format' });
  const sizeBtns = new Map();
  for (const s of cat.sizes) {
    const k = 16 / Math.max(s.width, s.height);
    const b = h('button', { type: 'button', class: 'size-chip', 'aria-pressed': 'false', onclick: () => { sizeId = s.id; syncSizes(); } },
      h('i', { style: `width:${Math.round(s.width * k)}px;height:${Math.round(s.height * k)}px` }), s.label.replace(/ [0-9]+:[0-9]+/, ''));
    b.title = `${s.label} (${s.width}x${s.height})`;
    sizeBtns.set(s.id, b);
    sizeBox.appendChild(b);
  }
  function syncSizes() {
    for (const [id, b] of sizeBtns) b.setAttribute('aria-pressed', String(id === sizeId));
  }

  /* ----- durée ----- */
  const durBox = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Durée' });
  const durBtns = new Map();
  for (const d of [2, 3, 4, 5]) {
    const b = h('button', { type: 'button', role: 'radio', class: 'seg', onclick: () => { duration = d; syncDur(); updateCost(); } }, `${d} s`);
    durBtns.set(d, b);
    durBox.appendChild(b);
  }
  function syncDur() {
    for (const [d, b] of durBtns) b.setAttribute('aria-checked', String(d === duration));
  }

  /* ----- caméra ----- */
  const presetDesc = h('p', { class: 'hint', 'aria-live': 'polite' });
  const camGrid = h('div', { class: 'cam-grid' });
  const presetBtns = new Map();
  cat.cameraPresets.forEach((p, i) => {
    const b = h('button', { type: 'button', class: 'cam-card', 'aria-pressed': 'false', title: p.description, onclick: () => selectPreset(presetId === p.id ? null : p.id) },
      canvasFor({ scene: SCENES[i % 6], seed: 90 + i, cam: camFor(p.id), ratio: 1.1, width: 150, clip: clipForCam(p.id) || 'none' }), h('span', { class: 'cap' }, p.label));
    presetBtns.set(p.id, b);
    camGrid.appendChild(b);
  });
  function selectPreset(id) {
    presetId = id;
    for (const [pid, b] of presetBtns) b.setAttribute('aria-pressed', String(pid === id));
    const p = cat.cameraPresets.find((x) => x.id === id);
    presetDesc.textContent = p ? `${p.label} : ${p.description}` : '';
  }
  const cameraBox = h('div', { class: 'panel-box' }, h('span', { class: 'label' }, 'Mouvement de caméra'), camGrid, presetDesc);

  /* ----- modèles de prompt ----- */
  const tplSel = h('select', { 'aria-label': 'Modèle de prompt' });
  const tplDesc = h('p', { class: 'hint' });
  const tplVars = h('div', { class: 'stack' });
  const tplPreview = h('p', { class: 'hint', 'aria-live': 'polite' });
  tplSel.addEventListener('change', () => selectTemplate(cat.templates.find((t) => t.id === tplSel.value) || null));
  function fillTemplateOptions() {
    const k = kindNow();
    clear(tplSel);
    tplSel.appendChild(h('option', { value: '' }, 'Aucun modèle'));
    for (const t of cat.templates.filter((x) => x.kind === k)) tplSel.appendChild(h('option', { value: t.id }, t.label));
    if (template && template.kind !== k) selectTemplate(null);
    else tplSel.value = template ? template.id : '';
  }
  function selectTemplate(t) {
    template = t;
    tplValues = {};
    tplSel.value = t ? t.id : '';
    tplDesc.textContent = t ? t.description : '';
    clear(tplVars);
    if (t) {
      for (const v of t.variables) {
        const inp = h('input', { type: 'text', placeholder: v.placeholder });
        inp.addEventListener('input', () => { tplValues[v.name] = inp.value; refreshTemplate(); });
        tplVars.appendChild(field(v.label, inp));
      }
      const d = t.defaults || {};
      if (typeof d.sizeId === 'string' && cat.sizes.some((s) => s.id === d.sizeId)) { sizeId = d.sizeId; syncSizes(); }
      if (typeof d.duration === 'number') { duration = Math.min(5, Math.max(2, d.duration)); syncDur(); }
      if (typeof d.draft === 'boolean') draft.checked = d.draft;
    }
    refreshTemplate();
    updateCost();
  }
  function refreshTemplate() {
    if (!template) {
      tplPreview.textContent = '';
      prompt.disabled = false;
      prompt.placeholder = 'Décrivez ce que vous voulez voir…';
      return;
    }
    const text = fillTemplate(template.promptTemplate, tplValues);
    tplPreview.textContent = `Aperçu : ${text}`;
    prompt.value = text;
    prompt.disabled = true;
    updateCounter();
  }

  /* ----- personnages ----- */
  api.listCharacters().then(({ items }) => {
    for (const c of items) charSel.appendChild(h('option', { value: c.id }, c.name));
    if (characterId) charSel.value = characterId;
  }).catch(() => {});
  charSel.addEventListener('change', () => (characterId = charSel.value));

  /* ----- assemblage du panneau ----- */
  const tabDefs = [['image', 'Image'], ['video', 'Vidéo']];
  const tabBtns = new Map();
  const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Type de création' });
  for (const [id, label] of tabDefs) {
    const b = h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => setTab(id) }, label);
    tabBtns.set(id, b);
    tabsEl.appendChild(b);
  }
  tabsEl.appendChild(h('a', { class: 'tab', href: '#/outils' }, 'Outils'));
  const modeBtns = new Map();
  const modeEl = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Mode vidéo' });
  for (const [id, label] of [['i2v', 'Image → vidéo'], ['t2v', 'Texte → vidéo']]) {
    const b = h('button', { type: 'button', role: 'radio', class: 'seg', onclick: () => { vmode = id; refresh(); } }, label);
    modeBtns.set(id, b);
    modeEl.appendChild(b);
  }
  const refBox = h('div', { class: 'panel-box' }, inputField.el, endWrap, consentWrap);
  const promptBox = h('div', { class: 'panel-box' }, h('span', { class: 'label', id: 'plabel' }, 'Prompt'), prompt, counter,
    h('details', { class: 'collapsible' }, h('summary', {}, 'Modèles de prompt'), h('div', { class: 'stack' }, tplSel, tplDesc, tplVars, tplPreview)),
    h('details', { class: 'collapsible' }, h('summary', {}, 'Prompt négatif'), negative));
  const formatBox = h('div', { class: 'panel-box' }, h('span', { class: 'label' }, 'Format'), sizeBox);
  const durBoxWrap = h('div', { class: 'panel-box' }, h('span', { class: 'label' }, 'Durée'), durBox, h('div', { class: 'check' }, draft, h('label', { for: draft.id }, 'Brouillon (480p, plus rapide et moins cher)')));
  const advBox = h('details', { class: 'panel-box collapsible' }, h('summary', {}, 'Réglages avancés'), h('div', { class: 'stack', style: 'margin-top:.6rem' }, field('Personnage', charSel), field('Graine (seed)', seed, 'Vide : graine aléatoire.')));
  const side = h('div', { class: 'side-scroll' }, tabsEl, modeEl, modelCanvasBox, enginePick, refBox, promptBox, formatBox, durBoxWrap, cameraBox, advBox, err);
  const genBar = h('div', { class: 'gen-bar' }, h('div', { class: 'gen-row' }, countSel, submit));
  const form = h('form', { class: 'studio-side', novalidate: true }, side, genBar);

  function syncConsent() {
    const a = inputField.getAsset();
    const needs = kindNow() === 'i2v' && !!a && a.origin === 'upload';
    consentWrap.hidden = !needs;
    if (needs && inputField.getConsent()) consent.input.checked = true;
  }
  function costNow() {
    const k = kindNow();
    const e = engineNow();
    let c = e ? (tab === 'video' && draft.checked && e.draftCredits ? e.draftCredits : e.credits) : cat.costs[k] || 1;
    if (!e && tab === 'video' && draft.checked) c = Math.max(1, Math.ceil(c * 0.4));
    return c * Number(countSel.value || 1);
  }
  function updateCost() {
    submit.textContent = cfg.creditsEnabled ? `Générer ✦ ${costNow()}` : 'Générer ✦';
    submit.title = cfg.creditsEnabled && state.user ? `Solde : ${state.user.credits} crédits` : '';
  }
  function refresh() {
    const k = kindNow();
    for (const [id, b] of tabBtns) { b.setAttribute('aria-selected', String(id === tab)); b.tabIndex = id === tab ? 0 : -1; }
    for (const [id, b] of modeBtns) b.setAttribute('aria-checked', String(id === vmode));
    modeEl.hidden = tab !== 'video';
    refBox.hidden = k !== 'i2v';
    const en = engineNow();
    endWrap.hidden = !(k === 'i2v' && en && en.endImage);
    durBoxWrap.hidden = tab !== 'video';
    cameraBox.hidden = tab !== 'video';
    document.getElementById('plabel').textContent = k === 'i2v' ? 'Prompt (mouvement souhaité)' : 'Prompt';
    renderModel();
    fillTemplateOptions();
    syncSizes();
    syncDur();
    syncConsent();
    updateCost();
  }
  function setTab(t) { tab = t; clear(err); refresh(); }
  countSel.addEventListener('change', updateCost);
  draft.addEventListener('change', () => { renderModel(); updateCost(); });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(err);
    const kind = kindNow();
    const base = { kind, params: { sizeId } };
    if (tab === 'video') { base.params.duration = duration; base.params.draft = draft.checked; }
    const eng = engineNow();
    if (eng) base.params.engine = isAuto() ? 'auto' : eng.id;
    if (eng && engineSel[tab] === 'auto-premium') base.params.quality = 'premium';
    if (template) { base.templateId = template.id; base.params.variables = { ...tplValues }; }
    else {
      const p = prompt.value.trim();
      if (!p && kind !== 'i2v') { err.appendChild(errorBox('Saisissez un prompt ou choisissez un modèle.')); return; }
      if (p) base.prompt = p;
    }
    if (negative.value.trim()) base.negativePrompt = negative.value.trim();
    if (presetId && tab === 'video') base.presetId = presetId;
    if (characterId) base.characterId = characterId;
    if (kind === 'i2v') {
      const a = inputField.getAsset();
      if (!a) { err.appendChild(errorBox('Choisissez ou téléversez une image de départ.')); return; }
      base.inputAssetId = a.id;
      const endA = !endWrap.hidden ? endField.getAsset() : null;
      if (endA) base.endAssetId = endA.id;
      if (a.origin === 'upload') {
        if (!consent.input.checked) { err.appendChild(errorBox(`Cochez la case de consentement : vous devez avoir le droit d'utiliser cette image.`)); return; }
        base.consent = true;
      }
    }
    const n = Number(countSel.value || 1);
    submit.disabled = true;
    submit.textContent = 'Envoi…';
    try {
      for (let i = 0; i < n; i++) {
        const body = { ...base, params: { ...base.params } };
        if (seed.value.trim() !== '') body.params.seed = Number(seed.value) + i;
        const { job } = await api.createJob(body);
        trackJob(job);
      }
      setView('results');
      if (window.innerWidth <= 820) main.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      err.appendChild(errorBox(describeError(e)));
    } finally {
      submit.disabled = false;
      updateCost();
    }
  });

  /* ----- zone principale ----- */
  const viewBtns = new Map();
  const viewEl = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Affichage' });
  for (const [id, label] of [['history', 'Historique'], ['results', 'Résultats']]) {
    const b = h('button', { type: 'button', role: 'radio', class: 'seg', onclick: () => setView(id) }, label);
    viewBtns.set(id, b);
    viewEl.appendChild(b);
  }
  const results = h('div', { class: 'results' });
  const how = h('div', { class: 'how' },
    h('h2', {}, 'Créez des vidéos en un clic'),
    h('p', { class: 'lede' }, '22 presets de caméra et de mouvement, ou le réglage libre pour tout contrôler à la main.'),
    h('div', { class: 'steps' },
      ...[['Ajouter une image', 'Téléversez-la ou générez-la d\'abord pour démarrer l\'animation.', 'planet', 21, 'orbit', 'c08'], ['Choisir un preset', 'Un mouvement de caméra pilote le mouvement de l\'image.', 'tunnel', 14, 'zoom-in', 'c03'], ['Obtenir la vidéo', 'Lancez : la vidéo animée apparaît ici, en direct.', 'city', 33, 'pan-r', 'c06']]
        .map(([t, d, sc, sd, cm, cl]) => h('div', { class: 'step' }, canvasFor({ scene: sc, seed: sd, cam: cm, ratio: 0.75, width: 420, clip: cl, hover: true }), h('b', {}, t), h('span', {}, d)))),
    h('div', { class: 'how-foot' }, h('b', {}, 'Pas d\'idée pour commencer ?'), h('a', { href: '#/' }, 'Parcourez les créations de la page Explorer')));
  const history = h('div', { class: 'asset-grid' });
  const histStatus = h('p', { class: 'hint', 'aria-live': 'polite' });
  async function loadHistory() {
    histStatus.textContent = 'Chargement…';
    try {
      const page = await api.listAssets({ limit: 36 });
      clear(history);
      for (const a of page.items) history.appendChild(h('button', { type: 'button', class: 'asset-card asset-open', onclick: () => openViewer(a, a.kind === 'image' ? [{ label: 'Animer cette image', primary: true, onClick: (close) => { close(); location.hash = `#/studio?tab=video&mode=i2v&inputAssetId=${encodeURIComponent(a.id)}`; } }] : []) }, thumb(a)));
      histStatus.textContent = page.items.length ? '' : `Votre historique est vide. Lancez une première génération.`;
    } catch (e) {
      histStatus.textContent = describeError(e);
    }
  }
  const historyWrap = h('div', {}, history, histStatus);
  function setView(v) {
    view = v;
    for (const [id, b] of viewBtns) b.setAttribute('aria-checked', String(id === v));
    results.hidden = v !== 'results';
    historyWrap.hidden = v !== 'history';
    if (v === 'history') void loadHistory();
    syncHow();
  }
  function syncHow() { how.hidden = !(view === 'results' && state.jobs.length === 0); }
  const offPanel = mountPanel(results);

  const main = h('section', { class: 'studio-main' },
    h('div', { class: 'main-top' }, h('h1', { class: 'visually-hidden' }, 'Studio'), viewEl, realFacesNotice()),
    how, results, historyWrap);

  const inId = qs.get('inputAssetId');
  if (inId) inputField.set(stubAsset(inId), false);
  root.append(h('div', { class: 'studio' }, form, main));
  refresh();
  setView('results');
  const unsub = subscribe(() => { updateCost(); syncHow(); });
  return () => { unsub(); offPanel(); };
}
