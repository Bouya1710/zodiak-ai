import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.ts';

test('mode multi : inscription, isolation, crédits, remboursement', async (t) => {
  const app = await boot({ MODE: 'multi', CREDITS_ENABLED: 'true', CREDITS_SIGNUP: '12', ADMIN_EMAIL: 'admin@ex.org', ADMIN_PASSWORD: 'motdepasse-admin' });
  t.after(app.close);
  assert.equal((await app.api('GET', '/api/auth/me')).status, 401);
  assert.equal((await app.api('POST', '/api/auth/register', { email: 'a@ex.org', password: 'court' })).status, 422);
  const reg = await app.api('POST', '/api/auth/register', { email: 'a@ex.org', password: 'motdepasse-a' });
  assert.equal(reg.status, 200);
  assert.equal(reg.body.user.credits, 12);

  const img = await app.run({ kind: 't2i', prompt: 'une barque', params: { seed: 1 } });
  assert.equal((await app.api('GET', '/api/credits')).body.balance, 11);

  const vid = await app.run({ kind: 'i2v', prompt: 'x', inputAssetId: img.assets[0].id, params: { duration: 2, fps: 12, draft: true } });
  assert.equal(vid.job.status, 'done', JSON.stringify(vid.job));
  const left = (await app.api('GET', '/api/credits')).body.balance;
  assert.equal(left, 11 - 4); // brouillon : ceil(10 × 0.4) = 4
  assert.equal((await app.api('POST', '/api/jobs', { kind: 't2v', prompt: 'x' })).status, 402); // 10 > 7

  // cache : crédits rendus
  await app.run({ kind: 't2i', prompt: 'une barque', params: { seed: 1 } });
  assert.equal((await app.api('GET', '/api/credits')).body.balance, left);

  // un autre utilisateur ne voit rien
  await app.api('POST', '/api/auth/logout');
  const b = await app.api('POST', '/api/auth/register', { email: 'b@ex.org', password: 'motdepasse-b' });
  assert.equal(b.status, 200);
  assert.equal((await app.api('GET', '/api/assets')).body.items.length, 0);
  assert.equal((await app.api('GET', img.assets[0].url)).status, 404);

  // seul l'admin crédite
  assert.equal((await app.api('POST', '/api/admin/credits', { userId: b.body.user.id, delta: 5, reason: 'x' })).status, 403);
  await app.api('POST', '/api/auth/logout');
  assert.equal((await app.api('POST', '/api/auth/login', { email: 'admin@ex.org', password: 'motdepasse-admin' })).status, 200);
  const adj = await app.api('POST', '/api/admin/credits', { userId: b.body.user.id, delta: 5, reason: 'cadeau' });
  assert.equal(adj.body.balance, 17);
});
