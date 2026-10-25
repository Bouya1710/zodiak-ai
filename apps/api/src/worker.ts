import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.ts';
import { one, run, type Row } from './db.ts';
import { nowIso, type Ctx } from './ctx.ts';
import { ingestAsset } from './assets.ts';
import { refund } from './credits.ts';
import { isBlockedImage } from './safety.ts';
import { ffmpeg } from './ffmpeg.ts';
import { CanceledError } from './backends/types.ts';
import { executeJob, type Output } from './exec.ts';


export function fingerprint(ctx: Ctx, job: Row, inputShas: string[]): string {
  const p = JSON.parse(job.params);
  const key = {
    k: job.kind, p: job.prompt, n: job.negative_prompt, params: p, preset: job.preset_id, char: job.character_id,
    inputs: inputShas, backend: ctx.backend.id, profile: config.gpuProfile,
  };
  return crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex');
}

const sha = (ctx: Ctx, id: string | null) => (id ? (one(ctx.db, 'SELECT sha256 FROM assets WHERE id = ?', id)?.sha256 ?? '') : '');
const filePath = (ctx: Ctx, id: string) => ctx.storage.resolve(one(ctx.db, 'SELECT storage_key FROM assets WHERE id = ?', id)!.storage_key);

function setProgress(ctx: Ctx, id: string, pct: number, msg: string) {
  run(ctx.db, "UPDATE jobs SET progress = ?, message = ? WHERE id = ? AND status = 'running'", Math.max(0, Math.min(99, Math.round(pct))), msg, id);
}

async function execute(ctx: Ctx, job: Row, workDir: string, signal: AbortSignal): Promise<Output> {
  fs.mkdirSync(workDir, { recursive: true });
  const character = job.character_id ? one(ctx.db, 'SELECT * FROM characters WHERE id = ?', job.character_id) : undefined;
  return executeJob(job, {
    backend: ctx.backend, workDir, signal, character,
    inputPath: (id) => filePath(ctx, id),
    assetKind: (id) => one(ctx.db, 'SELECT kind FROM assets WHERE id = ?', id)!.kind,
    progress: (pct, msg) => setProgress(ctx, job.id, pct, msg),
  });
}

async function finish(ctx: Ctx, job: Row, status: string, fields: { error?: string; message?: string; results?: string[]; cacheHit?: boolean } = {}) {
  run(ctx.db, `UPDATE jobs SET status = ?, progress = ?, message = ?, error = ?, result_asset_ids = ?, cache_hit = ?, finished_at = ? WHERE id = ?`,
    status, status === 'done' ? 100 : (one(ctx.db, 'SELECT progress FROM jobs WHERE id = ?', job.id)?.progress ?? 0),
    fields.message ?? null, fields.error ?? null, JSON.stringify(fields.results ?? []), fields.cacheHit ? 1 : 0, nowIso(), job.id);
  if (status !== 'done') refund(ctx.db, job.user_id, job.cost, job.id, `refund_${status}`);
}

export async function processJob(ctx: Ctx, job: Row): Promise<void> {
  const workDir = path.join(os.tmpdir(), 'zodiak-jobs', job.id);
  const ac = new AbortController();
  const poll = setInterval(() => {
    const r = one(ctx.db, 'SELECT cancel_requested FROM jobs WHERE id = ?', job.id);
    if (r?.cancel_requested) ac.abort();
  }, 400);
  try {
    // Cache : même empreinte, même utilisateur → on réutilise le résultat, crédits rendus.
    const inputShas = [sha(ctx, job.input_asset_id), sha(ctx, job.audio_asset_id), ...((JSON.parse(job.params).assetIds ?? []) as string[]).map((i) => sha(ctx, i))];
    const fp = fingerprint(ctx, job, inputShas);
    if (config.cacheEnabled) {
      const hit = one(ctx.db, 'SELECT id FROM assets WHERE fingerprint = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1', fp, job.user_id);
      if (hit) {
        refund(ctx.db, job.user_id, job.cost, job.id, 'refund_cache');
        await finish({ ...ctx } as Ctx, { ...job, cost: 0 }, 'done', { results: [hit.id], cacheHit: true, message: 'Résultat identique déjà généré (cache)' });
        run(ctx.db, 'UPDATE jobs SET cost = 0 WHERE id = ?', job.id);
        return;
      }
    }
    const out = await execute(ctx, job, workDir, ac.signal);
    if (ac.signal.aborted) throw new CanceledError();
    setProgress(ctx, job.id, 95, 'Vérification');
    // Garde-fou de sortie (image, ou première image de la vidéo)
    if (config.safetyUrl) {
      let probeFile = out.file;
      if (out.kind === 'video') { probeFile = path.join(workDir, 'frame.jpg'); await ffmpeg(['-i', out.file, '-frames:v', '1', probeFile]); }
      if (await isBlockedImage(probeFile)) {
        run(ctx.db, "INSERT INTO audit_log (user_id, event, detail) VALUES (?, 'output_blocked', ?)", job.user_id, job.id);
        await finish(ctx, job, 'blocked', { error: 'Résultat bloqué par le contrôle de contenu', message: 'Bloqué' });
        return;
      }
    }
    const asset = await ingestAsset(ctx, {
      userId: job.user_id, file: out.file, mime: out.mime, kind: out.kind, prompt: job.prompt, jobId: job.id, origin: 'generated', fingerprint: fp,
      title: null,
    });
    await finish(ctx, job, 'done', { results: [asset.id], message: out.note ?? 'Terminé' });
  } catch (e) {
    if (e instanceof CanceledError || ac.signal.aborted) await finish(ctx, job, 'canceled', { message: 'Annulé' });
    else await finish(ctx, job, 'failed', { error: (e as Error).message.slice(0, 500), message: 'Échec' });
  } finally {
    clearInterval(poll);
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ok */ }
  }
}

export function claimNext(ctx: Ctx): Row | undefined {
  return ctx.db.prepare(`UPDATE jobs SET status = 'running', started_at = ?, attempts = attempts + 1, message = 'Démarrage', progress = 0
    WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1) AND status = 'queued' RETURNING *`).get(nowIso()) as Row | undefined;
}

export interface Worker { stop(): Promise<void> }

export function startWorker(ctx: Ctx, opts: { concurrency?: number; intervalMs?: number } = {}): Worker {
  const concurrency = opts.concurrency ?? config.workerConcurrency;
  let active = 0, stopped = false;
  const inflight = new Set<Promise<void>>();
  // Reprise après crash : les jobs « running » sans processus sont remis en file.
  run(ctx.db, "UPDATE jobs SET status = 'queued', progress = 0 WHERE status = 'running'");
  const tick = () => {
    while (!stopped && active < concurrency) {
      const job = claimNext(ctx);
      if (!job) break;
      active++;
      const p = processJob(ctx, job).catch(() => {}).finally(() => { active--; inflight.delete(p); });
      inflight.add(p);
    }
  };
  const timer = setInterval(tick, opts.intervalMs ?? 300);
  tick();
  return { async stop() { stopped = true; clearInterval(timer); await Promise.allSettled([...inflight]); } };
}
