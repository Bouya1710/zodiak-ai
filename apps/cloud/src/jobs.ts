// Création d'un job, partagée par le site (/api/jobs) et le connecteur MCP (/api/mcp).
import { cloud } from './env.ts';
import * as supa from './supa.ts';
import type { Session } from './session.ts';
import { processJob, backend } from './process.ts';
import { isRemote } from './providers.ts';
import { HttpError } from '../../api/src/ctx.ts';
import { planJob } from '../../api/src/plan.ts';
import { catalog } from '../../api/src/catalog.ts';

type Row = Record<string, any>;

/** Lance un traitement en arrière-plan : `waitUntil` de Vercel (la fonction reste vivante jusqu'à la fin). */
export function background(p: Promise<unknown>): void {
  const safe = p.catch((e) => console.error('[traitement]', e));
  const ctx = (globalThis as any)[Symbol.for('@vercel/request-context')]?.get?.();
  if (ctx?.waitUntil) ctx.waitUntil(safe);
}

/** Valide la demande, applique le plafond du site, débite les crédits, enregistre puis lance le job. */
export async function createJob(s: Session, body: Record<string, any>): Promise<Row> {
  const plan = await planJob({
    asset: async (id) => (await supa.select('assets', { id: `eq.${id}`, select: '*' }, s.jwt))[0],
    character: async (id) => (await supa.select('characters', { id: `eq.${id}`, select: '*' }, s.jwt))[0],
    audit: async (event, detail) => { await supa.write('insert', 'audit_log', { user_id: s.user.id, event, detail }); },
  }, body);
  // Plafond quotidien du site : protège la carte bancaire du propriétaire contre les abus.
  if (isRemote(backend().id) && ['t2i', 'i2v', 't2v'].includes(plan.kind)) {
    const spent = await supa.spentSince(new Date(Date.now() - 24 * 3600_000));
    if (spent + plan.cost > cloud.dailyBudget) throw new HttpError(503, 'budget_reached', 'Le quota de génération du jour est atteint. Réessayez demain.');
  }
  if (cloud.creditsEnabled) await supa.credits(s.user.id, -plan.cost, 'job', plan.id);
  let row: Row | null;
  try {
    row = await supa.write('insert', 'jobs', {
      id: plan.id, user_id: s.user.id, kind: plan.kind, status: 'queued', prompt: plan.prompt, negative_prompt: plan.negative,
      params: JSON.stringify(plan.params), preset_id: plan.presetId, template_id: plan.templateId, character_id: plan.characterId,
      input_asset_id: plan.inputAssetId, audio_asset_id: plan.audioAssetId, backend: backend().id, cost: cloud.creditsEnabled ? plan.cost : 0,
    });
  } catch (e) {
    if (cloud.creditsEnabled) await supa.credits(s.user.id, plan.cost, 'refund_error', plan.id).catch(() => {});
    throw e;
  }
  background(processJob(s, row!));
  return row!;
}

/** Rendu final d'un brouillon réussi : mêmes texte, images, cadrage et graine, en qualité finale.
 *  Par défaut le même modèle ; quality = premium → le modèle premium le moins cher ; ou un modèle précis. */
export async function finalFromDraft(s: Session, jobId: string, o: { engine?: string; quality?: string }): Promise<Row> {
  const j = (await supa.select('jobs', { id: `eq.${jobId}`, select: '*' }, s.jwt))[0];
  if (!j) throw new HttpError(404, 'not_found', 'Job introuvable');
  const p = JSON.parse(j.params ?? '{}');
  if (j.status !== 'done' || !p.draft) throw new HttpError(422, 'invalid', 'Seul un brouillon terminé peut passer en rendu final');
  const r = p.width / p.height;
  const sizeId = p.sizeId ?? [...catalog.sizes].sort((a, b) => Math.abs(Math.log(a.width / a.height / r)) - Math.abs(Math.log(b.width / b.height / r)))[0]!.id;
  return createJob(s, {
    kind: j.kind, prompt: j.prompt ?? undefined, negativePrompt: j.negative_prompt ?? undefined, presetId: j.preset_id ?? undefined,
    characterId: j.character_id ?? undefined, inputAssetId: j.input_asset_id ?? undefined, endAssetId: p.endAssetId,
    consent: true, // déjà donné pour ces mêmes images lors du brouillon
    params: { sizeId, duration: p.duration, seed: p.seed, draft: false, engine: o.engine ?? (o.quality === 'premium' ? 'auto' : p.engine), quality: o.quality },
  });
}
