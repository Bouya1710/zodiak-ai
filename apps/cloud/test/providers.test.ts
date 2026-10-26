import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { directBody, submitDirect, parseDirectStatus, providerFor, engineUsable } from '../src/providers.ts';
import { catalog } from '../../api/src/catalog.ts';

// Fournisseurs directs (Kling, BytePlus, Google) : corps de requête et lecture des états, sans aucun appel réel.
const job = (kind: string, engine: string, extra: Record<string, unknown> = {}) =>
  ({ id: 'j1', kind, params: JSON.stringify({ engine, width: 1280, height: 720, duration: 5, seed: 7, ...extra }) });
const req = { prompt: 'pipes glow', negative: '' };

test('repli : sans clé, un modèle direct sans adresse fal est masqué ; avec clé, il est routé chez son éditeur', () => {
  delete process.env.KLING_API_KEY;
  const kling = catalog.engines.find((e) => e.id === 'kling-3')!;
  assert.equal(engineUsable(kling), false);
  process.env.KLING_API_KEY = 'k';
  assert.equal(engineUsable(kling), true);
  assert.equal(providerFor(job('i2v', 'kling-3'), 'fal'), 'kling');
  assert.equal(providerFor(job('i2v', 'kling-25'), 'fal'), 'fal');
});

test('Kling 3.0 : image de début et de fin, 720p sans son, un seul plan', () => {
  const { url, body } = directBody('kling', job('i2v', 'kling-3'), req, { startUrl: 'https://s/a.png', endUrl: 'https://s/b.png' });
  assert.equal(url, 'https://api-singapore.klingai.com/image-to-video/kling-3.0');
  assert.deepEqual(body.contents, [{ type: 'prompt', text: 'pipes glow' }, { type: 'first_frame', url: 'https://s/a.png' }, { type: 'last_frame', url: 'https://s/b.png' }]);
  assert.deepEqual(body.settings, { resolution: '720p', duration: 5, audio: 'off', multi_shot: false });
  const t2v = directBody('kling', job('t2v', 'kling-3', { width: 720, height: 1280 }), req, {});
  assert.equal(t2v.url, 'https://api-singapore.klingai.com/text-to-video/kling-3.0');
  assert.equal((t2v.body.settings as any).aspect_ratio, '9:16');
});

test('Seedance 2.0 : rôles first_frame / last_frame, 720p, son, durée ≥ 4 s', () => {
  const { url, body } = directBody('byteplus', job('i2v', 'seedance-2', { duration: 3 }), req, { startUrl: 'https://s/a.png', endUrl: 'https://s/b.png' });
  assert.equal(url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks');
  assert.equal(body.model, 'dreamina-seedance-2-0-260128');
  assert.deepEqual((body.content as any[]).map((c) => c.role ?? c.type), ['text', 'first_frame', 'last_frame']);
  assert.equal(body.duration, 4);
  assert.equal(body.ratio, 'adaptive');
  assert.equal(body.generate_audio, true);
});

test('Google : Nano Banana en image 1K, Omni en vidéo avec les deux images en base64', () => {
  const img = directBody('google', job('t2i', 'nano-banana-2', { width: 1024, height: 1024 }), req, {});
  assert.equal(img.body.model, 'gemini-3.1-flash-image');
  assert.deepEqual(img.body.response_format, { type: 'image', mime_type: 'image/jpeg', image_size: '1K', aspect_ratio: '1:1' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-'));
  const a = path.join(dir, 'a.png'); fs.writeFileSync(a, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const vid = directBody('google', job('i2v', 'omni-flash'), req, { startFile: a, endFile: a });
  const input = vid.body.input as any[];
  assert.equal(vid.body.background, true);
  assert.deepEqual(input.map((x) => x.type), ['image', 'image', 'text']);
  assert.equal(input[0].mime_type, 'image/png');
  assert.equal(input[2].text, 'pipes glow Duration: 5 seconds.');
});

test('envoi : clé dans l’en-tête, identifiant de tâche, adresse de suivi ; erreurs remontées', async () => {
  process.env.ARK_API_KEY = 'ark-test';
  const real = globalThis.fetch;
  let seen: any;
  globalThis.fetch = (async (u: string, init: any) => { seen = { u, init }; return new Response(JSON.stringify({ id: 'cgt-1' }), { status: 200 }); }) as any;
  try {
    const sub = await submitDirect('byteplus', job('i2v', 'seedance-2'), req, { startUrl: 'https://s/a.png' });
    assert.equal(seen.init.headers.authorization, 'Bearer ark-test');
    assert.deepEqual(sub, { ref: 'cgt-1', urls: { status: 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-1' } });
    globalThis.fetch = (async () => new Response(JSON.stringify({ code: 1201, message: 'quota' }), { status: 200 })) as any;
    await assert.rejects(submitDirect('kling', job('i2v', 'kling-3'), req, { startUrl: 'https://s/a.png' }), /kling : quota/);
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(submitDirect('google', job('t2i', 'nano-banana-2'), req, {}), /clé manquante \(GEMINI_API_KEY\)/);
  } finally { globalThis.fetch = real; }
});

test('suivi : en cours, terminé (lien vidéo) ou échec, pour chaque fournisseur', () => {
  assert.deepEqual(parseDirectStatus('kling', { data: [{ status: 'processing' }] }), { state: 'pending' });
  assert.deepEqual(parseDirectStatus('kling', { data: [{ status: 'succeeded', outputs: [{ type: 'video', url: 'https://k/v.mp4' }] }] }), { state: 'done', url: 'https://k/v.mp4' });
  assert.deepEqual(parseDirectStatus('kling', { data: [{ status: 'failed', message: 'risk' }] }), { state: 'failed', error: 'Kling : risk' });
  assert.deepEqual(parseDirectStatus('byteplus', { status: 'running' }), { state: 'pending' });
  assert.deepEqual(parseDirectStatus('byteplus', { status: 'succeeded', content: { video_url: 'https://b/v.mp4' } }), { state: 'done', url: 'https://b/v.mp4' });
  assert.equal(parseDirectStatus('byteplus', { status: 'expired' }).state, 'failed');
  assert.deepEqual(parseDirectStatus('google', { status: 'in_progress' }), { state: 'pending' });
  const done = parseDirectStatus('google', { status: 'completed', steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: 'AAAA' }] }] });
  assert.deepEqual(done, { state: 'done', url: 'data:video/mp4;base64,AAAA' });
  assert.deepEqual(parseDirectStatus('google', { status: 'failed', errors: [{ code: 'RESOURCE_EXHAUSTED', message: 'quota' }] }), { state: 'failed', error: 'Gemini : RESOURCE_EXHAUSTED quota' });
});
