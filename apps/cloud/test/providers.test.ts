import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { directBody, submitDirect, parseDirectStatus, providerFor, engineUsable } from '../src/providers.ts';
import { catalog, nextFallback, engineFor } from '../../api/src/catalog.ts';

// Fournisseurs directs (Kling, BytePlus, Google) : corps de requête et lecture des états, sans aucun appel réel.
const job = (kind: string, engine: string, extra: Record<string, unknown> = {}) =>
  ({ id: 'j1', kind, params: JSON.stringify({ engine, width: 1280, height: 720, duration: 5, seed: 7, ...extra }) });
const req = { prompt: 'pipes glow', negative: '' };

test('fal masqué par défaut ; un modèle direct sans clé est masqué ; avec clé, routé chez son fournisseur', () => {
  delete process.env.KIE_API_KEY; delete process.env.FAL_ENABLED;
  const kling = catalog.engines.find((e) => e.id === 'kling-3')!;
  const fal = catalog.engines.find((e) => e.id === 'kling-25')!;
  assert.equal(engineUsable(kling), false);
  assert.equal(engineUsable(fal), false);
  process.env.FAL_ENABLED = 'true';
  assert.equal(engineUsable(fal), true);
  delete process.env.FAL_ENABLED;
  process.env.KIE_API_KEY = 'k';
  assert.equal(engineUsable(kling), true);
  assert.equal(providerFor(job('i2v', 'kling-3'), 'fal'), 'kie');
});

test('Kie.ai / Kling 3.0 : début et fin dans image_urls, 720p (std) sans son, un seul plan', () => {
  const { url, body } = directBody('kie', job('i2v', 'kling-3'), req, { startUrl: 'https://s/a.png', endUrl: 'https://s/b.png' });
  assert.equal(url, 'https://api.kie.ai/api/v1/jobs/createTask');
  assert.deepEqual(body, { model: 'kling-3.0/video', input: { prompt: 'pipes glow', sound: false, duration: '5', mode: 'std', multi_shots: false, image_urls: ['https://s/a.png', 'https://s/b.png'] } });
  const t2v = directBody('kie', job('t2v', 'kling-3', { width: 720, height: 1280 }), req, {});
  assert.equal((t2v.body.input as any).aspect_ratio, '9:16');
});

test('Kie.ai / Seedance 2.0 : first_frame_url / last_frame_url, 720p, son, durée ≥ 4 s', () => {
  const { body } = directBody('kie', job('i2v', 'seedance-2', { duration: 3 }), req, { startUrl: 'https://s/a.png', endUrl: 'https://s/b.png' });
  assert.equal(body.model, 'bytedance/seedance-2');
  assert.deepEqual(body.input, { prompt: 'pipes glow', resolution: '720p', duration: 4, generate_audio: true, aspect_ratio: 'adaptive', first_frame_url: 'https://s/a.png', last_frame_url: 'https://s/b.png' });
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
  process.env.KIE_API_KEY = 'kie-test';
  const real = globalThis.fetch;
  let seen: any;
  globalThis.fetch = (async (u: string, init: any) => { seen = { u, init }; return new Response(JSON.stringify({ code: 200, data: { taskId: 'task_1' } }), { status: 200 }); }) as any;
  try {
    const sub = await submitDirect('kie', job('i2v', 'seedance-2'), req, { startUrl: 'https://s/a.png' });
    assert.equal(seen.init.headers.authorization, 'Bearer kie-test');
    assert.deepEqual(sub, { ref: 'task_1', urls: { status: 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_1' } });
    globalThis.fetch = (async () => new Response(JSON.stringify({ code: 402, msg: 'Insufficient credits' }), { status: 200 })) as any;
    await assert.rejects(submitDirect('kie', job('i2v', 'kling-3'), req, { startUrl: 'https://s/a.png' }), /kie : Insufficient credits/);
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
  assert.deepEqual(parseDirectStatus('kie', { code: 200, data: { state: 'generating' } }), { state: 'pending' });
  assert.deepEqual(parseDirectStatus('kie', { code: 200, data: { state: 'success', resultJson: '{"resultUrls":["https://k/v.mp4"]}' } }), { state: 'done', url: 'https://k/v.mp4' });
  assert.deepEqual(parseDirectStatus('kie', { code: 200, data: { state: 'fail', failMsg: 'nsfw' } }), { state: 'failed', error: 'Kie.ai : nsfw' });
  assert.deepEqual(parseDirectStatus('google', { status: 'in_progress' }), { state: 'pending' });
  const done = parseDirectStatus('google', { status: 'completed', steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: 'AAAA' }] }] });
  assert.deepEqual(done, { state: 'done', url: 'data:video/mp4;base64,AAAA' });
  assert.deepEqual(parseDirectStatus('google', { status: 'failed', errors: [{ code: 'RESOURCE_EXHAUSTED', message: 'quota' }] }), { state: 'failed', error: 'Gemini : RESOURCE_EXHAUSTED quota' });
});

