// Fonctions pures (sans DOM) : erreurs d'API, requêtes, modèles de prompt, formats.
// Testées avec `node --test apps/web/test/*.test.js`.

/**
 * @typedef {'t2i'|'i2v'|'t2v'|'upscale'|'interpolate'|'lipsync'|'concat'|'trim'} JobKind
 * @typedef {'queued'|'running'|'done'|'failed'|'canceled'|'blocked'} JobStatus
 *
 * @typedef {Object} Job
 * @property {string} id
 * @property {JobKind} kind
 * @property {JobStatus} status
 * @property {number} progress
 * @property {string|null} prompt
 * @property {string|null} negativePrompt
 * @property {Record<string, unknown>} params
 * @property {string|null} presetId
 * @property {string|null} templateId
 * @property {string|null} characterId
 * @property {string|null} inputAssetId
 * @property {string|null} audioAssetId
 * @property {string[]} resultAssetIds
 * @property {string|null} error
 * @property {string|null} [message]
 * @property {string} backend
 * @property {number} cost
 * @property {boolean} cacheHit
 * @property {string} createdAt
 * @property {string|null} startedAt
 * @property {string|null} finishedAt
 *
 * @typedef {Object} Asset
 * @property {string} id
 * @property {'image'|'video'|'audio'} kind
 * @property {string} mime
 * @property {string} url
 * @property {string|null} thumbUrl
 * @property {number|null} width
 * @property {number|null} height
 * @property {number|null} duration
 * @property {string|null} title
 * @property {string|null} prompt
 * @property {string|null} jobId
 * @property {boolean} favorite
 * @property {'generated'|'upload'} origin
 * @property {string} createdAt
 *
 * @typedef {Object} Character
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string|null} referenceAssetId
 * @property {string|null} loraName
 * @property {number|null} seed
 * @property {string} createdAt
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {'user'|'admin'} role
 * @property {number} credits
 *
 * @typedef {Object} AppConfig
 * @property {'personal'|'multi'} mode
 * @property {boolean} creditsEnabled
 * @property {string} backend
 * @property {boolean} registrationOpen
 * @property {{realFaces: string, content: string}} notices
 * @property {{maxPromptLength: number, maxUploadMb: number}} limits
 *
 * @typedef {Object} CameraPreset
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} promptFragment
 * @property {string} [negativeFragment]
 * @property {string} category
 *
 * @typedef {Object} TemplateVariable
 * @property {string} name
 * @property {string} label
 * @property {string} placeholder
 *
 * @typedef {Object} Template
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {'i2v'|'t2v'|'t2i'} kind
 * @property {string} promptTemplate
 * @property {TemplateVariable[]} variables
 * @property {Record<string, unknown>} defaults
 *
 * @typedef {{id: string, label: string, width: number, height: number}} SizeOption
 *
 * @typedef {Object} Catalog
 * @property {{id: string, kind: string, name: string, license: string, commercial: boolean, minVramGb: number}[]} models
 * @property {CameraPreset[]} cameraPresets
 * @property {Template[]} templates
 * @property {SizeOption[]} sizes
 * @property {Record<string, number>} costs
 */

export const TERMINAL_STATUSES = ['done', 'failed', 'canceled', 'blocked'];

/** @param {string} status */
export function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {string} [reason]
   */
  constructor(status, code, message, reason) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

/** @param {number} status */
function codeFromStatus(status) {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 402:
      return 'insufficient_credits';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 422:
      return 'invalid';
    case 429:
      return 'rate_limited';
    default:
      return 'http_error';
  }
}

/**
 * Transforme une réponse HTTP en erreur typée (corps `{ error, code, reason? }`).
 * @param {number} status
 * @param {unknown} body
 */
export function toApiError(status, body) {
  const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {};
  const code = typeof b.code === 'string' && b.code ? b.code : codeFromStatus(status);
  const message = typeof b.error === 'string' && b.error ? b.error : `Erreur HTTP ${status}`;
  const reason = typeof b.reason === 'string' && b.reason ? b.reason : undefined;
  return new ApiError(status, code, message, reason);
}

/**
 * Message d'erreur en français, prêt à être affiché.
 * @param {unknown} e
 */
