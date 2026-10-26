// Client typé de l'API ZODIAK AI (docs/API.md). Appels relatifs : même origine, cookie de session inclus.
import { ApiError, buildQuery, toApiError } from './lib.js';

/**
 * @typedef {import('./lib.js').Job} Job
 * @typedef {import('./lib.js').Asset} Asset
 * @typedef {import('./lib.js').Character} Character
 * @typedef {import('./lib.js').User} User
 * @typedef {import('./lib.js').AppConfig} AppConfig
 * @typedef {import('./lib.js').Catalog} Catalog
 * @typedef {import('./lib.js').JobKind} JobKind
 * @typedef {{items: Asset[], nextCursor: string|null}} AssetPage
 * @typedef {{items: Job[], nextCursor: string|null}} JobPage
 *
 * @typedef {Object} CreateJobBody
 * @property {JobKind} kind
 * @property {string} [prompt]
 * @property {string} [negativePrompt]
 * @property {Record<string, unknown>} [params]
 * @property {string} [presetId]
 * @property {string} [templateId]
 * @property {string} [characterId]
 * @property {string} [inputAssetId]
 * @property {string} [audioAssetId]
 * @property {boolean} [consent]
 */

/**
 * @template T
 * @param {string} path
 * @param {{method?: string, json?: unknown, form?: FormData, query?: Record<string, string|number|boolean|undefined|null>}} [opts]
 * @returns {Promise<T>}
 */
export async function request(path, opts = {}) {
  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json' };
  /** @type {BodyInit|undefined} */
  let body;
  if (opts.form) {
    body = opts.form;
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  let res;
  try {
    res = await fetch(`/api${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network', 'Réseau indisponible');
  }
  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) throw toApiError(res.status, parsed);
  return /** @type {T} */ (parsed);
}

/** @param {string} id */
const enc = (id) => encodeURIComponent(id);

export const api = {
  /** @returns {Promise<AppConfig>} */
  config: () => request('/config'),
  /** @returns {Promise<Catalog>} */
  catalog: () => request('/catalog'),

  /** @returns {Promise<{user: User}>} */
  me: () => request('/auth/me'),
  /** @returns {Promise<{user: User}>} */
  login: (/** @type {string} */ email, /** @type {string} */ password) =>
    request('/auth/login', { method: 'POST', json: { email, password } }),
  /** @returns {Promise<{user: User}>} */
  register: (/** @type {string} */ email, /** @type {string} */ password) =>
    request('/auth/register', { method: 'POST', json: { email, password } }),
  /** @returns {Promise<{ok: true}>} */
  logout: () => request('/auth/logout', { method: 'POST' }),

  /** @param {CreateJobBody} body @returns {Promise<{job: Job}>} */
  createJob: (body) => request('/jobs', { method: 'POST', json: body }),
  /** @param {{status?: string, kind?: string, limit?: number, cursor?: string|null}} [q] @returns {Promise<JobPage>} */
  listJobs: (q = {}) => request('/jobs', { query: q }),
  /** @param {string} id @returns {Promise<{job: Job, assets: Asset[]}>} */
  getJob: (id) => request(`/jobs/${enc(id)}`),
  /** @param {string} id @returns {Promise<{job: Job}>} */
  cancelJob: (id) => request(`/jobs/${enc(id)}/cancel`, { method: 'POST' }),
  /** Rendu final d'un brouillon terminé. @param {string} id @param {{engine?: string, quality?: string}} [o] @returns {Promise<{job: Job}>} */
  finalJob: (id, o = {}) => request(`/jobs/${enc(id)}/final`, { method: 'POST', json: o }),
  /** @param {string} id @returns {Promise<{ok: true}>} */
  deleteJob: (id) => request(`/jobs/${enc(id)}`, { method: 'DELETE' }),

  /**
   * @param {{kind?: string, favorite?: boolean, q?: string, limit?: number, cursor?: string|null}} [q]
   * @returns {Promise<AssetPage>}
   */
  listAssets: (q = {}) =>
    request('/assets', {
      query: { kind: q.kind, favorite: q.favorite ? 1 : undefined, q: q.q, limit: q.limit, cursor: q.cursor },
    }),
  /** @param {File} file @param {boolean} consent @returns {Promise<{asset: Asset}>} */
  uploadAsset: (file, consent) => {
    const form = new FormData();
    form.append('file', file);
    form.append('consent', consent ? 'true' : 'false');
    return request('/assets/upload', { method: 'POST', form });
  },
  /** @param {string} id @param {{favorite?: boolean, title?: string}} patch @returns {Promise<{asset: Asset}>} */
  patchAsset: (id, patch) => request(`/assets/${enc(id)}`, { method: 'PATCH', json: patch }),
  /** @param {string} id @returns {Promise<{ok: true}>} */
  deleteAsset: (id) => request(`/assets/${enc(id)}`, { method: 'DELETE' }),

  /** @returns {Promise<{items: Character[]}>} */
  listCharacters: () => request('/characters'),
  /**
   * @param {{name: string, description: string, referenceAssetId?: string, loraName?: string, seed?: number}} body
   * @returns {Promise<{character: Character}>}
   */
  createCharacter: (body) => request('/characters', { method: 'POST', json: body }),
  /** @param {string} id @returns {Promise<{ok: true}>} */
  deleteCharacter: (id) => request(`/characters/${enc(id)}`, { method: 'DELETE' }),

  /** @returns {Promise<{balance: number, creditsEnabled: boolean, ledger: {id: string, delta: number, reason: string, jobId: string|null, createdAt: string}[]}>} */
  credits: () => request('/credits'),
};
