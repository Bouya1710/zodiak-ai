import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.ts';
import { catalog } from './catalog.ts';
import { NOTICES, checkPrompt, requireConsent } from './guardrails.ts';
import { Router, RateLimiter, send, sendFile, type Req } from './http.ts';
import { HttpError, nowIso, type Ctx } from './ctx.ts';
import * as auth from './auth.ts';
import * as credits from './credits.ts';
import { cancelJob, createJob, deleteJob, getJob, jobWithAssets, listJobs, serializeJob } from './jobs.ts';
import { deleteAsset, getAsset, ingestAsset, listAssets, serializeAsset, sniff } from './assets.ts';
import { one, all, run } from './db.ts';
import { probe } from './ffmpeg.ts';

const limiter = new RateLimiter();
const lim = (n: unknown, d = 30) => Math.min(100, Math.max(1, Number.parseInt(String(n ?? ''), 10) || d));

function need(r: Req): auth.User {
  if (!r.user) throw new HttpError(401, 'unauthorized', 'Connexion requise');
  return r.user;
}

function sessionCookie(token: string, expires: Date | null): string {
  const base = `${auth.COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${config.secureCookies ? '; Secure' : ''}`;
  return expires ? `${base}; Expires=${expires.toUTCString()}` : `${base}; Max-Age=0`;
}

const serializeCharacter = (c: any) => ({
  id: c.id, name: c.name, description: c.description, referenceAssetId: c.reference_asset_id, loraName: c.lora_name, seed: c.seed, createdAt: c.created_at,
});

