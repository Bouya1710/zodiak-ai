// État global léger : config, utilisateur, catalogue, file de jobs. Abonnement par callbacks.
import { api } from './api.js';
import { ApiError, describeError, isTerminal } from './lib.js';
import { watchJob } from './watch.js';

/**
 * @typedef {import('./lib.js').Job} Job
 * @typedef {import('./lib.js').Asset} Asset
 * @typedef {import('./lib.js').User} User
 * @typedef {import('./lib.js').AppConfig} AppConfig
 * @typedef {import('./lib.js').Catalog} Catalog
 */

/**
 * @type {{
 *  ready: boolean, loadError: string|null, config: AppConfig|null, catalog: Catalog|null,
 *  user: User|null, jobs: Job[], jobAssets: Record<string, Asset[]>, doneTick: number, panelOpen: boolean
 * }}
 */
export const state = {
  ready: false,
  loadError: null,
  config: null,
  catalog: null,
  user: null,
  jobs: [],
  jobAssets: {},
  doneTick: 0,
  panelOpen: false,
};

/** @type {Set<() => void>} */
const listeners = new Set();
/** @type {Map<string, () => void>} */
const watchers = new Map();
/** @type {Set<string>} */
const loadingAssets = new Set();

/** @param {() => void} fn */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  listeners.forEach((fn) => fn());
}

/** L'interface est utilisable : mode personnel, ou utilisateur connecté. */
export function isAuthed() {
  return state.ready && !!state.user;
}

export function isMulti() {
  return state.config?.mode === 'multi';
}

/** @param {boolean} open */
export function setPanelOpen(open) {
  state.panelOpen = open;
  emit();
}

export async function refreshUser() {
  try {
    state.user = (await api.me()).user;
    emit();
  } catch {
    /* le solde se rafraîchira plus tard */
  }
}

/** @param {string} id */
export function loadJobAssets(id) {
  if (loadingAssets.has(id)) return;
  loadingAssets.add(id);
  api
    .getJob(id)
    .then(({ job, assets }) => {
      state.jobAssets[id] = assets;
      state.jobs = state.jobs.map((j) => (j.id === id ? { ...j, ...job } : j));
      emit();
    })
    .catch(() => loadingAssets.delete(id));
}

/** @param {Job} job */
function startWatch(job) {
  if (isTerminal(job.status) || watchers.has(job.id)) return;
  const stop = watchJob(job.id, {
    onUpdate: (patch) => {
      state.jobs = state.jobs.map((j) => (j.id === job.id ? { ...j, ...patch } : j));
      emit();
    },
    onDone: (final) => {
      watchers.delete(job.id);
      state.jobs = state.jobs.map((j) => (j.id === job.id ? { ...j, ...final } : j));
      if (final.status === 'done') loadJobAssets(job.id);
      state.doneTick += 1;
      emit();
      void refreshUser();
    },
  });
  watchers.set(job.id, stop);
}

/** Ajoute un job créé à la file et le suit. @param {Job} job */
export function trackJob(job) {
  state.jobs = [job, ...state.jobs.filter((j) => j.id !== job.id)];
  state.panelOpen = true;
  startWatch(job);
  emit();
  void refreshUser();
}

/** @param {string} id */
export async function cancelJob(id) {
  const { job } = await api.cancelJob(id);
  state.jobs = state.jobs.map((j) => (j.id === id ? { ...j, ...job } : j));
  emit();
}

/** @param {string} id */
export async function removeJob(id) {
  await api.deleteJob(id);
  const stop = watchers.get(id);
  if (stop) stop();
  watchers.delete(id);
  state.jobs = state.jobs.filter((j) => j.id !== id);
  emit();
}

function stopAll() {
  watchers.forEach((stop) => stop());
  watchers.clear();
}

/** Charge config, utilisateur, catalogue et file de jobs. Redirige vers #/connexion si besoin. */
export async function init() {
  state.loadError = null;
  stopAll();
  try {
    state.config = await api.config();
    let user = null;
    try {
      user = (await api.me()).user;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
    state.user = user;
    if (user) {
      const [catalog, list] = await Promise.all([api.catalog(), api.listJobs({ limit: 30 })]);
      state.catalog = catalog;
      state.jobs = list.items;
      list.items.forEach(startWatch);
    }
  } catch (e) {
    state.loadError = describeError(e);
  } finally {
    state.ready = true;
    emit();
  }
}

export async function logout() {
  try {
    await api.logout();
  } finally {
    stopAll();
    state.user = null;
    state.jobs = [];
    state.jobAssets = {};
    loadingAssets.clear();
    state.panelOpen = false;
    emit();
    location.hash = '#/connexion';
  }
}

/** @param {User|null} u */
export function setUser(u) {
  state.user = u;
  emit();
}
