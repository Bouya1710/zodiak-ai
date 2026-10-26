import crypto from 'node:crypto';
import { config } from './config.ts';
import { catalog, costFor, resolveEngine, engineUsable, renderTemplate, resolveDims, JOB_KINDS, type JobKind } from './catalog.ts';
import { checkPrompt, requireConsent } from './guardrails.ts';
import { HttpError } from './ctx.ts';
import type { Row } from './db.ts';

export function serializeJob(r: Row) {
  return {
    id: r.id, kind: r.kind, status: r.status, progress: r.progress, message: r.message ?? null,
    prompt: r.prompt, negativePrompt: r.negative_prompt, params: JSON.parse(r.params),
    presetId: r.preset_id, templateId: r.template_id, characterId: r.character_id,
    inputAssetId: r.input_asset_id, audioAssetId: r.audio_asset_id,
    resultAssetIds: JSON.parse(r.result_asset_ids), error: r.error, backend: r.backend,
    cost: r.cost, cacheHit: !!r.cache_hit,
    createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
  };
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const bad = (msg: string): never => { throw new HttpError(422, 'invalid', msg); };

/** Accès aux données nécessaire à la planification (SQLite en local, Supabase en ligne). */
export interface PlanDeps {
  asset(id: string): Promise<Row | undefined> | Row | undefined;
  character(id: string): Promise<Row | undefined> | Row | undefined;
  audit(event: string, detail: string): Promise<void> | void;
}

export interface JobPlan {
  id: string; kind: JobKind; prompt: string | null; negative: string | null; params: Record<string, any>;
  presetId: string | null; templateId: string | null; characterId: string | null;
  inputAssetId: string | null; audioAssetId: string | null; cost: number;
}

async function owned(deps: PlanDeps, id: string, kinds: string[], what: string): Promise<Row> {
  const a = await deps.asset(id);
  if (!a) throw new HttpError(404, 'not_found', `${what} introuvable`);
  if (!kinds.includes(a.kind)) bad(`${what} : type ${a.kind} non accepté ici (attendu : ${kinds.join(' ou ')})`);
  return a;
}

/** Valide la demande, applique les garde-fous et calcule le coût. Ne touche ni aux crédits ni à la base de jobs. */
export async function planJob(deps: PlanDeps, body: Record<string, any>): Promise<JobPlan> {
  const kind = body.kind as JobKind;
  if (!JOB_KINDS.includes(kind)) bad('kind invalide');
  const params: Record<string, any> = { ...(body.params && typeof body.params === 'object' ? body.params : {}) };

  // Modèle de prompt + valeurs par défaut du modèle
  let prompt = str(body.prompt, config.maxPromptLength);
  let templateId: string | null = null;
  if (body.templateId) {
    const t = catalog.templates.find((x) => x.id === body.templateId);
    if (!t) throw new HttpError(404, 'not_found', 'Modèle introuvable');
    if (t.kind !== kind) bad(`Ce modèle produit du type ${t.kind}`);
    templateId = t.id;
    for (const [k, v] of Object.entries(t.defaults)) if (params[k] === undefined) params[k] = v;
    try { prompt = renderTemplate(t, (params.variables ?? {}) as Record<string, unknown>); } catch (e) { bad((e as Error).message); }
    delete params.variables;
  }

  let presetId: string | null = null;
  let preset = null as (typeof catalog.presets)[number] | null;
  if (body.presetId) {
    preset = catalog.presets.find((p) => p.id === body.presetId) ?? null;
    if (!preset) throw new HttpError(404, 'not_found', 'Preset de caméra introuvable');
    presetId = preset.id;
  }

  let character: Row | undefined;
  if (body.characterId) {
    character = await deps.character(String(body.characterId));
    if (!character) throw new HttpError(404, 'not_found', 'Personnage introuvable');
  }

  const negative = str(body.negativePrompt, config.maxPromptLength);

  // Garde-fous sur tout le texte susceptible d'atteindre le modèle
  const check = checkPrompt(prompt, negative, character?.description, character?.name);
  if (!check.ok) {
    await deps.audit('prompt_blocked', `${check.category}: ${(prompt ?? '').slice(0, 200)}`);
    throw new HttpError(422, 'blocked', 'Demande refusée', check.reason);
  }

  // Entrées
  let inputAssetId: string | null = body.inputAssetId ? String(body.inputAssetId) : null;
  const audioAssetId: string | null = body.audioAssetId ? String(body.audioAssetId) : null;
  let usesUpload = false;
  const needPrompt = kind === 't2i' || kind === 't2v';
  if (needPrompt && !prompt) bad('Un prompt est requis');
  if (kind === 'i2v' && !inputAssetId && character?.reference_asset_id) inputAssetId = character.reference_asset_id;

  switch (kind) {
    case 'i2v': {
      if (!inputAssetId) bad('Une image source est requise');
      const a = await owned(deps, inputAssetId!, ['image'], 'Image source');
      usesUpload = a.origin === 'upload';
      // Image de fin facultative : verrouille la dernière image (moins d'essais ratés).
      delete params.endAssetId;
      if (body.endAssetId) {
        const end = await owned(deps, String(body.endAssetId), ['image'], 'Image de fin');
        usesUpload ||= end.origin === 'upload';
        params.endAssetId = end.id;
      }
      if (!prompt && !preset) bad('Un prompt ou un preset de caméra est requis');
      break;
    }
    case 'upscale': {
      if (!inputAssetId) bad('Un média source est requis');
      const a = await owned(deps, inputAssetId!, ['image', 'video'], 'Média source');
      usesUpload = a.origin === 'upload';
      params.scale = num(params.scale, 2, 4, 2) >= 3 ? 4 : 2;
      break;
    }
    case 'interpolate': {
      if (!inputAssetId) bad('Une vidéo source est requise');
      const a = await owned(deps, inputAssetId!, ['video'], 'Vidéo source');
      usesUpload = a.origin === 'upload';
      params.factor = 2;
      break;
    }
    case 'lipsync': {
      if (!inputAssetId || !audioAssetId) bad('Une vidéo et un fichier audio sont requis');
      const v = await owned(deps, inputAssetId!, ['video'], 'Vidéo source');
      await owned(deps, audioAssetId!, ['audio'], 'Audio');
      usesUpload = v.origin === 'upload';
      break;
    }
    case 'trim': {
      if (!inputAssetId) bad('Une vidéo source est requise');
      const a = await owned(deps, inputAssetId!, ['video'], 'Vidéo source');
      usesUpload = a.origin === 'upload';
      params.start = num(params.start, 0, 3600, 0);
      params.end = num(params.end, 0, 3600, 0);
      if (!(params.end > params.start)) bad('« fin » doit être supérieure à « début »');
      break;
    }
    case 'concat': {
      const ids: unknown = params.assetIds;
      if (!Array.isArray(ids) || ids.length < 2 || ids.length > 20) bad('assetIds : 2 à 20 vidéos');
      for (const id of ids as string[]) usesUpload ||= (await owned(deps, String(id), ['video'], 'Vidéo')).origin === 'upload';
      params.assetIds = (ids as unknown[]).map(String);
      break;
    }
    default: break;
  }

  const consent = requireConsent(usesUpload, body.consent);
  if (!consent.ok) throw new HttpError(422, 'consent_required', 'Consentement requis', consent.reason);

  // Paramètres résolus (reproductibles)
  const isVideo = kind === 'i2v' || kind === 't2v';
  if (kind === 't2i' || isVideo) {
    params.draft = isVideo && params.draft === true;
    const dims = resolveDims(kind, params);
    params.width = dims.width; params.height = dims.height;
    delete params.sizeId; params.sizeId = typeof body.params?.sizeId === 'string' ? body.params.sizeId : (params.sizeId ?? undefined);
    params.seed = Number.isInteger(params.seed) ? params.seed : (character?.seed ?? crypto.randomInt(0, 2 ** 31 - 1));
    params.steps = Math.round(num(params.steps, 1, 60, kind === 't2i' ? 4 : 20));
  }
  if (isVideo) {
    params.duration = num(params.duration, 2, 5, 5);
    params.fps = Math.round(num(params.fps, 8, 30, 24));
  }

  // Modèle de génération (catalogue engines.json) : son coût remplace le barème générique.
  if (config.backend === 'fal' && (kind === 't2i' || isVideo)) {
    params.quality = params.quality === 'premium' ? 'premium' : undefined;
    const engine = resolveEngine(kind, params);
    if (engine && !engineUsable(engine)) bad(`Modèle indisponible pour le moment : ${engine.name}`);
    if (engine) params.engine = engine.id; else delete params.engine;
  } else delete params.engine;

  const cost = costFor(kind, params);
  return { id: crypto.randomUUID(), kind, prompt, negative, params, presetId, templateId, characterId: character?.id ?? null, inputAssetId, audioAssetId, cost };
}

