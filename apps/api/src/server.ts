import { config } from './config.ts';
import { openDb } from './db.ts';
import { Storage } from './storage.ts';
import { createBackend } from './backends/index.ts';
import { createServer } from './app.ts';
import { startWorker } from './worker.ts';
import { ensureAdmin, ensureLocalUser } from './auth.ts';
import type { Ctx } from './ctx.ts';

const db = openDb(config.dbPath);
const ctx: Ctx = { db, storage: new Storage(config.mediaDir), backend: createBackend() };
if (config.mode === 'personal') ensureLocalUser(db); else ensureAdmin(db);

const onlyWorker = process.argv.includes('--worker-only');
const server = onlyWorker ? null : createServer(ctx);
const worker = onlyWorker || config.workerMode === 'embedded' ? startWorker(ctx) : null;

server?.listen(config.port, config.host, () => {
  console.log(`ZODIAK AI prêt sur http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}  (mode=${config.mode}, backend=${ctx.backend.id}, worker=${worker ? 'intégré' : 'externe'})`);
});
if (onlyWorker) console.log(`Worker ZODIAK AI seul (backend=${ctx.backend.id})`);

const stop = async () => { server?.close(); await worker?.stop(); db.close(); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
