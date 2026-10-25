import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = '/tmp/zodiak-unit';
const { checkPrompt, normalize } = await import('../src/guardrails.ts');
const { costFor, renderTemplate, resolveDims, catalog } = await import('../src/catalog.ts');
const { renderWorkflow, injectLora, loadWorkflow } = await import('../src/workflows.ts');
const { mockImage } = await import('../src/png.ts');
const { zoompanExpr } = await import('../src/backends/mock.ts');
const { hashPassword, verifyPassword } = await import('../src/auth.ts');
const { parseMultipart } = await import('../src/http.ts');
const { wanLength } = await import('../src/backends/comfyui.ts');

test('garde-fous : refuse, normalise le leetspeak, laisse passer le banal', () => {
  assert.equal(checkPrompt('un chat sur un canapé').ok, true);
  assert.equal(checkPrompt('nude child').ok, false);
  assert.equal(checkPrompt('n4k3d minor').ok, false);
  assert.ok(normalize('Éléphant').includes('elephant'));
});

test('coûts : brouillon réduit, minimum 1', () => {
  assert.equal(costFor('t2i', {}), 1);
  assert.equal(costFor('i2v', {}), 10);
  assert.equal(costFor('i2v', { draft: true }), 4);
});

test('dimensions : tailles prédéfinies et brouillon', () => {
  assert.deepEqual(resolveDims('t2i', { sizeId: 'portrait' }), { width: 768, height: 1344 });
  assert.deepEqual(resolveDims('i2v', { sizeId: 'landscape', draft: true }), { width: 832, height: 480 });
  const w = resolveDims('t2i', { width: 1000, height: 1001 });
  assert.equal(w.width % 16, 0);
  assert.equal(w.height % 16, 0);
});

test('modèles de prompt et presets', () => {
  const t = catalog.templates[0]!;
  assert.match(renderTemplate(t, { [t.variables[0]!.name]: 'un renard' }), /un renard/);
  assert.ok(catalog.presets.length >= 20);
});

test('workflows : variables typées, LoRA injectée, tous chargeables', () => {
  const wf = loadWorkflow('t2i_flux_schnell_fp8');
  const g = renderWorkflow(wf.nodes, { prompt: 'x', width: 512, height: 512, seed: 9, steps: 4, flux_ckpt: 'm.safetensors' });
  assert.equal(g['7']!.inputs.seed, 9);
  assert.equal(typeof g['6']!.inputs.width, 'number');
  assert.throws(() => renderWorkflow(wf.nodes, { prompt: 'x' }));
  const l = injectLora(g, 'perso.safetensors');
  assert.equal(l['7']!.inputs.model[0], '10');
  assert.equal(l['10']!.class_type, 'LoraLoaderModelOnly');
  for (const id of ['t2i_flux_schnell_gguf', 'i2v_wan22_ti2v5b', 't2v_wan22_ti2v5b', 'upscale_esrgan_image']) assert.equal(loadWorkflow(id).meta.id, id);
  assert.equal(wanLength(5, 24) % 4, 1);
});

test('image mock déterministe, expressions de mouvement', () => {
  assert.ok(mockImage(64, 64, 'a', 1).equals(mockImage(64, 64, 'a', 1)));
  assert.ok(!mockImage(64, 64, 'a', 1).equals(mockImage(64, 64, 'a', 2)));
  assert.match(zoompanExpr('zoom_in', 10).z, /1\+0\.25/);
});

test('mots de passe scrypt', () => {
  const h = hashPassword('secret-123');
  assert.equal(verifyPassword('secret-123', h), true);
  assert.equal(verifyPassword('autre', h), false);
  assert.equal(verifyPassword('x', null), false);
});

test('multipart', () => {
  const b = Buffer.from('--B\r\nContent-Disposition: form-data; name="consent"\r\n\r\ntrue\r\n--B\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nDATA\r\n--B--\r\n');
  const r = parseMultipart(b, 'B');
  assert.equal(r.fields.consent, 'true');
  assert.equal(r.file?.data.toString(), 'DATA');
});
