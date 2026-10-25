import { config } from './config.ts';
import { costFor, JOB_KINDS } from './catalog.ts';
import { debit, refund } from './credits.ts';
import { one, all, run, tx, type Row } from './db.ts';
import { HttpError, nowIso, type Ctx } from './ctx.ts';
import { serializeAsset } from './serialize.ts';
import { planJob, serializeJob } from './plan.ts';
import type { User } from './auth.ts';

export { planJob, serializeJob };
export type { PlanDeps, JobPlan } from './plan.ts';

/** Planifie, débite les crédits et met le job en file (SQLite). */
export async function createJob(ctx: Ctx, user: User, body: Record<string, any>) {
  const plan = await planJob({
    asset: (id) => one(ctx.db, 'SELECT * FROM assets WHERE id = ? AND user_id = ?', id, user.id),
    character: (id) => one(ctx.db, 'SELECT * FROM characters WHERE id = ? AND user_id = ?', id, user.id),
    audit: (event, detail) => { run(ctx.db, 'INSERT INTO audit_log (user_id, event, detail) VALUES (?, ?, ?)', user.id, event, detail); },
  }, body);
  tx(ctx.db, () => {
    debit(ctx.db, user.id, plan.cost, plan.id);
    run(ctx.db, `INSERT INTO jobs (id, user_id, kind, status, prompt, negative_prompt, params, preset_id, template_id, character_id, input_asset_id, audio_asset_id, backend, cost, created_at)
      VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    plan.id, user.id, plan.kind, plan.prompt, plan.negative, JSON.stringify(plan.params), plan.presetId, plan.templateId, plan.characterId, plan.inputAssetId, plan.audioAssetId,
    ctx.backend.id, config.creditsEnabled ? plan.cost : 0, nowIso());
  });
  return serializeJob(one(ctx.db, 'SELECT * FROM jobs WHERE id = ?', plan.id)!);
}

export function getJob(ctx: Ctx, userId: string, id: string): Row {
  const r = one(ctx.db, 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', id, userId);
  if (!r) throw new HttpError(404, 'not_found', 'Job introuvable');
  return r;
}

export function jobWithAssets(ctx: Ctx, userId: string, id: string) {
  const j = getJob(ctx, userId, id);
  const ids: string[] = JSON.parse(j.result_asset_ids);
  const assets = ids.map((a) => one(ctx.db, 'SELECT * FROM assets WHERE id = ?', a)).filter(Boolean).map((r) => serializeAsset(r!));
  return { job: serializeJob(j), assets };
}

export function listJobs(ctx: Ctx, userId: string, q: { status?: string; kind?: string; limit: number; cursor?: string }) {
  const where = ['user_id = ?']; const args: any[] = [userId];
  if (q.status) { where.push('status = ?'); args.push(q.status); }
  if (q.kind) { where.push('kind = ?'); args.push(q.kind); }
  if (q.cursor) { where.push('created_at < ?'); args.push(q.cursor); }
  const rows = all(ctx.db, `SELECT * FROM jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id LIMIT ?`, ...args, q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { items: page.map(serializeJob), nextCursor: rows.length > q.limit ? page[page.length - 1]!.created_at : null };
}

/** Annule un job : immédiat s'il est en file, via drapeau si en cours (le worker agit). */
export function cancelJob(ctx: Ctx, userId: string, id: string) {
  const j = getJob(ctx, userId, id);
  if (j.status === 'queued') {
    const res = run(ctx.db, "UPDATE jobs SET status = 'canceled', finished_at = ?, message = 'Annulé' WHERE id = ? AND status = 'queued'", nowIso(), id);
    if (Number(res.changes) === 1) refund(ctx.db, userId, j.cost, id, 'refund_canceled');
  } else if (j.status === 'running') {
    run(ctx.db, 'UPDATE jobs SET cancel_requested = 1 WHERE id = ?', id);
  }
  return serializeJob(getJob(ctx, userId, id));
}

export function deleteJob(ctx: Ctx, userId: string, id: string): void {
  const j = getJob(ctx, userId, id);
  if (j.status === 'queued' || j.status === 'running') throw new HttpError(409, 'invalid', 'Annulez le job avant de le supprimer');
  run(ctx.db, 'UPDATE assets SET job_id = NULL WHERE job_id = ?', id);
  run(ctx.db, 'DELETE FROM jobs WHERE id = ?', id);
}
