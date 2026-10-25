import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { one, all, run, type Db, type Row } from './db.ts';
import { probe, makeThumb } from './ffmpeg.ts';
import { HttpError, nowIso, type Ctx } from './ctx.ts';
import { serializeAsset, EXT } from './serialize.ts';

export { serializeAsset, sniff } from './serialize.ts';

export interface AssetInput {
  userId: string; file: string; mime: string; kind: 'image' | 'video' | 'audio';
  title?: string | null; prompt?: string | null; jobId?: string | null; origin: 'generated' | 'upload'; fingerprint?: string | null;
}

export async function ingestAsset(ctx: Ctx, a: AssetInput): Promise<Row> {
  const id = crypto.randomUUID();
  const ext = EXT[a.mime] ?? 'bin';
  const key = `${a.userId}/${id}.${ext}`;
  const buf = fs.readFileSync(a.file);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  let width: number | null = null, height: number | null = null, duration: number | null = null;
  try {
    const p = await probe(a.file);
    width = p.width; height = p.height; duration = a.kind === 'image' ? null : p.duration;
  } catch { /* métadonnées facultatives */ }
  ctx.storage.put(key, buf);
  let thumbKey: string | null = null;
  if (a.kind !== 'audio') {
    const tmp = path.join(os.tmpdir(), `zodiak-thumb-${id}.jpg`);
    try {
      await makeThumb(a.file, tmp);
      thumbKey = `${a.userId}/${id}.thumb.jpg`;
      ctx.storage.put(thumbKey, fs.readFileSync(tmp));
    } catch { thumbKey = null; } finally { try { fs.unlinkSync(tmp); } catch { /* ok */ } }
  }
  run(ctx.db, `INSERT INTO assets (id, user_id, kind, mime, storage_key, thumb_key, width, height, duration, title, prompt, job_id, origin, fingerprint, sha256, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  id, a.userId, a.kind, a.mime, key, thumbKey, width, height, duration, a.title ?? null, a.prompt ?? null, a.jobId ?? null, a.origin, a.fingerprint ?? null, sha, nowIso());
  return one(ctx.db, 'SELECT * FROM assets WHERE id = ?', id)!;
}

export function getAsset(db: Db, userId: string, id: string): Row {
  const r = one(db, 'SELECT * FROM assets WHERE id = ? AND user_id = ?', id, userId);
  if (!r) throw new HttpError(404, 'not_found', 'Média introuvable');
  return r;
}

export function listAssets(db: Db, userId: string, q: { kind?: string; favorite?: boolean; q?: string; limit: number; cursor?: string }) {
  const where = ['user_id = ?']; const args: any[] = [userId];
  if (q.kind) { where.push('kind = ?'); args.push(q.kind); }
  if (q.favorite) where.push('favorite = 1');
  if (q.q) { where.push("(prompt LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')"); const like = `%${q.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`; args.push(like, like); }
  if (q.cursor) { where.push('created_at < ?'); args.push(q.cursor); }
  const rows = all(db, `SELECT * FROM assets WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id LIMIT ?`, ...args, q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { items: page.map(serializeAsset), nextCursor: rows.length > q.limit ? page[page.length - 1]!.created_at : null };
}

/** Supprime un média ; refuse s'il est utilisé comme référence par un personnage. */
export function deleteAsset(ctx: Ctx, userId: string, id: string): void {
  const a = getAsset(ctx.db, userId, id);
  run(ctx.db, 'UPDATE characters SET reference_asset_id = NULL WHERE reference_asset_id = ?', id);
  // Une entrée de cache partagée par plusieurs jobs : on retire l'id des résultats.
  for (const j of all(ctx.db, "SELECT id, result_asset_ids FROM jobs WHERE result_asset_ids LIKE ?", `%${id}%`)) {
    const ids = (JSON.parse(j.result_asset_ids) as string[]).filter((x) => x !== id);
    run(ctx.db, 'UPDATE jobs SET result_asset_ids = ? WHERE id = ?', JSON.stringify(ids), j.id);
  }
  run(ctx.db, 'DELETE FROM assets WHERE id = ?', id);
  ctx.storage.remove(a.storage_key);
  ctx.storage.remove(a.thumb_key);
}

