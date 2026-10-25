import type http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloud, assertCloudEnv } from './env.ts';
import * as supa from './supa.ts';
import { sessionFrom, cookieFor, refreshProfile, type Session } from './session.ts';
import { reconcile, ingest, backend } from './process.ts';
import { createJob } from './jobs.ts';
import { webhookSig, resultUrlFromWebhook } from './providers.ts';
import { Router, RateLimiter, makeReq, send, type Req } from '../../api/src/http.ts';
import { HttpError } from '../../api/src/ctx.ts';
import { catalog } from '../../api/src/catalog.ts';
import { NOTICES, checkPrompt, requireConsent } from '../../api/src/guardrails.ts';
import { serializeJob } from '../../api/src/plan.ts';
import { createToken, sessionFromToken } from './tokens.ts';
import { handleRpc } from './mcp.ts';
import * as oauth from './oauth.ts';
import { isOwner, ownerReport } from './admin.ts';
import { serializeAsset, sniff } from '../../api/src/serialize.ts';
import { probe } from '../../api/src/ffmpeg.ts';
import { config } from '../../api/src/config.ts';

type Row = Record<string, any>;
const limiter = new RateLimiter();
const lim = (n: unknown, d = 30) => Math.min(100, Math.max(1, Number.parseInt(String(n ?? ''), 10) || d));
const iso = () => new Date().toISOString();

interface CReq extends Req { s: Session | null; setSession: (s: Session) => void }
const need = (r: CReq): Session => { if (!r.s) throw new HttpError(401, 'unauthorized', 'Connexion requise'); return r.s; };

const serializeCharacter = (c: Row) => ({ id: c.id, name: c.name, description: c.description, referenceAssetId: c.reference_asset_id, loraName: c.lora_name, seed: c.seed, createdAt: c.created_at });
const sanitizeLike = (q: string) => q.replace(/[,()*\\%_]/g, ' ').trim().slice(0, 80);

