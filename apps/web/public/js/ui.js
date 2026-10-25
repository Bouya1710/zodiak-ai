// Petits composants DOM réutilisables (sans framework).
import { api } from './api.js';
import { describeError, formatDate, truncate } from './lib.js';
import { state } from './state.js';

/** @typedef {import('./lib.js').Asset} Asset */

/**
 * Création d'élément : h('div', { class: 'x', onclick: fn }, 'texte', enfant)
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [props]
 * @param {...(Node|string|number|null|undefined|false)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' || k.startsWith('aria-') || k.startsWith('data-') || k === 'for' || k === 'role') {
      el.setAttribute(k, v === true ? '' : String(v));
    } else if (k in el) /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

/**
 * @param {Node} el
 * @param {Array<Node|string|number|null|undefined|false>} children
 */
export function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

/** @param {Element} el */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let uid = 0;
export const nextId = (prefix = 'f') => `${prefix}-${++uid}`;

/**
 * Champ de formulaire avec étiquette associée.
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string} [hint]
 */
export function field(label, control, hint) {
  if (!control.id) control.id = nextId();
  const wrap = h('div', { class: 'field' }, h('label', { for: control.id }, label));
  wrap.appendChild(control);
  if (hint) {
    const hid = nextId('hint');
    wrap.appendChild(h('p', { class: 'hint', id: hid }, hint));
    control.setAttribute('aria-describedby', hid);
  }
  return wrap;
}

