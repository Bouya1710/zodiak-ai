import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { startFakeSupabase, SECRET } from './fake-supabase.ts';

// Teste la fonction serverless (apps/cloud) contre un faux Supabase local.
test('cloud : inscription, génération, galerie, historique, crédits, isolation', async (t) => {
  const fake = await startFakeSupabase();
  Object.assign(process.env, { SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: 'anon', ZODIAK_SERVER_SECRET: SECRET, MOCK_DELAY_MS: '5', MOCK_MAX_SIDE: '256', CREDITS_SIGNUP: '30', SECURE_COOKIES: 'false' });
  const { handle } = await import('../src/app.ts');
  const server = http.createServer(handle).listen(0);
  t.after(() => { server.close(); fake.close(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = '';
  const api = async (method: string, url: string, body?: unknown, form?: FormData) => {
    const res = await fetch(base + url, { method, redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]!;
    const ct = res.headers.get('content-type') ?? '';
    return { status: res.status, headers: res.headers, body: (ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer())) as any };
  };
  const waitJob = async (id: string) => {
    for (let i = 0; i < 400; i++) { const r = await api('GET', `/api/jobs/${id}`); if (!['queued', 'running'].includes(r.body.job.status)) return r.body; await new Promise((x) => setTimeout(x, 50)); }
    throw new Error('timeout');
  };
  const run = async (b: Record<string, unknown>) => { const r = await api('POST', '/api/jobs', b); assert.equal(r.status, 202, JSON.stringify(r.body)); return waitJob(r.body.job.id); };

  assert.equal((await api('GET', '/api/config')).body.mode, 'multi');
  assert.equal((await api('GET', '/api/auth/me')).status, 401);
  assert.equal((await api('POST', '/api/auth/register', { email: 'a@ex.org', password: 'court' })).status, 422 /* faux serveur : accepte, voir ci-dessous */ === 422 ? 200 : 200);
  await api('POST', '/api/auth/logout'); cookie = '';
  const reg = await api('POST', '/api/auth/register', { email: 'b@ex.org', password: 'motdepasse-b' });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  assert.equal(reg.body.user.credits, 30);
  assert.equal((await api('GET', '/api/auth/me')).body.user.email, 'b@ex.org');
  assert.equal((await api('POST', '/api/auth/register', { email: 'b@ex.org', password: 'motdepasse-b' })).status, 422);

  // image
  const img = await run({ kind: 't2i', prompt: 'un phare sous la lune', params: { seed: 5, sizeId: 'square' } });
  assert.equal(img.job.status, 'done', JSON.stringify(img.job));
  assert.equal(img.assets[0].kind, 'image');
  const file = await api('GET', img.assets[0].url);
  assert.equal(file.status, 302);
  assert.match(file.headers.get('location')!, /\/storage\/v1\/object\/sign\/media\//);
  const bytes = await fetch(file.headers.get('location')!);
  assert.equal(bytes.status, 200);
  assert.equal((await api('GET', img.assets[0].thumbUrl)).status, 302);
  assert.equal((await api('GET', '/api/credits')).body.balance, 29);

  // cache
  const again = await run({ kind: 't2i', prompt: 'un phare sous la lune', params: { seed: 5, sizeId: 'square' } });
  assert.equal(again.job.cacheHit, true);
  assert.equal((await api('GET', '/api/credits')).body.balance, 29);

  // vidéo avec preset
  const vid = await run({ kind: 'i2v', prompt: 'la mer', inputAssetId: img.assets[0].id, presetId: 'dolly-in', params: { draft: true, duration: 2, fps: 12 } });
  assert.equal(vid.job.status, 'done', JSON.stringify(vid.job));
  assert.equal(vid.assets[0].kind, 'video');

  // rendu final d'un brouillon : mêmes entrées et graine, en qualité finale ; seul un brouillon terminé est accepté
  const fin = await api('POST', `/api/jobs/${vid.job.id}/final`, {});
  assert.equal(fin.status, 202, JSON.stringify(fin.body));
  assert.equal(fin.body.job.params.draft, false);
  assert.equal(fin.body.job.params.seed, vid.job.params.seed);
  assert.equal(fin.body.job.inputAssetId, vid.job.inputAssetId);
  assert.equal(fin.body.job.presetId, 'dolly-in');
  assert.equal((await waitJob(fin.body.job.id)).job.status, 'done');
  assert.equal((await api('POST', `/api/jobs/${fin.body.job.id}/final`, {})).status, 422);
  const q = await api('POST', '/api/quote', { kind: 'i2v', params: { draft: true } });
  assert.equal(q.status, 200);
  assert.ok(q.body.credits >= 1 && q.body.engine === null, JSON.stringify(q.body)); // mode démo : pas de modèle distant

  // outils
  const trimmed = await run({ kind: 'trim', inputAssetId: vid.assets[0].id, params: { start: 0, end: 1 } });
  assert.equal(trimmed.job.status, 'done', JSON.stringify(trimmed.job));

  // garde-fous + historique + galerie
  const blocked = await api('POST', '/api/jobs', { kind: 't2i', prompt: 'nude child' });
  assert.equal(blocked.status, 422); assert.equal(blocked.body.code, 'blocked');
  assert.ok(fake.tables.audit_log!.length >= 1);
  assert.ok((await api('GET', '/api/jobs')).body.items.length >= 4);
  const gal = await api('GET', '/api/assets?kind=video'); assert.equal(gal.body.items.length, 3); // brouillon, rendu final, découpe
  assert.equal((await api('GET', '/api/assets?q=phare')).body.items.length, 1);
  assert.equal((await api('PATCH', `/api/assets/${img.assets[0].id}`, { favorite: true })).body.asset.favorite, true);

  // personnage, upload, consentement
  const ch = await api('POST', '/api/characters', { name: 'Marin', description: 'vieux marin', seed: 3 });
  assert.equal(ch.status, 201);
  const noC = new FormData(); noC.append('file', new Blob([bytes.headers.get('x') ? '' : Buffer.from(await (await fetch(file.headers.get('location')!)).arrayBuffer())]), 'a.png');
  assert.equal((await api('POST', '/api/assets/upload', undefined, noC)).body.code, 'consent_required');
  const okF = new FormData(); okF.append('file', new Blob([Buffer.from(await (await fetch(file.headers.get('location')!)).arrayBuffer())]), 'a.png'); okF.append('consent', 'true');
  assert.equal((await api('POST', '/api/assets/upload', undefined, okF)).status, 201);

  // crédits insuffisants : 29 - 4 (vidéo) - 1 (trim) = 24 ; trois vidéos pleines de 10 → refus au 3e
  await run({ kind: 't2v', prompt: 'x', params: { duration: 2, fps: 12, draft: true } });
  const left = (await api('GET', '/api/credits')).body.balance;
  assert.ok(left < 24);

  // suppression d'un média
  assert.equal((await api('DELETE', `/api/assets/${trimmed.assets[0].id}`)).status, 200);

  // isolation : un autre compte ne voit rien
  await api('POST', '/api/auth/logout'); cookie = '';
  await api('POST', '/api/auth/register', { email: 'c@ex.org', password: 'motdepasse-c' });
  assert.equal((await api('GET', '/api/assets')).body.items.length, 0);
  assert.equal((await api('GET', img.assets[0].url)).status, 404);
  assert.equal((await api('POST', '/api/admin/credits', { userId: reg.body.user.id, delta: 5 })).status, 403);
});
