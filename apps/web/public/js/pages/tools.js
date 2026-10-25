// Outils : agrandissement, interpolation, lip-sync, montage et découpe.
import { api } from '../api.js';
import { describeError, truncate } from '../lib.js';
import { trackJob } from '../state.js';
import { assetField, clear, consentBox, errorBox, field, h, nextId, pickAsset, realFacesNotice, thumb } from '../ui.js';

/** @typedef {import('../lib.js').Asset} Asset */

/**
 * Enveloppe commune : titre, description, zone d'erreur, bouton.
 * @param {{title: string, desc: string, submitLabel: string, body: HTMLElement[], run: () => Promise<import('../api.js').CreateJobBody|string>}} o
 */
function toolCard(o) {
  const err = h('div', { 'aria-live': 'polite' });
  const ok = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, o.submitLabel);
  const form = h('form', { class: 'card stack tool', novalidate: true }, h('h2', {}, o.title), h('p', { class: 'hint' }, o.desc), ...o.body, err, ok, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(err);
    clear(ok);
    const res = await o.run();
    if (typeof res === 'string') {
      err.appendChild(errorBox(res));
      return;
    }
    btn.disabled = true;
    try {
      const { job } = await api.createJob(res);
      trackJob(job);
      ok.appendChild(h('div', { class: 'alert alert-ok', role: 'status' }, `Job lancé. Suivez-le dans le Studio (Résultats) ou retrouvez-le dans la Galerie.`));
    } catch (e) {
      err.appendChild(errorBox(describeError(e)));
    } finally {
      btn.disabled = false;
    }
  });
  return form;
}

/**
 * Bouton radio segmenté.
 * @param {string} label
 * @param {{value: string, label: string}[]} opts
 * @param {string} initial
 */
function segmented(label, opts, initial) {
  let value = initial;
  const el = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  /** @type {HTMLButtonElement[]} */
  const btns = [];
  for (const o of opts) {
    const b = h('button', { type: 'button', role: 'radio', class: 'seg', onclick: () => {
      value = o.value;
      sync();
    } }, o.label);
    btns.push(b);
    el.appendChild(b);
  }
  function sync() {
    opts.forEach((o, i) => btns[i].setAttribute('aria-checked', String(o.value === value)));
  }
  sync();
  return { el, get: () => value };
}

/**
 * @param {HTMLElement} root
 */