/** Marque originale : un anneau de douze points (cadran) traversé d'une constellation en étoile à quatre branches. */
export function logo(size = 28) {
  // Logo : coque, mât et pavillon pirate, traversés par un Z (choix du 26/10, variante B).
  const s = h('span', { class: 'logo-mark', 'aria-hidden': 'true' });
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="8" fill="#1a1a1a"/><path d="M16 4v8" stroke="#f5f5f5" stroke-width="1.3"/><path d="M16 3.8h6.6l-1.7 2 1.7 2H16z" fill="#f5f5f5"/><path d="M4.5 19.5h23l-3 5.8h-17z" fill="#f5f5f5"/><path d="M9 12.5h14L9 27h14" fill="none" stroke="#1a1a1a" stroke-width="4.6"/><path d="M9 12.5h14L9 27h14" fill="none" stroke="#f5f5f5" stroke-width="2.4"/></svg>`;
  return s;
}

/** Nom de marque. */
export function wordmark() {
  return h('span', { class: 'brand-name' }, 'ZODIAK');
}

/**
 * Encart d'erreur (role=alert).
 * @param {unknown} e
 */
export function errorBox(e) {
  return h('div', { class: 'alert alert-error', role: 'alert' }, typeof e === 'string' ? e : describeError(e));
}

/** Avertissement permanent « visages réels ». */
export function realFacesNotice() {
  const txt = state.config?.notices.realFaces;
  return h(
    'aside',
    { class: 'notice', 'aria-label': 'Avertissement visages réels' },
    h('strong', {}, 'Visages réels. '),
    txt || "N'utilisez que des images dont vous avez les droits. Les visages de personnes réelles exigent leur accord.",
  );
}

/** Texte de consentement imposé. */
export const CONSENT_LABEL = "J'ai le droit d'utiliser cette image (visages réels : voir l'avertissement)";

/**
 * Case de consentement.
 * @param {string} [label]
 */
export function consentBox(label = CONSENT_LABEL) {
  const input = h('input', { type: 'checkbox', id: nextId('consent') });
  const el = h('div', { class: 'check consent' }, input, h('label', { for: input.id }, label));
  return { el, input };
}

/**
 * Modale accessible (Échap, focus restauré).
 * @param {{title: string, wide?: boolean, onClose?: () => void}} opts
 */
export function openModal(opts) {
  const previous = /** @type {HTMLElement|null} */ (document.activeElement);
  const titleId = nextId('modal-title');
  const body = h('div', { class: 'modal-body' });
  const closeBtn = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Fermer' }, '✕');
  const dialog = h(
    'div',
    { class: `modal${opts.wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('header', { class: 'modal-head' }, h('h2', { id: titleId }, opts.title), closeBtn),
    body,
  );
  const overlay = h('div', { class: 'overlay' }, dialog);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    document.body.classList.remove('no-scroll');
    if (previous && previous.focus) previous.focus();
    if (opts.onClose) opts.onClose();
  }
  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    } else if (ev.key === 'Tab') {
      const f = /** @type {HTMLElement[]} */ ([...dialog.querySelectorAll('button, [href], input, select, textarea, video, [tabindex]:not([tabindex="-1"])')]).filter(
        (x) => !x.hasAttribute('disabled'),
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('mousedown', (ev) => {
    if (ev.target === overlay) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  closeBtn.focus();
  return { body, close, dialog };
}

/**
 * Vignette d'un asset.
 * @param {Asset} a
 * @param {string} [cls]
 */
export function thumb(a, cls = 'thumb') {
  const box = h('span', { class: cls });
  if (a.kind === 'audio') {
    box.appendChild(h('span', { class: 'thumb-audio', 'aria-hidden': 'true' }, '♪'));
  } else if (a.thumbUrl) {
    box.appendChild(h('img', { src: a.thumbUrl, alt: a.prompt ? truncate(a.prompt, 80) : a.title || 'Aperçu', loading: 'lazy' }));
  } else if (a.kind === 'video') {
    box.appendChild(h('video', { src: a.url, preload: 'metadata', muted: true, 'aria-hidden': 'true' }));
  } else {
    box.appendChild(h('img', { src: a.url, alt: a.title || 'Aperçu', loading: 'lazy' }));
  }
  if (a.kind === 'video') box.appendChild(h('span', { class: 'play-badge', 'aria-hidden': 'true' }, '▶'));
  return box;
}

/**
 * Visionneuse (lightbox). `actions` ajoute des boutons sous le média.
 * @param {Asset} asset
 * @param {{label: string, onClick: (close: () => void) => void, primary?: boolean}[]} [actions]
 */
export function openViewer(asset, actions = []) {
  const m = openModal({ title: asset.title || (asset.kind === 'video' ? 'Vidéo' : asset.kind === 'audio' ? 'Audio' : 'Image'), wide: true });
  /** @type {HTMLElement} */
  let media;
  if (asset.kind === 'video') media = h('video', { src: asset.url, controls: true, loop: true, autoplay: true, playsInline: true, class: 'viewer-media' });
  else if (asset.kind === 'audio') media = h('audio', { src: asset.url, controls: true, class: 'viewer-audio' });
  else media = h('img', { src: asset.url, alt: asset.prompt || asset.title || 'Image générée', class: 'viewer-media' });
  m.body.appendChild(h('div', { class: 'viewer-stage' }, media));
  const meta = [];
  if (asset.width && asset.height) meta.push(`${asset.width}×${asset.height}`);
  if (asset.duration) meta.push(`${Math.round(asset.duration * 10) / 10} s`);
  meta.push(asset.origin === 'upload' ? 'Téléversé' : 'Généré');
  if (asset.createdAt) meta.push(formatDate(asset.createdAt));
  m.body.appendChild(h('p', { class: 'meta' }, meta.join(' · ')));
  if (asset.prompt) m.body.appendChild(h('blockquote', { class: 'prompt-quote' }, asset.prompt));
  const bar = h('div', { class: 'btn-row' });
  bar.appendChild(h('a', { class: 'btn', href: asset.url, download: '' }, 'Télécharger'));
  for (const a of actions) {
    bar.appendChild(h('button', { type: 'button', class: `btn${a.primary ? ' btn-primary' : ''}`, onclick: () => a.onClick(m.close) }, a.label));
  }
  m.body.appendChild(bar);
  return m;
}

/**
 * Sélecteur d'asset dans la galerie (modale). Résout avec l'asset choisi ou null.
 * @param {'image'|'video'|'audio'|'media'} kind
 * @returns {Promise<Asset|null>}
 */
export function pickAsset(kind) {
  return new Promise((resolve) => {
    const titles = { image: 'Choisir une image', video: 'Choisir une vidéo', audio: 'Choisir un audio', media: 'Choisir un média' };
    let picked = false;
    const m = openModal({ title: titles[kind], wide: true, onClose: () => !picked && resolve(null) });
    const grid = h('div', { class: 'asset-grid', role: 'list' });
    const status = h('p', { class: 'hint', 'aria-live': 'polite' });
    const more = h('button', { type: 'button', class: 'btn', hidden: true }, 'Charger plus');
    const search = h('input', { type: 'search', placeholder: 'Rechercher dans les prompts…' });
    let cursor = /** @type {string|null} */ (null);
    let timer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);
    let seq = 0;
    /** @param {boolean} reset */
    async function load(reset) {
      const mine = ++seq;
      if (reset) {
        clear(grid);
        cursor = null;
      }
      status.textContent = 'Chargement…';
      try {
        const page = await api.listAssets({ kind: kind === 'media' ? undefined : kind, q: search.value.trim(), limit: 24, cursor });
        if (mine !== seq) return;
        const items = kind === 'media' ? page.items.filter((a) => a.kind !== 'audio') : page.items;
        for (const a of items) {
          const b = h(
            'button',
            {
              type: 'button',
              class: 'asset-card',
              role: 'listitem',
              'aria-label': `Choisir ${a.title || truncate(a.prompt, 50) || a.id}`,
              onclick: () => {
                picked = true;
                resolve(a);
                m.close();
              },
            },
            thumb(a),
          );
          grid.appendChild(b);
        }
        cursor = page.nextCursor;
        more.hidden = !cursor;
        status.textContent = grid.children.length ? '' : 'Aucun média pour le moment. Générez ou téléversez-en un.';
      } catch (e) {
        if (mine === seq) status.textContent = describeError(e);
      }
    }
    more.addEventListener('click', () => void load(false));
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(true), 300);
    });
    m.body.append(field('Recherche', search), grid, status, more);
    void load(true);
  });
}

