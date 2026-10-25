import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.ts';

// Parcours complet en mode personnel avec le backend mock (aucun GPU) : phases 1, 2 et 3.
test('phases 1-3 en mode personnel (mock)', async (t) => {
  const app = await boot();
  t.after(app.close);

  const cfg = await app.api('GET', '/api/config');
  assert.equal(cfg.body.mode, 'personal');
  assert.equal((await app.api('GET', '/api/auth/me')).status, 200);

  // Phase 1 : texte → image
  const img = await app.run({ kind: 't2i', prompt: 'un phare sous la lune', params: { sizeId: 'square', seed: 42 } });
  assert.equal(img.job.status, 'done');
  assert.equal(img.assets[0].kind, 'image');
  const png = await app.api('GET', img.assets[0].url);
  assert.equal(png.headers.get('content-type'), 'image/png');
  assert.equal((await app.api('GET', img.assets[0].thumbUrl)).status, 200);

  // cache : même graine, même prompt
  const again = await app.run({ kind: 't2i', prompt: 'un phare sous la lune', params: { sizeId: 'square', seed: 42 } });
  assert.equal(again.job.cacheHit, true);
  assert.equal(again.assets[0].id, img.assets[0].id);

  // Phase 1 : image → vidéo (brouillon) avec preset de caméra (phase 2)
  const vid = await app.run({ kind: 'i2v', prompt: 'la mer bouge', inputAssetId: img.assets[0].id, presetId: 'dolly-in', params: { draft: true, duration: 2, fps: 12 } });
  assert.equal(vid.job.status, 'done', JSON.stringify(vid.job));
  assert.equal(vid.assets[0].kind, 'video');
  assert.ok(vid.assets[0].duration > 1.5);
  const range = await fetch(app.base + vid.assets[0].url, { headers: { range: 'bytes=0-99' } });
  assert.equal(range.status, 206);
  await range.arrayBuffer();

  // Phase 2 : modèle de prompt + personnage cohérent
  const tpl = await app.run({ kind: 't2i', templateId: 'portrait-cine', params: { variables: { sujet: 'une marinière aux cheveux argentés' }, seed: 1 } });
  assert.equal(tpl.job.status, 'done', JSON.stringify(tpl.job));
  assert.match(tpl.job.prompt, /marinière/);
  const ch = await app.api('POST', '/api/characters', { name: 'Marin', description: 'vieux marin barbu, ciré jaune', referenceAssetId: img.assets[0].id, seed: 5 });
  assert.equal(ch.status, 201);
  const withChar = await app.run({ kind: 't2i', prompt: 'sur le quai', characterId: ch.body.character.id });
  assert.equal(withChar.job.params.seed, 5);

  // Phase 3 : outils
  const up = await app.run({ kind: 'upscale', inputAssetId: img.assets[0].id, params: { scale: 2 } });
  assert.equal(up.job.status, 'done', JSON.stringify(up.job));
  assert.equal(up.assets[0].width, 2048);
  const itp = await app.run({ kind: 'interpolate', inputAssetId: vid.assets[0].id });
  assert.equal(itp.job.status, 'done', JSON.stringify(itp.job));
  const trimmed = await app.run({ kind: 'trim', inputAssetId: vid.assets[0].id, params: { start: 0, end: 1 } });
  assert.equal(trimmed.job.status, 'done', JSON.stringify(trimmed.job));
  assert.ok(trimmed.assets[0].duration <= 1.2);
  const joined = await app.run({ kind: 'concat', params: { assetIds: [vid.assets[0].id, trimmed.assets[0].id] } });
  assert.equal(joined.job.status, 'done', JSON.stringify(joined.job));

  // Garde-fous
  const blocked = await app.api('POST', '/api/jobs', { kind: 't2i', prompt: 'nude child' });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.code, 'blocked');

  // Galerie, favoris, suppression
  const list = await app.api('GET', '/api/assets?kind=image');
  assert.ok(list.body.items.length >= 3);
  const fav = await app.api('PATCH', `/api/assets/${img.assets[0].id}`, { favorite: true });
  assert.equal(fav.body.asset.favorite, true);
  assert.equal((await app.api('DELETE', `/api/assets/${up.assets[0].id}`)).status, 200);
});

test('téléversement : consentement, signature de fichier, lip-sync mock', async (t) => {
  const app = await boot();
  t.after(app.close);
  const gen = await app.run({ kind: 't2i', prompt: 'portrait', params: { seed: 3, sizeId: 'square' } });
  const bytes = await (await fetch(app.base + gen.assets[0].url)).arrayBuffer();

  const noConsent = new FormData(); noConsent.append('file', new Blob([bytes]), 'a.png');
  assert.equal((await app.api('POST', '/api/assets/upload', undefined, noConsent)).body.code, 'consent_required');

  const fake = new FormData(); fake.append('file', new Blob([Buffer.from('MZ not an image at all')]), 'x.png'); fake.append('consent', 'true');
  assert.equal((await app.api('POST', '/api/assets/upload', undefined, fake)).status, 422);

  const ok = new FormData(); ok.append('file', new Blob([bytes]), 'a.png'); ok.append('consent', 'true');
  const up = await app.api('POST', '/api/assets/upload', undefined, ok);
  assert.equal(up.status, 201);
  assert.equal(up.body.asset.origin, 'upload');

  const body = { kind: 'i2v', prompt: 'x', inputAssetId: up.body.asset.id, params: { draft: true, duration: 2, fps: 12 } };
  assert.equal((await app.api('POST', '/api/jobs', body)).body.code, 'consent_required');
  const vid = await app.run({ ...body, consent: true });
  assert.equal(vid.job.status, 'done', JSON.stringify(vid.job));

  const wav = Buffer.alloc(44 + 16000 * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(16000 * 2, 40);
  const af = new FormData(); af.append('file', new Blob([wav]), 'v.wav');
  const audio = await app.api('POST', '/api/assets/upload', undefined, af);
  assert.equal(audio.body.asset.kind, 'audio');
  const ls = await app.run({ kind: 'lipsync', inputAssetId: vid.assets[0].id, audioAssetId: audio.body.asset.id, consent: true });
  assert.equal(ls.job.status, 'done', JSON.stringify(ls.job));
  assert.match(ls.job.message, /MOCK/);
});

test('annulation d’un job en file', async (t) => {
  const app = await boot({ MOCK_DELAY_MS: '400', WORKER_CONCURRENCY: '1' });
  t.after(app.close);
  const a = await app.api('POST', '/api/jobs', { kind: 't2i', prompt: 'premier' });
  const b = await app.api('POST', '/api/jobs', { kind: 't2i', prompt: 'second' });
  await app.api('POST', '/api/jobs/' + b.body.job.id + '/cancel');
  const done = await app.waitJob(b.body.job.id);
  assert.equal(done.job.status, 'canceled');
  assert.equal((await app.waitJob(a.body.job.id)).job.status, 'done');
});