export function buildRouter(ctx: Ctx): Router {
  const R = new Router();

  R.get('/api/config', () => ({
    mode: config.mode, creditsEnabled: config.creditsEnabled, backend: ctx.backend.id,
    registrationOpen: config.mode === 'multi' && config.registrationOpen,
    notices: NOTICES, limits: { maxPromptLength: config.maxPromptLength, maxUploadMb: config.maxUploadMb },
  }));

  R.get('/api/catalog', () => ({
    models: catalog.models, cameraPresets: catalog.presets, templates: catalog.templates,
    sizes: catalog.sizes.map(({ id, label, width, height }) => ({ id, label, width, height })),
    costs: catalog.costs,
  }));

  R.get('/api/health', () => {
    let db = true; try { one(ctx.db, 'SELECT 1 AS x'); } catch { db = false; }
    return ctx.backend.health().then((b) => ({ ok: db && ctx.storage.health(), db, storage: ctx.storage.health(), backend: ctx.backend.id, backendReachable: b }));
  });

  // ---------- Auth
  R.post('/api/auth/register', async (r) => {
    if (!limiter.check(`auth:${r.ip}`, 10, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de tentatives');
    const b = await r.json();
    const user = auth.register(ctx.db, b.email, b.password);
    const s = auth.login(ctx.db, b.email, b.password);
    r.res.setHeader('set-cookie', sessionCookie(s.session, s.expires));
    return { user };
  });
  R.post('/api/auth/login', async (r) => {
    if (config.mode === 'personal') return { user: auth.ensureLocalUser(ctx.db) };
    if (!limiter.check(`auth:${r.ip}`, 10, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de tentatives');
    const b = await r.json();
    const s = auth.login(ctx.db, b.email, b.password);
    r.res.setHeader('set-cookie', sessionCookie(s.session, s.expires));
    return { user: s.user };
  });
  R.post('/api/auth/logout', (r) => {
    auth.logout(ctx.db, r.cookies[auth.COOKIE]);
    r.res.setHeader('set-cookie', sessionCookie('', null));
    return { ok: true };
  });
  R.get('/api/auth/me', (r) => ({ user: need(r) }));

  // ---------- Jobs
  R.post('/api/jobs', async (r) => {
    const u = need(r);
    if (!limiter.check(`job:${u.id}`, 60, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de demandes, patientez un instant');
    const job = await createJob(ctx, u, await r.json());
    send(r.res, 202, { job });
    return undefined;
  });
  R.get('/api/jobs', (r) => listJobs(ctx, need(r).id, { status: r.query.get('status') ?? undefined, kind: r.query.get('kind') ?? undefined, limit: lim(r.query.get('limit')), cursor: r.query.get('cursor') ?? undefined }));
  R.get('/api/jobs/:id', (r) => jobWithAssets(ctx, need(r).id, r.params.id!));
  R.post('/api/jobs/:id/cancel', (r) => ({ job: cancelJob(ctx, need(r).id, r.params.id!) }));
  R.delete('/api/jobs/:id', (r) => { deleteJob(ctx, need(r).id, r.params.id!); return { ok: true }; });

  // SSE : lit l'état en base (le worker peut être un autre processus)
  R.get('/api/jobs/:id/events', (r) => {
    const u = need(r);
    getJob(ctx, u.id, r.params.id!);
    const res = r.res;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    let last = '';
    let beat = 0;
    const emit = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const tick = () => {
      const row = one(ctx.db, 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', r.params.id, u.id);
      if (!row) { emit('done', { job: null }); clearInterval(t); res.end(); return; }
      const key = `${row.status}|${row.progress}|${row.message}`;
      if (key !== last) { last = key; emit('progress', { status: row.status, progress: row.progress, message: row.message }); }
      if (!['queued', 'running'].includes(row.status)) { emit('done', { job: serializeJob(row) }); clearInterval(t); res.end(); return; }
      if (++beat % 30 === 0) res.write(': ping\n\n');
    };
    const t = setInterval(tick, 400);
    r.raw.on('close', () => clearInterval(t));
    tick();
    return undefined;
  });

  // ---------- Assets
  R.get('/api/assets', (r) => listAssets(ctx.db, need(r).id, { kind: r.query.get('kind') ?? undefined, favorite: r.query.get('favorite') === '1', q: r.query.get('q') ?? undefined, limit: lim(r.query.get('limit')), cursor: r.query.get('cursor') ?? undefined }));

  R.post('/api/assets/upload', async (r) => {
    const u = need(r);
    const { fields, file } = await r.multipart(config.maxUploadMb * 1024 * 1024);
    if (!file || !file.data.length) throw new HttpError(422, 'invalid', 'Fichier manquant');
    if (file.data.length > config.maxUploadMb * 1024 * 1024) throw new HttpError(413, 'invalid', 'Fichier trop volumineux');
    const sn = sniff(file.data);
    if (!sn) throw new HttpError(422, 'invalid', 'Format non pris en charge (PNG, JPEG, WebP, MP4, WebM, WAV, MP3, OGG)');
    const tmp = path.join(os.tmpdir(), `zodiak-up-${crypto.randomUUID()}`);
    fs.writeFileSync(tmp, file.data);
    try {
      let kind = sn.kind === 'container' ? 'video' : sn.kind;
      let mime = sn.mime;
      if (sn.kind === 'container' || sn.kind === 'video') {
        const p = await probe(tmp).catch(() => null);
        if (!p) throw new HttpError(422, 'invalid', 'Fichier multimédia illisible');
        if (!p.hasVideo && p.hasAudio) { kind = 'audio'; mime = 'audio/mp4'; }
        else if (!p.hasVideo) throw new HttpError(422, 'invalid', 'Fichier multimédia illisible');
      }
      if (kind !== 'audio') {
        const c = requireConsent(true, fields.consent);
        if (!c.ok) throw new HttpError(422, 'consent_required', 'Consentement requis', c.reason);
      }
      const row = await ingestAsset(ctx, { userId: u.id, file: tmp, mime, kind: kind as 'image' | 'video' | 'audio', title: (fields.title || file.name || '').slice(0, 120) || null, origin: 'upload' });
      send(r.res, 201, { asset: serializeAsset(row) });
      return undefined;
    } finally { try { fs.unlinkSync(tmp); } catch { /* ok */ } }
  });

  R.get('/api/assets/:id', (r) => ({ asset: serializeAsset(getAsset(ctx.db, need(r).id, r.params.id!)) }));
  R.get('/api/assets/:id/file', (r) => {
    const a = getAsset(ctx.db, need(r).id, r.params.id!);
    sendFile(r, ctx.storage.resolve(a.storage_key), a.mime, { 'cache-control': 'private, max-age=3600' });
    return undefined;
  });
  R.get('/api/assets/:id/thumb', (r) => {
    const a = getAsset(ctx.db, need(r).id, r.params.id!);
    if (!a.thumb_key) throw new HttpError(404, 'not_found', 'Pas de vignette');
    sendFile(r, ctx.storage.resolve(a.thumb_key), 'image/jpeg', { 'cache-control': 'private, max-age=3600' });
    return undefined;
  });
  R.patch('/api/assets/:id', async (r) => {
    const u = need(r); const b = await r.json(); getAsset(ctx.db, u.id, r.params.id!);
    if (typeof b.favorite === 'boolean') run(ctx.db, 'UPDATE assets SET favorite = ? WHERE id = ?', b.favorite ? 1 : 0, r.params.id);
    if (typeof b.title === 'string') run(ctx.db, 'UPDATE assets SET title = ? WHERE id = ?', b.title.trim().slice(0, 120) || null, r.params.id);
    return { asset: serializeAsset(getAsset(ctx.db, u.id, r.params.id!)) };
  });
  R.delete('/api/assets/:id', (r) => { deleteAsset(ctx, need(r).id, r.params.id!); return { ok: true }; });

  // ---------- Personnages
  R.get('/api/characters', (r) => ({ items: all(ctx.db, 'SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC', need(r).id).map(serializeCharacter) }));
  R.post('/api/characters', async (r) => {
    const u = need(r); const b = await r.json();
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    const description = typeof b.description === 'string' ? b.description.trim().slice(0, 600) : '';
    if (!name) throw new HttpError(422, 'invalid', 'Nom requis');
    const chk = checkPrompt(name, description);
    if (!chk.ok) {
      run(ctx.db, "INSERT INTO audit_log (user_id, event, detail) VALUES (?, 'character_blocked', ?)", u.id, `${chk.category}: ${description.slice(0, 200)}`);
      throw new HttpError(422, 'blocked', 'Demande refusée', chk.reason);
    }
    if (b.referenceAssetId) getAsset(ctx.db, u.id, String(b.referenceAssetId));
    const lora = typeof b.loraName === 'string' && /^[\w.\-/ ]{1,120}$/.test(b.loraName) && !b.loraName.includes('..') ? b.loraName : null;
    const seed = Number.isInteger(b.seed) ? b.seed : null;
    const id = crypto.randomUUID();
    run(ctx.db, 'INSERT INTO characters (id, user_id, name, description, reference_asset_id, lora_name, seed, created_at) VALUES (?,?,?,?,?,?,?,?)',
      id, u.id, name, description, b.referenceAssetId ? String(b.referenceAssetId) : null, lora, seed, nowIso());
    send(r.res, 201, { character: serializeCharacter(one(ctx.db, 'SELECT * FROM characters WHERE id = ?', id)) });
    return undefined;
  });
  R.delete('/api/characters/:id', (r) => {
    const u = need(r);
    if (!one(ctx.db, 'SELECT 1 AS x FROM characters WHERE id = ? AND user_id = ?', r.params.id, u.id)) throw new HttpError(404, 'not_found', 'Personnage introuvable');
    run(ctx.db, 'UPDATE jobs SET character_id = NULL WHERE character_id = ?', r.params.id);
    run(ctx.db, 'DELETE FROM characters WHERE id = ?', r.params.id);
    return { ok: true };
  });

  // ---------- Crédits
  R.get('/api/credits', (r) => {
    const u = need(r);
    return { balance: auth.refreshUser(ctx.db, u.id).credits, creditsEnabled: config.creditsEnabled, ledger: credits.ledger(ctx.db, u.id) };
  });
  R.post('/api/admin/credits', async (r) => {
    const u = need(r);
    if (u.role !== 'admin') throw new HttpError(403, 'forbidden', 'Réservé aux administrateurs');
    const b = await r.json();
    return { balance: credits.adjust(ctx.db, String(b.userId), Number(b.delta), String(b.reason ?? 'admin')) };
  });

  return R;
}
