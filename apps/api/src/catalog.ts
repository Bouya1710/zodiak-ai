import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export type JobKind = 't2i' | 'i2v' | 't2v' | 'upscale' | 'interpolate' | 'lipsync' | 'concat' | 'trim';
export const JOB_KINDS: JobKind[] = ['t2i', 'i2v', 't2v', 'upscale', 'interpolate', 'lipsync', 'concat', 'trim'];

export interface SizeDef { id: string; label: string; width: number; height: number; video: { width: number; height: number; draft: { width: number; height: number } } }
export interface CameraPreset { id: string; label: string; category: string; description: string; promptFragment: string; negativeFragment?: string; motion: string }
// Modèle de génération distant (fal) : 1 crédit ≈ 0,01 $ de coût fournisseur.
export interface Engine { id: string; kinds: JobKind[]; name: string; vendor: string; tag?: string; credits: number; draftCredits?: number; provider?: 'fal' | 'modal' | 'kling' | 'byteplus' | 'google'; model?: string; premium?: boolean; endpoints: Partial<Record<JobKind, string>>; note?: string }
export interface Template { id: string; label: string; kind: 't2i' | 'i2v' | 't2v'; description: string; promptTemplate: string; variables: { name: string; label: string; placeholder: string }[]; defaults: Record<string, unknown> }

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as T;
}

export interface Catalog {
  sizes: SizeDef[];
  costs: Record<string, number>;
  models: Record<string, unknown>[];
  presets: CameraPreset[];
  templates: Template[];
  profiles: Record<string, Record<string, string>>;
  engines: Engine[];
}

export function loadCatalog(dir = config.catalogDir): Catalog {
  return {
    sizes: readJson(dir, 'sizes.json'),
    costs: readJson(dir, 'costs.json'),
    models: readJson(dir, 'models.json'),
    presets: readJson(dir, 'camera_presets.json'),
    templates: readJson(dir, 'templates.json'),
    profiles: readJson(dir, 'profiles.json'),
    engines: fs.existsSync(path.join(dir, 'engines.json')) ? readJson(dir, 'engines.json') : [],
  };
}

export const catalog: Catalog = loadCatalog();

/** Modèle choisi pour ce type de job (le premier du catalogue par défaut), ou null si aucun. */
export function engineFor(kind: JobKind, id: unknown, c: Catalog = catalog): Engine | null {
  const list = c.engines.filter((e) => e.kinds.includes(kind));
  return list.find((e) => e.id === id) ?? list[0] ?? null;
}

// Fournisseurs « directs » (chez l'éditeur du modèle, moins cher que fal) : clé(s) requise(s).
export const DIRECT_KEYS: Record<string, string[]> = {
  modal: ['MODAL_TOKEN', 'MODAL_SUBMIT_URL', 'MODAL_STATUS_URL'], kling: ['KLING_API_KEY'], byteplus: ['ARK_API_KEY'], google: ['GEMINI_API_KEY'],
};
export const isDirect = (id: string) => id in DIRECT_KEYS;
export const directReady = (id: string) => (DIRECT_KEYS[id] ?? []).every((k) => !!process.env[k]);
/** Modèle proposable : moteur fal, ou fournisseur direct configuré, ou repli fal possible. */
export const engineUsable = (e: Pick<Engine, 'provider' | 'endpoints'>) => !e.provider || directReady(e.provider) || Object.keys(e.endpoints).length > 0;

/** Choix automatique : brouillon → moteur du site le moins cher ; sinon le moins cher du niveau demandé (premium ou non).
 *  Une image de fin exige un fournisseur direct (fal ne la gère pas ici). */
export function autoEngine(kind: JobKind, o: { draft?: boolean; endImage?: boolean; premium?: boolean }, c: Catalog = catalog): Engine | null {
  const list = c.engines.filter((e) => e.kinds.includes(kind) && engineUsable(e) && (!o.endImage || (!!e.provider && isDirect(e.provider))));
  const pick = o.draft ? list.filter((e) => e.draftCredits) : o.premium ? list.filter((e) => e.premium) : list;
  const price = (e: Engine) => (o.draft && e.draftCredits ? e.draftCredits : e.credits);
  return [...(pick.length ? pick : list)].sort((a, b) => price(a) - price(b))[0] ?? null;
}

/** Modèle retenu pour une demande : « auto » (avec quality = premium | gratuit) ou un identifiant du catalogue. */
export function resolveEngine(kind: JobKind, params: Record<string, unknown>, c: Catalog = catalog): Engine | null {
  if (params.engine !== 'auto') return engineFor(kind, params.engine, c);
  return autoEngine(kind, { draft: params.draft === true, endImage: !!params.endAssetId, premium: params.quality === 'premium' }, c);
}

/** Devis avant lancement : modèle retenu (modèles distants seulement) et coût en crédits (1 crédit ≈ 0,01 $). */
export function quote(kind: JobKind, params: Record<string, unknown>, c: Catalog = catalog) {
  const e = config.backend === 'fal' ? resolveEngine(kind, params, c) : null;
  const credits = costFor(kind, { ...params, engine: e?.id }, c);
  return { engine: e && { id: e.id, name: e.name, vendor: e.vendor, premium: !!e.premium }, credits };
}

export function costFor(kind: JobKind, params: Record<string, unknown>, c: Catalog = catalog): number {
  if (typeof params.engine === 'string') {
    const e = engineFor(kind, params.engine, c);
    if (e) return params.draft === true && e.draftCredits ? e.draftCredits : e.credits;
  }
  const base = Number(c.costs[kind] ?? 1);
  const draft = (kind === 'i2v' || kind === 't2v') && params.draft === true;
  return Math.max(1, Math.ceil(base * (draft ? Number(c.costs.draftFactor ?? 0.4) : 1)));
}

const clamp16 = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n / 16) * 16));

/** Dimensions de sortie pour t2i / t2v / i2v selon sizeId, width/height libres ou brouillon. */
export function resolveDims(kind: JobKind, params: Record<string, unknown>, c: Catalog = catalog): { width: number; height: number } {
  const video = kind === 'i2v' || kind === 't2v';
  const size = c.sizes.find((s) => s.id === params.sizeId) ?? c.sizes.find((s) => s.id === (video ? 'landscape' : 'square'))!;
  if (typeof params.width === 'number' && typeof params.height === 'number' && !params.sizeId) {
    const max = video ? 1280 : 2048;
    return { width: clamp16(params.width, 256, max), height: clamp16(params.height, 256, max) };
  }
  if (!video) return { width: size.width, height: size.height };
  return params.draft === true ? size.video.draft : { width: size.video.width, height: size.video.height };
}

export function renderTemplate(t: Template, vars: Record<string, unknown>): string {
  return t.promptTemplate.replace(/\{([a-z_]+)\}/gi, (_m, name: string) => {
    const v = vars[name];
    if (typeof v !== 'string' || !v.trim()) {
      const def = t.variables.find((x) => x.name === name);
      if (def?.placeholder) return def.placeholder;
      throw new Error(`variable de template manquante : ${name}`);
    }
    return v.trim().slice(0, 200);
  });
}