/**
 * Champ « média » : choisir dans la galerie ou téléverser (avec consentement).
 * @param {{kind: 'image'|'video'|'audio'|'media', label: string, onChange?: (a: Asset|null) => void}} opts
 */
export function assetField(opts) {
  /** @type {Asset|null} */
  let asset = null;
  let consent = false;
  const preview = h('div', { class: 'asset-preview', 'aria-live': 'polite' });
  const err = h('div', {});
  const accept = opts.kind === 'image' ? 'image/*' : opts.kind === 'video' ? 'video/*' : opts.kind === 'audio' ? 'audio/*' : 'image/*,video/*';
  const fileInput = h('input', { type: 'file', accept, 'aria-label': 'Fichier à téléverser', id: nextId('file') });
  const needsConsent = opts.kind !== 'audio';
  const cb = consentBox(opts.kind === 'video' ? "J'ai le droit d'utiliser cette vidéo (visages réels : voir l'avertissement)" : CONSENT_LABEL);
  const upBtn = h('button', { type: 'button', class: 'btn' }, 'Téléverser');
  const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost', hidden: true }, 'Retirer');
  const upBox = h('div', { class: 'upload-box', hidden: true }, fileInput, needsConsent ? cb.el : null);

  function renderPreview() {
    clear(preview);
    clearBtn.hidden = !asset;
    if (!asset) {
      preview.appendChild(h('span', { class: 'hint' }, 'Aucun fichier sélectionné.'));
      return;
    }
    preview.append(thumb(asset, 'thumb thumb-sm'), h('span', {}, asset.title || truncate(asset.prompt, 60) || (asset.kind === 'audio' ? 'Audio' : 'Média sélectionné')));
  }

  /** @param {Asset|null} a @param {boolean} [c] */
  function set(a, c = false) {
    asset = a;
    consent = c;
    renderPreview();
    if (opts.onChange) opts.onChange(a);
  }

  const pickBtn = h('button', { type: 'button', class: 'btn', onclick: async () => {
    const a = await pickAsset(opts.kind);
    if (a) set(a, false);
  } }, 'Choisir dans la galerie');
  const showUp = h('button', { type: 'button', class: 'btn', onclick: () => {
    upBox.hidden = !upBox.hidden;
  } }, 'Téléverser un fichier…');

  upBtn.addEventListener('click', async () => {
    clear(err);
    const f = fileInput.files && fileInput.files[0];
    if (!f) {
      err.appendChild(errorBox('Choisissez d’abord un fichier.'));
      return;
    }
    const max = state.config?.limits.maxUploadMb;
    if (max && f.size > max * 1024 * 1024) {
      err.appendChild(errorBox(`Fichier trop volumineux (maximum ${max} Mo).`));
      return;
    }
    if (needsConsent && !cb.input.checked) {
      err.appendChild(errorBox('Cochez la case de consentement pour téléverser.'));
      return;
    }
    upBtn.disabled = true;
    upBtn.textContent = 'Envoi…';
    try {
      const { asset: a } = await api.uploadAsset(f, needsConsent ? cb.input.checked : false);
      set(a, needsConsent);
      upBox.hidden = true;
      fileInput.value = '';
    } catch (e) {
      err.appendChild(errorBox(e));
    } finally {
      upBtn.disabled = false;
      upBtn.textContent = 'Téléverser';
    }
  });
  upBox.appendChild(upBtn);
  clearBtn.addEventListener('click', () => set(null));
  renderPreview();

  const el = h('div', { class: 'asset-field' }, h('span', { class: 'label' }, opts.label), preview, h('div', { class: 'btn-row' }, pickBtn, showUp, clearBtn), upBox, err);
  return {
    el,
    getAsset: () => asset,
    /** Vrai si l'utilisateur a coché le consentement lors d'un téléversement dans cette session. */
    getConsent: () => consent,
    set,
  };
}
