import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

export async function boot(env: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zodiak-test-'));
  Object.assign(process.env, { DATA_DIR: dir, MOCK_DELAY_MS: '10', GENERATION_BACKEND: 'mock', ...env });
  const { config } = await import('../src/config.ts');
  const { openDb } = await import('../src/db.ts');
  const { Storage } = await import('../src/storage.ts');
  const { createBackend } = await import('../src/backends/index.ts');
  const { createServer } = await import('../src/app.ts');
  const { startWorker } = await import('../src/worker.ts');
  const { ensureAdmin, ensureLocalUser } = await import('../src/auth.ts');
  const db = openDb(config.dbPath);
  const ctx = { db, storage: new Storage(config.mediaDir), backend: createBackend() };
  if (config.mode === 'personal') ensureLocalUser(db); else ensureAdmin(db);
  const server = createServer(ctx);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const worker = startWorker(ctx, { intervalMs: 50 });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = '';
  const api = async (method: string, url: string, body?: unknown, form?: FormData) => {
    const res = await fetch(base + url, {
      method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0]!;
    const ct = res.headers.get('content-type') ?? '';
    return { status: res.status, body: (ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer())) as any, headers: res.headers };
  };
  const waitJob = async (id: string, ms = 30000) => {
    const t = Date.now();
    for (;;) {
      const r = await api('GET', `/api/jobs/${id}`);
      if (!['queued', 'running'].includes(r.body.job.status)) return r.body as { job: any; assets: any[] };
      if (Date.now() - t > ms) throw new Error('timeout job ' + id);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const run = async (body: Record<string, unknown>) => {
    const r = await api('POST', '/api/jobs', body);
    if (r.status !== 202) throw new Error(`création refusée ${r.status} ${JSON.stringify(r.body)}`);
    return waitJob(r.body.job.id);
  };
  const close = async () => { await worker.stop(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { api, run, waitJob, close, ctx, base };
}