export function mount(root) {
  // 1. Agrandissement
  const upAsset = assetField({ kind: 'media', label: 'Image ou vidéo à agrandir' });
  const upScale = segmented('Facteur', [{ value: '2', label: 'x2' }, { value: '4', label: 'x4' }], '2');
  const upscale = toolCard({
    title: 'Agrandir (upscale)',
    desc: 'Augmente la définition d’une image ou d’une vidéo.',
    submitLabel: 'Agrandir',
    body: [upAsset.el, h('div', { class: 'field' }, h('span', { class: 'label' }, 'Facteur'), upScale.el)],
    run: async () => {
      const a = upAsset.getAsset();
      if (!a) return 'Choisissez un média à agrandir.';
      return { kind: 'upscale', inputAssetId: a.id, params: { scale: Number(upScale.get()) }, consent: a.origin === 'upload' && upAsset.getConsent() ? true : undefined };
    },
  });

  // 2. Interpolation
  const ipAsset = assetField({ kind: 'video', label: 'Vidéo à fluidifier' });
  const interp = toolCard({
    title: 'Interpolation d’images',
    desc: 'Double le nombre d’images (facteur 2) pour un mouvement plus fluide.',
    submitLabel: 'Interpoler (x2)',
    body: [ipAsset.el],
    run: async () => {
      const a = ipAsset.getAsset();
      if (!a) return 'Choisissez une vidéo.';
      return { kind: 'interpolate', inputAssetId: a.id, params: { factor: 2 } };
    },
  });

  // 3. Lip-sync
  const lsVideo = assetField({ kind: 'video', label: 'Vidéo (visage à animer)' });
  const lsAudio = assetField({ kind: 'audio', label: 'Piste audio (voix)' });
  const lsConsent = consentBox("J'ai le droit d'utiliser cette image (visages réels : voir l'avertissement)");
  const lipsync = toolCard({
    title: 'Lip-sync',
    desc: 'Synchronise les lèvres d’une vidéo sur une piste audio.',
    submitLabel: 'Lancer le lip-sync',
    body: [realFacesNotice(), lsVideo.el, lsAudio.el, lsConsent.el],
    run: async () => {
      const v = lsVideo.getAsset();
      const au = lsAudio.getAsset();
      if (!v) return 'Choisissez une vidéo.';
      if (!au) return 'Choisissez ou téléversez une piste audio.';
      if (!lsConsent.input.checked) return "Cochez la case de consentement : vous devez avoir le droit d'utiliser ce visage.";
      return { kind: 'lipsync', inputAssetId: v.id, audioAssetId: au.id, consent: true };
    },
  });

  // 4. Montage : ordre des vidéos
  /** @type {Asset[]} */
  let clips = [];
  const clipList = h('ol', { class: 'clip-list' });
  function renderClips() {
    clear(clipList);
    if (!clips.length) clipList.appendChild(h('li', { class: 'hint' }, 'Aucune vidéo sélectionnée (2 minimum).'));
    clips.forEach((c, i) => {
      const mv = (/** @type {number} */ d) => () => {
        const j = i + d;
        if (j < 0 || j >= clips.length) return;
        [clips[i], clips[j]] = [clips[j], clips[i]];
        renderClips();
      };
      clipList.appendChild(
        h('li', { class: 'clip' }, thumb(c, 'thumb thumb-sm'), h('span', { class: 'clip-name' }, truncate(c.title || c.prompt, 50) || `Vidéo ${i + 1}`),
          h('span', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Monter', disabled: i === 0, onclick: mv(-1) }, '↑'),
            h('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Descendre', disabled: i === clips.length - 1, onclick: mv(1) }, '↓'),
            h('button', { type: 'button', class: 'btn btn-small btn-ghost', 'aria-label': 'Retirer', onclick: () => {
              clips.splice(i, 1);
              renderClips();
            } }, '✕'))),
      );
    });
  }
  const addClip = h('button', { type: 'button', class: 'btn', onclick: async () => {
    const a = await pickAsset('video');
    if (a) {
      clips.push(a);
      renderClips();
    }
  } }, 'Ajouter une vidéo');
  renderClips();
  const concat = toolCard({
    title: 'Montage (assembler)',
    desc: 'Assemble plusieurs vidéos bout à bout, dans l’ordre choisi.',
    submitLabel: 'Assembler',
    body: [clipList, h('div', { class: 'btn-row' }, addClip)],
    run: async () => {
      if (clips.length < 2) return 'Sélectionnez au moins deux vidéos.';
      return { kind: 'concat', params: { assetIds: clips.map((c) => c.id) }, inputAssetId: clips[0].id };
    },
  });

  // 5. Découpe
  const trAsset = assetField({ kind: 'video', label: 'Vidéo à découper', onChange: () => syncTrim() });
  const start = h('input', { type: 'range', min: '0', max: '10', step: '0.1', value: '0' });
  const end = h('input', { type: 'range', min: '0', max: '10', step: '0.1', value: '10' });
  const startOut = h('output', {}, '0 s');
  const endOut = h('output', {}, '10 s');
  function syncTrim() {
    const a = trAsset.getAsset();
    const max = a && a.duration ? a.duration : 10;
    start.max = end.max = String(max);
    if (Number(end.value) > max || !a) end.value = String(max);
    if (Number(start.value) > max) start.value = '0';
    showTrim();
  }
  function showTrim() {
    startOut.textContent = `${Number(start.value).toFixed(1)} s`;
    endOut.textContent = `${Number(end.value).toFixed(1)} s`;
  }
  start.addEventListener('input', showTrim);
  end.addEventListener('input', showTrim);
  const trim = toolCard({
    title: 'Découpe (trim)',
    desc: 'Ne garde qu’un extrait de la vidéo, entre un début et une fin.',
    submitLabel: 'Découper',
    body: [
      trAsset.el,
      h('div', { class: 'field' }, h('label', { for: (start.id = nextId('start')) }, 'Début'), h('div', { class: 'range-row' }, start, startOut)),
      h('div', { class: 'field' }, h('label', { for: (end.id = nextId('end')) }, 'Fin'), h('div', { class: 'range-row' }, end, endOut)),
    ],
    run: async () => {
      const a = trAsset.getAsset();
      if (!a) return 'Choisissez une vidéo.';
      const s = Number(start.value);
      const e = Number(end.value);
      if (!(e > s)) return 'La fin doit être après le début.';
      return { kind: 'trim', inputAssetId: a.id, params: { start: s, end: e } };
    },
  });

  root.append(
    h('header', { class: 'page-head' }, h('h1', {}, 'Outils'), h('p', { class: 'lede' }, 'Retouchez et assemblez vos médias. Chaque outil lance un job suivi dans la file.')),
    h('div', { class: 'tools-grid' }, upscale, interp, lipsync, concat, trim),
  );
  return () => {};
}