function build(): Router {
  const R = new Router();
  const guard = (fn: (r: CReq) => unknown) => (r: Req) => fn(r as CReq);

  R.get('/api/config', () => ({
    mode: 'multi', creditsEnabled: cloud.creditsEnabled, backend: backend().id, registrationOpen: cloud.registrationOpen,
    notices: NOTICES, limits: { maxPromptLength: config.maxPromptLength, maxUploadMb: cloud.maxUploadMb },
  }));
  R.get('/api/catalog', () => ({
    models: catalog.models, cameraPresets: catalog.presets, templates: catalog.templates,
    sizes: catalog.sizes.map(({ id, label, width, height }) => ({ id, label, width, height })), costs: catalog.costs,
    engines: backend().id === 'fal' ? catalog.engines.map(({ id, kinds, name, vendor, tag, credits }) => ({ id, kinds, name, vendor, tag, credits })) : [],
  }));
  R.get('/api/health', async () => { const db = await supa.ping(); return { ok: db, db, storage: db, backend: backend().id }; });

  // ---------- Auth
  R.post('/api/auth/register', guard(async (r) => {
    if (!cloud.registrationOpen) throw new HttpError(403, 'forbidden', 'Les inscriptions sont fermées');
    if (!limiter.check(`auth:${r.ip}`, 10, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de tentatives');
    const b = await r.json();
    if (typeof b.email !== 'string' || typeof b.password !== 'string') throw new HttpError(422, 'invalid', 'E-mail et mot de passe requis');
    const email = b.email.trim().toLowerCase();
    const role = cloud.adminEmail && email === cloud.adminEmail ? 'admin' : 'user';
    await supa.register(email, b.password, role, cloud.creditsEnabled ? cloud.creditsSignup : 0);
    const t = await supa.passwordLogin(email, b.password);
    if (!t) throw new HttpError(500, 'internal', 'Compte créé mais connexion impossible');
    r.res.setHeader('set-cookie', cookieFor(t));
    const s = await sessionFromTokens(t.access_token);
    return { user: s.user };
  }));
  R.post('/api/auth/login', guard(async (r) => {
    if (!limiter.check(`auth:${r.ip}`, 10, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de tentatives');
    const b = await r.json();
    const t = typeof b.email === 'string' && typeof b.password === 'string' ? await supa.passwordLogin(b.email.trim().toLowerCase(), b.password) : null;
    if (!t) throw new HttpError(401, 'unauthorized', 'Identifiants invalides');
    r.res.setHeader('set-cookie', cookieFor(t));
    return { user: (await sessionFromTokens(t.access_token)).user };
  }));
  // Mot de passe oublié : e-mail Supabase, retour sur /api/auth/callback (code PKCE, vérificateur en cookie).
  R.post('/api/auth/recover', guard(async (r) => {
    if (!limiter.check(`recover:${r.ip}`, 5, 15 * 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de demandes, réessayez plus tard');
    const b = await r.json();
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(422, 'invalid', 'Adresse e-mail invalide');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    await supa.recover(email, `${oauth.origin(r.raw)}/api/auth/callback`, challenge);
    r.res.setHeader('set-cookie', `zodiak_pkce=${verifier}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=3600${cloud.secureCookies ? '; Secure' : ''}`);
    return { ok: true }; // même réponse que l'adresse existe ou non
  }));
  R.get('/api/auth/callback', guard(async (r) => {
    const code = r.query.get('code') ?? '';
    const verifier = r.cookies.zodiak_pkce ?? '';
    const t = code && verifier ? await supa.exchangeCode(code, verifier) : null;
    const clear = `zodiak_pkce=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${cloud.secureCookies ? '; Secure' : ''}`;
    r.res.writeHead(302, t ? { 'set-cookie': [cookieFor(t), clear], location: '/#/parametres?section=profil&nouveau-mdp=1' } : { 'set-cookie': clear, location: '/#/connexion?lien-expire=1' });
    r.res.end();
    return undefined;
  }));
  R.post('/api/auth/password', guard(async (r) => {
    const s = need(r);
    const b = await r.json();
    if (typeof b.password !== 'string' || b.password.length < 8) throw new HttpError(422, 'invalid', 'Mot de passe : 8 caractères minimum');
    await supa.setPassword(s.jwt, b.password);
    return { ok: true };
  }));
  // ---------- Profil et sécurité du compte
  R.get('/api/profile', guard(async (r) => {
    const s = need(r);
    const p = (await supa.select('profiles', { select: '*', limit: '1' }, s.jwt))[0] ?? {};
    const kinds = await supa.select('assets', { select: 'kind', origin: 'eq.generated', limit: '5000' }, s.jwt);
    const tokens = await supa.select('api_tokens', { select: 'id' }, s.jwt);
    return {
      email: s.user.email, displayName: p.display_name ?? null, owner: isOwner(s), credits: s.user.credits, createdAt: p.created_at,
      stats: { images: kinds.filter((k) => k.kind === 'image').length, videos: kinds.filter((k) => k.kind === 'video').length, connectors: tokens.length },
    };
  }));
  R.patch('/api/profile', guard(async (r) => {
    const s = need(r);
    const b = await r.json();
    const name = typeof b.displayName === 'string' ? b.displayName.trim().slice(0, 60) : '';
    const chk = checkPrompt(name);
    if (!chk.ok) throw new HttpError(422, 'invalid', 'Nom refusé');
    const row = await supa.setDisplayName(s.user.id, name);
    return { displayName: row?.display_name ?? null };
  }));
  R.post('/api/auth/logout-all', guard(async (r) => {
    const s = need(r);
    await supa.logoutAll(s.jwt);
    for (const t of await supa.select('api_tokens', { select: 'id' }, s.jwt)) await supa.write('delete', 'api_tokens', {}, t.id);
    r.res.setHeader('set-cookie', cookieFor(null));
    return { ok: true };
  }));
  R.post('/api/account/delete', guard(async (r) => {
    const s = need(r);
    if (!limiter.check(`delete:${s.user.id}`, 3, 60 * 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de tentatives');
    const b = await r.json();
    if (b.confirm !== 'SUPPRIMER') throw new HttpError(422, 'invalid', 'Tapez SUPPRIMER pour confirmer');
    await supa.write('insert', 'audit_log', { user_id: s.user.id, event: 'account_deleted', detail: s.user.email.replace(/^(.).*@/, '$1***@') });
    await supa.deleteUser(s.user.id);
    r.res.setHeader('set-cookie', cookieFor(null));
    return { ok: true };
  }));

  R.post('/api/auth/logout', (r) => { r.res.setHeader('set-cookie', cookieFor(null)); return { ok: true }; });
  R.get('/api/auth/me', guard((r) => ({ user: need(r).user })));

  // ---------- Jobs
  R.post('/api/jobs', guard(async (r) => {
    const s = need(r);
    if (!limiter.check(`job:${s.user.id}`, 40, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de demandes, patientez un instant');
    send(r.res, 202, { job: serializeJob(await createJob(s, await r.json())) });
    return undefined;
  }));

  R.get('/api/jobs', guard(async (r) => {
    const s = need(r);
    const q: Record<string, string> = { select: '*', order: 'created_at.desc,id.asc', limit: String(lim(r.query.get('limit')) + 1) };
    if (r.query.get('status')) q.status = `eq.${r.query.get('status')}`;
    if (r.query.get('kind')) q.kind = `eq.${r.query.get('kind')}`;
    if (r.query.get('cursor')) q.created_at = `lt.${r.query.get('cursor')}`;
    const rows = await supa.select('jobs', q, s.jwt);
    const limit = lim(r.query.get('limit'));
    const page = rows.slice(0, limit);
    return { items: page.map(serializeJob), nextCursor: rows.length > limit ? page[page.length - 1]!.created_at : null };
  }));

  const ownJob = async (s: Session, id: string): Promise<Row> => {
    const j = (await supa.select('jobs', { id: `eq.${id}`, select: '*' }, s.jwt))[0];
    if (!j) throw new HttpError(404, 'not_found', 'Job introuvable');
    return j;
  };

  R.get('/api/jobs/:id', guard(async (r) => {
    const s = need(r);
    let j = await ownJob(s, r.params.id!);
    j = await reconcile(s, j);
    const ids: string[] = JSON.parse(j.result_asset_ids);
    const assets = ids.length ? await supa.select('assets', { id: `in.(${ids.join(',')})`, select: '*' }, s.jwt) : [];
    return { job: serializeJob(j), assets: assets.map(serializeAsset) };
  }));
  // Pas de SSE sur Vercel : le navigateur bascule sur le suivi par interrogation (polling).
  R.get('/api/jobs/:id/events', () => { throw new HttpError(404, 'not_found', 'SSE indisponible : suivi par interrogation'); });

  R.post('/api/jobs/:id/cancel', guard(async (r) => {
    const s = need(r);
    const j = await ownJob(s, r.params.id!);
    if (['queued', 'running'].includes(j.status)) {
      await supa.write('update', 'jobs', { status: 'canceled', message: 'Annulé', finished_at: iso(), cancel_requested: true }, j.id);
      if (cloud.creditsEnabled && j.cost > 0) await supa.credits(s.user.id, j.cost, 'refund_canceled', j.id).catch(() => {});
    }
    return { job: serializeJob(await ownJob(s, j.id)) };
  }));
  R.delete('/api/jobs/:id', guard(async (r) => {
    const s = need(r);
    const j = await ownJob(s, r.params.id!);
    if (['queued', 'running'].includes(j.status)) throw new HttpError(409, 'invalid', 'Annulez le job avant de le supprimer');
    await supa.write('delete', 'jobs', {}, j.id);
    return { ok: true };
  }));

  // Webhook fournisseur : enregistre l'URL du résultat ; la clôture (stockage) a lieu au prochain suivi du job.
  const hook = async (r: Req) => {
    const provider = r.url.pathname.split('/').pop()!;
    const jobId = r.query.get('job') ?? '';
    const sig = r.query.get('sig') ?? '';
    if (!/^[0-9a-f-]{36}$/.test(jobId) || sig !== webhookSig(jobId)) throw new HttpError(403, 'forbidden', 'Signature invalide');
    const body = await r.json();
    const job = await supa.write('get', 'jobs', {}, jobId);
    if (!job || job.provider !== provider || !['running', 'queued'].includes(job.status)) return { ok: true };
    const url = resultUrlFromWebhook(provider, body);
    const urls = JSON.parse(job.provider_urls ?? '{}');
    if (url) await supa.write('update', 'jobs', { provider_urls: JSON.stringify({ ...urls, result: url }), progress: 90, message: 'Résultat prêt' }, jobId);
    else if (body?.status === 'FAILED' || body?.error) await supa.write('update', 'jobs', { provider_urls: JSON.stringify({ ...urls, result: '' }), message: 'Échec signalé' }, jobId);
    return { ok: true };
  };
  R.post('/api/webhooks/fal', hook);
  R.post('/api/webhooks/runpod', hook);

  // ---------- Assets
  R.get('/api/assets', guard(async (r) => {
    const s = need(r);
    const limit = lim(r.query.get('limit'));
    const q: Record<string, string> = { select: '*', order: 'created_at.desc,id.asc', limit: String(limit + 1) };
    if (r.query.get('kind')) q.kind = `eq.${r.query.get('kind')}`;
    if (r.query.get('favorite') === '1') q.favorite = 'eq.true';
    const text = sanitizeLike(r.query.get('q') ?? '');
    if (text) q.or = `(prompt.ilike.*${text}*,title.ilike.*${text}*)`;
    if (r.query.get('cursor')) q.created_at = `lt.${r.query.get('cursor')}`;
    const rows = await supa.select('assets', q, s.jwt);
    const page = rows.slice(0, limit);
    return { items: page.map(serializeAsset), nextCursor: rows.length > limit ? page[page.length - 1]!.created_at : null };
  }));

  const ownAsset = async (s: Session, id: string): Promise<Row> => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, 'not_found', 'Média introuvable');
    const a = (await supa.select('assets', { id: `eq.${id}`, select: '*' }, s.jwt))[0];
    if (!a) throw new HttpError(404, 'not_found', 'Média introuvable');
    return a;
  };

  R.post('/api/assets/upload', guard(async (r) => {
    const s = need(r);
    const maxBytes = cloud.maxUploadMb * 1024 * 1024;
    const { fields, file } = await r.multipart(maxBytes);
    if (!file || !file.data.length) throw new HttpError(422, 'invalid', 'Fichier manquant');
    if (file.data.length > maxBytes) throw new HttpError(413, 'invalid', `Fichier trop volumineux (max ${cloud.maxUploadMb} Mo en ligne)`);
    const sn = sniff(file.data);
    if (!sn) throw new HttpError(422, 'invalid', 'Format non pris en charge (PNG, JPEG, WebP, MP4, WebM, WAV, MP3, OGG)');
    const tmp = path.join(os.tmpdir(), `zodiak-up-${crypto.randomUUID()}`);
    fs.writeFileSync(tmp, file.data);
    try {
      let kind: 'image' | 'video' | 'audio' = sn.kind === 'container' ? 'video' : sn.kind;
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
      const row = await ingest(s, { file: tmp, mime, kind, title: (fields.title || file.name || '').slice(0, 120) || null, origin: 'upload' });
      send(r.res, 201, { asset: serializeAsset(row) });
      return undefined;
    } finally { try { fs.unlinkSync(tmp); } catch { /* ok */ } }
  }));

  R.get('/api/assets/:id', guard(async (r) => ({ asset: serializeAsset(await ownAsset(need(r), r.params.id!)) })));
  const redirectTo = (key: 'storage_key' | 'thumb_key') => guard(async (r) => {
    const s = need(r);
    const a = await ownAsset(s, r.params.id!);
    if (!a[key]) throw new HttpError(404, 'not_found', 'Pas de vignette');
    const url = await supa.signedUrl(a[key], s.jwt, 3600);
    r.res.writeHead(302, { location: url, 'cache-control': 'private, max-age=600' });
    r.res.end();
    return undefined;
  });
  R.get('/api/assets/:id/file', redirectTo('storage_key'));
  R.get('/api/assets/:id/thumb', redirectTo('thumb_key'));

  R.patch('/api/assets/:id', guard(async (r) => {
    const s = need(r);
    const a = await ownAsset(s, r.params.id!);
    const b = await r.json();
    const patch: Row = {};
    if (typeof b.favorite === 'boolean') patch.favorite = b.favorite;
    if (typeof b.title === 'string') patch.title = b.title.trim().slice(0, 120) || null;
    const row = Object.keys(patch).length ? await supa.write('update', 'assets', patch, a.id) : a;
    return { asset: serializeAsset(row!) };
  }));
  R.delete('/api/assets/:id', guard(async (r) => {
    const s = need(r);
    const a = await ownAsset(s, r.params.id!);
    for (const c of await supa.select('characters', { reference_asset_id: `eq.${a.id}`, select: 'id' }, s.jwt)) await supa.write('update', 'characters', { reference_asset_id: null }, c.id);
    for (const j of await supa.select('jobs', { result_asset_ids: `ilike.*${a.id}*`, select: 'id,result_asset_ids' }, s.jwt)) {
      await supa.write('update', 'jobs', { result_asset_ids: JSON.stringify((JSON.parse(j.result_asset_ids) as string[]).filter((x) => x !== a.id)) }, j.id);
    }
    await supa.write('delete', 'assets', {}, a.id);
    await supa.removeObjects([a.storage_key, a.thumb_key], s.jwt);
    return { ok: true };
  }));

  // ---------- Personnages
  R.get('/api/characters', guard(async (r) => ({ items: (await supa.select('characters', { select: '*', order: 'created_at.desc' }, need(r).jwt)).map(serializeCharacter) })));
  R.post('/api/characters', guard(async (r) => {
    const s = need(r); const b = await r.json();
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    const description = typeof b.description === 'string' ? b.description.trim().slice(0, 600) : '';
    if (!name) throw new HttpError(422, 'invalid', 'Nom requis');
    const chk = checkPrompt(name, description);
    if (!chk.ok) {
      await supa.write('insert', 'audit_log', { user_id: s.user.id, event: 'character_blocked', detail: `${chk.category}: ${description.slice(0, 200)}` });
      throw new HttpError(422, 'blocked', 'Demande refusée', chk.reason);
    }
    if (b.referenceAssetId) await ownAsset(s, String(b.referenceAssetId));
    const lora = typeof b.loraName === 'string' && /^[\w.\-/ ]{1,120}$/.test(b.loraName) && !b.loraName.includes('..') ? b.loraName : null;
    const row = await supa.write('insert', 'characters', {
      user_id: s.user.id, name, description, reference_asset_id: b.referenceAssetId ? String(b.referenceAssetId) : null, lora_name: lora, seed: Number.isInteger(b.seed) ? b.seed : null,
    });
    send(r.res, 201, { character: serializeCharacter(row!) });
    return undefined;
  }));
  R.delete('/api/characters/:id', guard(async (r) => {
    const s = need(r);
    const c = (await supa.select('characters', { id: `eq.${r.params.id}`, select: 'id' }, s.jwt))[0];
    if (!c) throw new HttpError(404, 'not_found', 'Personnage introuvable');
    await supa.write('delete', 'characters', {}, c.id);
    return { ok: true };
  }));

  // ---------- Crédits
  R.get('/api/credits', guard(async (r) => {
    const s = need(r);
    const ledger = await supa.select('credit_ledger', { select: 'id,delta,reason,job_id,created_at', order: 'id.desc', limit: '50' }, s.jwt);
    return { balance: (await refreshProfile(s)).credits, creditsEnabled: cloud.creditsEnabled, ledger: ledger.map((l) => ({ id: l.id, delta: l.delta, reason: l.reason, jobId: l.job_id, createdAt: l.created_at })) };
  }));
  // ---------- Suivi des dépenses (propriétaire du site)
  R.get('/api/admin/usage', guard(async (r) => {
    const s = need(r);
    if (!isOwner(s)) throw new HttpError(403, 'forbidden', 'Réservé au propriétaire du site');
    return ownerReport();
  }));

  // ---------- Clés de connecteur (MCP)
  R.get('/api/tokens', guard(async (r) => {
    const rows = await supa.select('api_tokens', { select: 'id,label,created_at,last_used_at', order: 'created_at.desc' }, need(r).jwt);
    return { items: rows.map((t) => ({ id: t.id, label: t.label, createdAt: t.created_at, lastUsedAt: t.last_used_at })), owner: isOwner(need(r)) };
  }));
  R.post('/api/tokens', guard(async (r) => {
    const s = need(r);
    if (!limiter.check(`auth:${r.ip}`, 10, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de tentatives');
    const b = await r.json();
    if ((await supa.select('api_tokens', { select: 'id' }, s.jwt)).length >= 10) throw new HttpError(422, 'invalid', 'Maximum 10 accès : retirez-en un');
    const t = await createToken(s.user, typeof b.label === 'string' ? b.label.trim() : 'Clé manuelle');
    send(r.res, 201, { id: t.id, token: t.token, url: `${cloud.publicUrl || `https://${r.raw.headers.host}`}/api/mcp/${t.token}` });
    return undefined;
  }));
  R.delete('/api/tokens/:id', guard(async (r) => {
    const s = need(r);
    const t = (await supa.select('api_tokens', { id: `eq.${r.params.id}`, select: 'id' }, s.jwt))[0];
    if (!t) throw new HttpError(404, 'not_found', 'Clé introuvable');
    await supa.write('delete', 'api_tokens', {}, t.id);
    return { ok: true };
  }));

  // ---------- Connecteur MCP (Claude) : clé dans l'URL ou en en-tête Authorization
  const mcp = async (r: Req) => {
    const key = r.params.token ?? String(r.raw.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!limiter.check(`mcp:${r.ip}`, 120, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de demandes');
    let s: Session;
    try { s = await sessionFromToken(key); } catch (e) {
      // Sans clé valide : le client découvre le serveur OAuth (spécification MCP « Authorization »).
      r.res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': `Bearer resource_metadata="${oauth.origin(r.raw)}/.well-known/oauth-protected-resource"` });
      r.res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : 'unauthorized' }));
      return undefined;
    }
    const body = await r.json();
    const out = Array.isArray(body) ? (await Promise.all(body.map((m) => handleRpc(s, m)))).filter(Boolean) : await handleRpc(s, body);
    if (out === null || (Array.isArray(out) && !out.length)) { r.res.writeHead(202); r.res.end(); return undefined; }
    return out;
  };
  R.post('/api/mcp', mcp);
  R.post('/api/mcp/:token', mcp);
  R.get('/api/mcp', () => { throw new HttpError(405, 'invalid', 'POST uniquement (MCP Streamable HTTP)'); });

  // ---------- OAuth 2.1 du connecteur (Claude : Paramètres → Connecteurs → ajouter l'URL /api/mcp)
  R.get('/.well-known/oauth-protected-resource', (r) => oauth.protectedResource(r.raw));
  R.get('/.well-known/oauth-protected-resource/api/mcp', (r) => oauth.protectedResource(r.raw));
  R.get('/.well-known/oauth-authorization-server', (r) => oauth.authServer(r.raw));
  R.post('/api/oauth/register', async (r) => {
    if (!limiter.check(`oauth:${r.ip}`, 20, 60_000)) throw new HttpError(429, 'rate_limited', 'Trop de demandes');
    send(r.res, 201, oauth.register(await r.json()));
    return undefined;
  });
  R.post('/api/oauth/token', async (r) => {
    try { return oauth.token(await oauth.formBody(r.raw)); } catch (e) {
      send(r.res, 400, { error: (e as any).oauth ?? 'invalid_request', error_description: (e as Error).message });
      return undefined;
    }
  });
  const html = (r: Req, code: number, body: string) => { r.res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.res.end(body); return undefined; };
  // La réécriture Vercel (/oauth/:path*) ajoute « path » à la requête : on le retire.
  const authQuery = (r: Req) => { const q = new URLSearchParams(r.query); q.delete('path'); return q; };
  R.get('/oauth/authorize', guard(async (r) => {
    const q = authQuery(r);
    const a = oauth.authRequest(q);
    if (!r.s) { r.res.writeHead(302, { location: `/#/connexion?retour=${encodeURIComponent(`/oauth/authorize?${q}`)}` }); r.res.end(); return undefined; }
    return html(r, 200, oauth.consentPage(a, r.s.user.email, q.toString()));
  }));
  R.post('/oauth/authorize', guard(async (r) => {
    const s = need(r);
    const a = oauth.authRequest(authQuery(r));
    const f = await oauth.formBody(r.raw);
    const to = f.get('decision') === 'allow' ? await oauth.approve(s, a) : oauth.denyUrl(a);
    r.res.writeHead(302, { location: to }); r.res.end();
    return undefined;
  }));


  R.post('/api/admin/credits', guard(async (r) => {
    const s = need(r);
    if (s.user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Réservé aux administrateurs');
    const b = await r.json();
    if (!/^[0-9a-f-]{36}$/.test(String(b.userId)) || !Number.isInteger(b.delta) || b.delta === 0) throw new HttpError(422, 'invalid', 'userId / delta invalides');
    return { balance: await supa.credits(String(b.userId), b.delta, String(b.reason ?? 'admin'), undefined) };
  }));
  return R;
}

async function sessionFromTokens(access: string): Promise<Session> {
  const rows = await supa.select('profiles', { select: '*', limit: '1' }, access);
  const r = rows[0]!;
  return { jwt: access, user: { id: r.id, email: r.email, role: r.role, credits: cloud.creditsEnabled ? Number(r.credits) : 0, name: r.display_name ?? null } };
}

let router: Router | null = null;

export async function handle(raw: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const r = makeReq(raw, res) as CReq;
  try {
    assertCloudEnv();
    router ??= build();
    const m = router.match(r.method === 'HEAD' ? 'GET' : r.method, r.url.pathname);
    if (!m) throw new HttpError(404, 'not_found', 'Route inconnue');
    if (m === 'method') throw new HttpError(405, 'invalid', 'Méthode non autorisée');
    r.params = m.params;
    if (!['GET', 'HEAD'].includes(r.method) && !/^\/(api\/(webhooks|mcp|oauth)|\.well-known)(\/|$)/.test(r.url.pathname) && r.url.pathname !== '/api/auth/callback' && raw.headers.origin) {
      if (new URL(raw.headers.origin).host !== raw.headers.host) throw new HttpError(403, 'forbidden', 'Origine refusée');
    }
    if (!/^\/(api\/(webhooks|mcp|oauth)|\.well-known)(\/|$)/.test(r.url.pathname)) r.s = await sessionFrom(raw, res);
    const out = await m.handler(r);
    if (out !== undefined && !res.headersSent) send(res, 200, out);
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    if (e instanceof HttpError) send(res, e.status, { error: e.message, code: e.code, ...(e.reason ? { reason: e.reason } : {}) });
    else { console.error('[erreur]', e); send(res, 500, { error: 'Erreur interne', code: 'internal' }); }
  }
}