export function describeError(e) {
  if (!(e instanceof ApiError)) {
    return e instanceof Error && e.message ? e.message : 'Une erreur inattendue est survenue.';
  }
  const why = e.reason ? ` Motif : ${e.reason}` : '';
  switch (e.code) {
    case 'blocked':
      return `Demande refusée par les garde-fous de ZODIAK AI.${why}`;
    case 'consent_required':
      return `Consentement requis : confirmez que vous avez le droit d'utiliser cette image.${why}`;
    case 'invalid':
      return `Demande invalide.${why || (e.message ? ` ${e.message}` : '')}`;
    case 'insufficient_credits':
      return 'Crédits insuffisants pour lancer cette génération. Rechargez votre solde ou choisissez une option moins coûteuse.';
    case 'unauthorized':
      return 'Session expirée ou identifiants incorrects. Veuillez vous connecter.';
    case 'forbidden':
      return "Vous n'avez pas le droit d'effectuer cette action.";
    case 'not_found':
      return 'Élément introuvable (il a peut-être été supprimé).';
    case 'rate_limited':
      return 'Trop de requêtes. Patientez quelques instants avant de réessayer.';
    case 'network':
      return "Impossible de joindre le serveur. Vérifiez votre connexion et l'état de l'API.";
    default:
      return e.message || `Erreur HTTP ${e.status}`;
  }
}

/**
 * @param {Record<string, string|number|boolean|undefined|null>} [q]
 */
export function buildQuery(q) {
  if (!q) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}|\{\s*([\w.-]+)\s*\}/g;

/**
 * Noms des variables d'un modèle (`{{nom}}` ou `{nom}`), sans doublon.
 * @param {string} tpl
 * @returns {string[]}
 */
export function templateVariableNames(tpl) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const m of tpl.matchAll(PLACEHOLDER)) names.add(m[1] ?? m[2] ?? '');
  return [...names];
}

/**
 * Remplit un modèle de prompt. Les variables absentes ou vides disparaissent,
 * les espaces et virgules orphelins sont nettoyés.
 * @param {string} tpl
 * @param {Record<string, string|undefined>} values
 */
export function fillTemplate(tpl, values) {
  const filled = tpl.replace(PLACEHOLDER, (_all, a, b) => String(values[a ?? b] ?? '').trim());
  return filled
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

/**
 * @param {string} tpl
 * @param {Record<string, string|undefined>} values
 */
export function missingVariables(tpl, values) {
  return templateVariableNames(tpl).filter((n) => !String(values[n] ?? '').trim());
}

/** @type {Record<string, string>} */
export const STATUS_LABEL = {
  queued: 'En attente',
  running: 'En cours',
  done: 'Terminé',
  failed: 'Échec',
  blocked: 'Bloqué',
  canceled: 'Annulé',
};

/** @type {Record<string, string>} */
export const KIND_LABEL = {
  t2i: 'Image',
  i2v: 'Image → vidéo',
  t2v: 'Texte → vidéo',
  upscale: 'Agrandissement',
  interpolate: 'Interpolation',
  lipsync: 'Lip-sync',
  concat: 'Montage',
  trim: 'Découpe',
};

/** @param {string} iso */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * @param {string|null|undefined} s
 * @param {number} n
 */
export function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Asset minimal construit depuis un id (le contrat n'a pas de GET /api/assets/:id).
 * @param {string} id
 * @param {'image'|'video'|'audio'} [kind]
 * @returns {Asset}
 */
export function stubAsset(id, kind = 'image') {
  const e = encodeURIComponent(id);
  return {
    id,
    kind,
    mime: `${kind}/*`,
    url: `/api/assets/${e}/file`,
    thumbUrl: kind === 'audio' ? null : `/api/assets/${e}/thumb`,
    width: null,
    height: null,
    duration: null,
    title: null,
    prompt: null,
    jobId: null,
    favorite: false,
    origin: 'generated',
    createdAt: '',
  };
}

/** Adresse de retour après connexion (autorisation d'un connecteur), limitée au flux OAuth du site. */
export function returnTo(hash) {
  const q = new URLSearchParams((hash.split('?')[1]) || '');
  const r = q.get('retour') || '';
  return r.startsWith('/oauth/authorize?') ? r : null;
}