test('choix auto : brouillon → moteur gratuit du site ; premium → le moins cher ; image de fin → fournisseur direct', async () => {
  const { autoEngine } = await import('../../api/src/catalog.ts');
  Object.assign(process.env, { MODAL_TOKEN: 't', MODAL_SUBMIT_URL: 'u', MODAL_STATUS_URL: 'u', GEMINI_API_KEY: 'g' });
  delete process.env.KIE_API_KEY; delete process.env.FAL_ENABLED;
  assert.equal(autoEngine('i2v', { draft: true })?.id, 'zodiak-ltx');
  assert.equal(autoEngine('i2v', {})?.id, 'zodiak-ltx');
  assert.equal(autoEngine('i2v', { premium: true, endImage: true })?.id, 'omni-flash');
  assert.equal(autoEngine('t2i', {})?.id, 'nano-banana-2'); // fal masqué : plus de FLUX à 1 crédit
  process.env.KIE_API_KEY = 'k';
  assert.equal(autoEngine('i2v', { premium: true, endImage: true })?.id, 'kling-3');
  process.env.FAL_ENABLED = 'true';
  assert.equal(autoEngine('t2i', {})?.id, 'flux-schnell');
  delete process.env.FAL_ENABLED;
});

test('repli : premier modèle utilisable, jamais déjà essayé, prix plafonné ; image de fin = fournisseur direct', () => {
  process.env.KIE_API_KEY = 'k'; process.env.GEMINI_API_KEY = 'g'; delete process.env.FAL_ENABLED;
  const kling = engineFor('i2v', 'kling-3')!;
  // kling-25 est sur fal (masqué) : on saute à Omni Flash (56 ≤ max(39×1,6 ; 39+10) = 62,4)
  assert.equal(nextFallback('i2v', kling, ['kling-3'])?.id, 'omni-flash');
  assert.equal(nextFallback('i2v', kling, ['kling-3', 'omni-flash']), null);
  process.env.FAL_ENABLED = 'true';
  assert.equal(nextFallback('i2v', kling, ['kling-3'])?.id, 'kling-25');
  assert.equal(nextFallback('i2v', kling, ['kling-3'], { endImage: true })?.id, 'omni-flash'); // fal : pas d'image de fin
  // Seedance (69) → Kling (39) et Omni (56) sont moins chers : acceptés
  assert.equal(nextFallback('i2v', engineFor('i2v', 'seedance-2')!, ['seedance-2'])?.id, 'kling-3');
  // plafond : Kling (39) ne peut pas replier sur un modèle à 69 crédits
  const cheap = { ...kling, fallback: ['seedance-2'] };
  assert.equal(nextFallback('i2v', cheap, ['kling-3']), null);
  delete process.env.FAL_ENABLED; delete process.env.KIE_API_KEY; delete process.env.GEMINI_API_KEY;
});
