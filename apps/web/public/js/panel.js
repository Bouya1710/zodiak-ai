// Panneau « File de jobs » : statuts, progression, annulation, résultats.
import { KIND_LABEL, STATUS_LABEL, isTerminal, truncate } from './lib.js';
import { api } from './api.js';
import { cancelJob, loadJobAssets, removeJob, setPanelOpen, state, subscribe, trackJob } from './state.js';
import { clear, errorBox, h, openViewer, thumb } from './ui.js';

/** @typedef {import('./lib.js').Job} Job */

/**
 * Rendu final proposé sous un brouillon terminé, coût affiché d'abord (même règle que le serveur).
 * @param {Job} j
 */
function finalOptions(j) {
  const p = /** @type {Record<string, any>} */ (j.params || {});
  const engines = (state.catalog && state.catalog.engines) || [];
  if (j.status !== 'done' || !p.draft || !engines.length) return [];
  const list = engines.filter((e) => e.kinds.includes(j.kind) && (!p.endAssetId || e.endImage));
  const same = list.find((e) => e.id === p.engine);
  const prem = list.filter((e) => e.premium).sort((a, b) => a.credits - b.credits)[0];
  return [
    ...(same ? [{ label: 'Rendu final', credits: same.credits, body: {} }] : []),
    ...(prem ? [{ label: `Final ${prem.name}`, credits: prem.credits, body: { quality: 'premium' } }] : []),
  ];
}

/**
 * @param {HTMLElement} root
 */
export function mountPanel(root) {
  const list = h('ul', { class: 'job-list' });
  const empty = h('p', { class: 'empty' }, 'Aucun job pour le moment. Lancez une génération depuis le Studio.');
  const live = h('div', { class: 'visually-hidden', 'aria-live': 'polite', role: 'status' });
  const closeBtn = h('button', { type: 'button', class: 'btn btn-ghost panel-close', 'aria-label': 'Fermer la file de jobs', onclick: () => setPanelOpen(false) }, '✕');
  root.append(h('header', { class: 'panel-head' }, h('h2', {}, 'File de jobs'), closeBtn), live, empty, list);
  root.setAttribute('aria-label', 'File de jobs');

  /** @type {Map<string, {el: HTMLElement, update: (j: Job) => void}>} */
  const rows = new Map();
  /** @type {Map<string, JobStatusSeen>} */
  const seen = new Map();
  /** @typedef {string} JobStatusSeen */
  const requested = new Set();

  /** @param {Job} job */
  function createRow(job) {
    const chip = h('span', { class: 'chip' });
    const cache = h('span', { class: 'chip chip-cache', title: 'Résultat réutilisé depuis le cache (coût 0)' }, 'cache');
    const title = h('strong', {}, KIND_LABEL[job.kind] || job.kind);
    const prompt = h('p', { class: 'job-prompt' });
    const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { class: 'progress-fill' }));
    const fill = /** @type {HTMLElement} */ (bar.firstElementChild);
    const msg = h('p', { class: 'job-msg hint' });
    const err = h('div', {});
    const results = h('div', { class: 'job-results' });
    const actions = h('div', { class: 'btn-row' });
    const el = h('li', { class: 'job' }, h('div', { class: 'job-head' }, title, chip, cache), prompt, bar, msg, err, results, actions);

    /** @param {Job} j */
    function update(j) {
      el.dataset.status = j.status;
      chip.textContent = STATUS_LABEL[j.status] || j.status;
      chip.className = `chip chip-${j.status}`;
      title.textContent = KIND_LABEL[j.kind] || j.kind;
      cache.hidden = !j.cacheHit;
      prompt.textContent = truncate(j.prompt, 110);
      prompt.hidden = !j.prompt;
      const active = !isTerminal(j.status);
      bar.hidden = !active;
      const p = Math.max(0, Math.min(100, Math.round(j.progress || 0)));
      bar.setAttribute('aria-valuenow', String(p));
      bar.setAttribute('aria-label', `Progression : ${p} %`);
      fill.style.width = `${j.status === 'queued' ? 4 : p}%`;
      if (j.status === 'running') chip.textContent = `${STATUS_LABEL.running} · ${p} %`;

      msg.textContent = active && j.message ? j.message : '';
      msg.hidden = !msg.textContent;
      clear(err);
      if ((j.status === 'failed' || j.status === 'blocked') && j.error) err.appendChild(errorBox(j.error));

      clear(results);
      const assets = state.jobAssets[j.id];
      if (j.status === 'done') {
        if (!assets && !requested.has(j.id) && requested.size < 40) {
          requested.add(j.id);
          loadJobAssets(j.id);
        }
        for (const a of assets || []) {
          results.appendChild(
            h('button', { type: 'button', class: 'result-btn', 'aria-label': 'Ouvrir le résultat', onclick: () => openViewer(a) }, thumb(a, 'thumb thumb-sm')),
          );
        }
      }

      clear(actions);
      if (active) {
        actions.appendChild(
          h('button', { type: 'button', class: 'btn btn-small', onclick: async (/** @type {Event} */ ev) => {
            const b = /** @type {HTMLButtonElement} */ (ev.currentTarget);
            b.disabled = true;
            try {
              await cancelJob(j.id);
            } catch (e) {
              b.disabled = false;
              clear(err);
              err.appendChild(errorBox(e));
            }
          } }, 'Annuler'),
        );
      } else {
        for (const f of finalOptions(j)) {
          actions.appendChild(h('button', { type: 'button', class: 'btn btn-small btn-primary', onclick: async (/** @type {Event} */ ev) => {
            const b = /** @type {HTMLButtonElement} */ (ev.currentTarget);
            b.disabled = true;
            try {
              trackJob((await api.finalJob(j.id, f.body)).job);
            } catch (e) {
              b.disabled = false;
              clear(err);
              err.appendChild(errorBox(e));
            }
          } }, `${f.label} ✦ ${f.credits}`));
        }
        actions.appendChild(
          h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: async () => {
            try {
              await removeJob(j.id);
            } catch (e) {
              clear(err);
              err.appendChild(errorBox(e));
            }
          } }, 'Retirer'),
        );
      }

      const prev = seen.get(j.id);
      if (prev && prev !== j.status) live.textContent = `${KIND_LABEL[j.kind] || j.kind} : ${STATUS_LABEL[j.status] || j.status}`;
      seen.set(j.id, j.status);
    }
    update(job);
    return { el, update };
  }

  function render() {
    const jobs = state.jobs;
    empty.hidden = jobs.length > 0;
    const ids = new Set(jobs.map((j) => j.id));
    for (const [id, r] of rows) {
      if (!ids.has(id)) {
        r.el.remove();
        rows.delete(id);
      }
    }
    let prev = /** @type {HTMLElement|null} */ (null);
    for (const j of jobs) {
      let r = rows.get(j.id);
      if (!r) {
        r = createRow(j);
        rows.set(j.id, r);
      } else {
        r.update(j);
      }
      // ordre : le plus récent en haut
      const expected = prev ? prev.nextElementSibling : list.firstElementChild;
      if (expected !== r.el) list.insertBefore(r.el, expected);
      prev = r.el;
    }
    root.classList.toggle('open', state.panelOpen);
  }

  render();
  return subscribe(render);
}
