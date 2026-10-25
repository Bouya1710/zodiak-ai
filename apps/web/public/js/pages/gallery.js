// Galerie : historique des assets, filtres, recherche, favoris, réutilisation.
import { api } from '../api.js';
import { describeError, truncate } from '../lib.js';
import { state, subscribe, trackJob } from '../state.js';
import { clear, errorBox, h, openViewer, thumb } from '../ui.js';
import { EXAMPLES, canvasFor } from '../showcase.js';

/** @typedef {import('../lib.js').Asset} Asset */

/**
 * @param {HTMLElement} root
 */
export function mount(root) {
  let filter = 'all';
  let seq = 0;
  /** @type {string|null} */
  let cursor = null;
  /** @type {Asset[]} */
  let items = [];
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;

  const grid = h('div', { class: 'asset-grid gallery-grid', role: 'list' });
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const errBox = h('div', {});
  const more = h('button', { type: 'button', class: 'btn', hidden: true }, 'Charger plus');
  const search = h('input', { type: 'search', placeholder: 'Rechercher dans les prompts…', 'aria-label': 'Rechercher par prompt' });
  const filters = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Filtrer' });
  const defs = [['all', 'Tout'], ['image', 'Images'], ['video', 'Vidéos'], ['fav', 'Favoris']];
  /** @type {Map<string, HTMLButtonElement>} */
  const fbtns = new Map();
  for (const [id, label] of defs) {
    const b = h('button', { type: 'button', role: 'radio', class: 'seg', onclick: () => {
      filter = id;
      syncFilters();
      void load(true);
    } }, label);
    fbtns.set(id, b);
    filters.appendChild(b);
  }
  function syncFilters() {
    for (const [id, b] of fbtns) b.setAttribute('aria-checked', String(id === filter));
  }

  /** @param {Asset} a */
  function card(a) {
    const fav = h('button', { type: 'button', class: 'icon-btn fav', 'aria-pressed': String(a.favorite), 'aria-label': a.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', onclick: async (/** @type {Event} */ ev) => {
      ev.stopPropagation();
      try {
        const { asset } = await api.patchAsset(a.id, { favorite: !a.favorite });
        Object.assign(a, asset);
        if (filter === 'fav' && !a.favorite) {
          items = items.filter((x) => x.id !== a.id);
          render();
        } else {
          fav.setAttribute('aria-pressed', String(a.favorite));
          fav.setAttribute('aria-label', a.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris');
          fav.textContent = a.favorite ? '★' : '☆';
        }
      } catch (e) {
        errBox.replaceChildren(errorBox(describeError(e)));
      }
    } }, a.favorite ? '★' : '☆');
    const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Supprimer', onclick: async (/** @type {Event} */ ev) => {
      ev.stopPropagation();
      if (!confirm('Supprimer définitivement ce média ?')) return;
      try {
        await api.deleteAsset(a.id);
        items = items.filter((x) => x.id !== a.id);
        render();
      } catch (e) {
        errBox.replaceChildren(errorBox(describeError(e)));
      }
    } }, '🗑');
    const dl = h('a', { class: 'icon-btn', href: a.url, download: '', 'aria-label': 'Télécharger', onclick: (/** @type {Event} */ ev) => ev.stopPropagation() }, '⬇');
    const open = h('button', { type: 'button', class: 'asset-open', 'aria-label': `Ouvrir : ${truncate(a.prompt || a.title || a.id, 60)}`, onclick: () => view(a) }, thumb(a));
    return h('div', { class: 'asset-card gallery-card', role: 'listitem' }, open, h('div', { class: 'card-tools' }, fav, dl, del));
  }

  /** @param {Asset} a */
  function view(a) {
    /** @type {{label: string, onClick: (close: () => void) => void, primary?: boolean}[]} */
    const actions = [];
    if (a.prompt) {
      actions.push({ label: 'Réutiliser ce prompt', primary: true, onClick: (close) => {
        close();
        const tab = a.kind === 'video' ? 'video&mode=t2v' : 'image';
        location.hash = `#/studio?tab=${tab}&prompt=${encodeURIComponent(a.prompt || '')}`;
      } });
    }
    if (a.kind === 'image') {
      actions.push({ label: 'Animer', onClick: (close) => {
        close();
        location.hash = `#/studio?tab=video&mode=i2v&inputAssetId=${encodeURIComponent(a.id)}`;
      } });
      actions.push({ label: 'Agrandir x2', onClick: async (close) => {
        try {
          const { job } = await api.createJob({ kind: 'upscale', inputAssetId: a.id, params: { scale: 2 }, consent: a.origin === 'upload' ? true : undefined });
          trackJob(job);
          close();
        } catch (e) {
          alert(describeError(e));
        }
      } });
    }
    openViewer(a, actions);
  }

  function render() {
    clear(grid);
    for (const a of items) grid.appendChild(card(a));
    more.hidden = !cursor;
  }

  /** @param {boolean} reset */
  async function load(reset) {
    const mine = ++seq;
    if (reset) {
      cursor = null;
      items = [];
      render();
    }
    clear(errBox);
    status.textContent = 'Chargement…';
    more.disabled = true;
    try {
      const page = await api.listAssets({
        kind: filter === 'image' || filter === 'video' ? filter : undefined,
        favorite: filter === 'fav',
        q: search.value.trim(),
        limit: 24,
        cursor,
      });
      if (mine !== seq) return;
      items = items.concat(page.items);
      cursor = page.nextCursor;
      render();
      wall.hidden = !(items.length === 0 && filter === 'all' && !search.value.trim());
      status.textContent = items.length ? '' : filter === 'all' && !search.value.trim() ? 'Votre galerie est vide. Lancez une génération depuis le Studio.' : 'Aucun résultat pour ces filtres.';
    } catch (e) {
      if (mine !== seq) return;
      status.textContent = '';
      errBox.replaceChildren(errorBox(describeError(e)));
    } finally {
      more.disabled = false;
    }
  }

  more.addEventListener('click', () => void load(false));
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(true), 300);
  });

  const wall = h('section', { class: 'empty-wall', hidden: true },
    h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, `Pas encore de création ? Voici de l'inspiration`), h('p', {}, 'Exemples réalisés avec ZODIAK AI.')), h('a', { class: 'btn btn-primary', href: '#/studio' }, 'Créer ma première œuvre')),
    h('div', { class: 'mosaic' }, ...EXAMPLES.slice(0, 8).map((e) => h('figure', {}, canvasFor({ scene: e.scene, seed: e.seed, cam: e.cam, ratio: e.ratio, width: 320, clip: e.clip }), h('span', { class: 'kind' }, e.kind === 'video' ? '▶ Vidéo' : 'Image'), h('figcaption', {}, h('b', {}, e.t), h('br'), e.p)))));
  syncFilters();
  root.append(
    h('header', { class: 'page-head' }, h('h1', {}, 'Galerie'), h('p', { class: 'lede' }, 'Tout ce que vous avez créé ou téléversé.')),
    h('div', { class: 'toolbar' }, filters, search),
    errBox,
    grid,
    status,
    wall,
    h('div', { class: 'center' }, more),
  );
  void load(true);

  let lastTick = state.doneTick;
  const unsub = subscribe(() => {
    if (state.doneTick !== lastTick) {
      lastTick = state.doneTick;
      void load(true);
    }
  });
  return () => {
    unsub();
    clearTimeout(timer);
    seq++;
  };
}
