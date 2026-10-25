// Suivi d'un job : EventSource d'abord, repli sur sondage GET /api/jobs/:id toutes les 1,5 s.
import { api } from './api.js';
import { ApiError, isTerminal } from './lib.js';

/** @typedef {import('./lib.js').Job} Job */

const POLL_MS = 1500;
const SILENCE_MS = 6000;

/**
 * @param {string} data
 * @returns {any}
 */
function parse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Renvoie une fonction d'arrêt.
 * @param {string} id
 * @param {{onUpdate: (patch: Partial<Job>) => void, onDone: (job: Job) => void}} h
 * @returns {() => void}
 */
export function watchJob(id, h) {
  let stopped = false;
  /** @type {EventSource|null} */
  let es = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let pollTimer = null;
  /** @type {ReturnType<typeof setInterval>|null} */
  let watchdog = null;
  let lastEvent = Date.now();

  const stop = () => {
    stopped = true;
    if (es) es.close();
    es = null;
    if (pollTimer) clearTimeout(pollTimer);
    if (watchdog) clearInterval(watchdog);
    pollTimer = null;
    watchdog = null;
  };

  /** @param {Job} job */
  const finish = (job) => {
    if (stopped) return;
    stop();
    h.onDone(job);
  };

  const poll = async () => {
    if (stopped) return;
    try {
      const { job } = await api.getJob(id);
      if (stopped) return;
      h.onUpdate(job);
      if (isTerminal(job.status)) {
        finish(job);
        return;
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) {
        stop();
        return;
      }
    }
    pollTimer = setTimeout(poll, POLL_MS);
  };

  const startPolling = () => {
    if (stopped || pollTimer) return;
    pollTimer = setTimeout(poll, 0);
  };

  if (typeof EventSource === 'undefined') {
    startPolling();
    return stop;
  }

  es = new EventSource(`/api/jobs/${encodeURIComponent(id)}/events`);
  es.addEventListener('progress', (ev) => {
    lastEvent = Date.now();
    const d = parse(/** @type {MessageEvent} */ (ev).data);
    if (!d) return;
    /** @type {Partial<Job>} */
    const patch = {};
    if (d.status) patch.status = d.status;
    if (typeof d.progress === 'number') patch.progress = d.progress;
    if (typeof d.message === 'string') patch.message = d.message;
    h.onUpdate(patch);
  });
  es.addEventListener('done', (ev) => {
    lastEvent = Date.now();
    const d = parse(/** @type {MessageEvent} */ (ev).data);
    if (d && d.job) finish(d.job);
    else startPolling();
  });
  es.onerror = () => {
    // Coupure, proxy, 404 : on ferme le flux et on bascule sur le sondage.
    if (es) es.close();
    es = null;
    startPolling();
  };
  // Flux ouvert mais muet (proxy qui met en tampon) : on sonde en parallèle.
  watchdog = setInterval(() => {
    if (Date.now() - lastEvent > SILENCE_MS) startPolling();
  }, 2000);

  return stop;
}
