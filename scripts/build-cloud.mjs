// Prépare la fonction serverless Vercel : retire les types TypeScript (Node ≥ 22.13) et réécrit les imports « .ts » en « .js ».
// Entrée : apps/api/src + apps/cloud/src   →   Sortie : cloud-dist/apps/{api,cloud}/src (même arborescence).
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'cloud-dist');
// Déploiement « préconstruit » (sans sources) : cloud-dist est déjà fourni, rien à faire.
if (!fs.existsSync(path.join(root, 'apps', 'cloud', 'src')) && fs.existsSync(out)) { console.log('cloud-dist préconstruit : étape ignorée'); process.exit(0); }
const SKIP = new Set(["server.ts", "db.ts", "migrations.ts", "storage.ts", "worker.ts", "app.ts", "assets.ts", "auth.ts", "credits.ts", "jobs.ts", "routes.ts"]);
fs.rmSync(out, { recursive: true, force: true });

const rewrite = (code) => code.replace(/(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\.ts\2/g, '$1$2$3.js$2');
let n = 0;
for (const pkg of ['api', 'cloud']) {
  const src = path.join(root, 'apps', pkg, 'src');
  for (const f of fs.readdirSync(src, { recursive: true })) {
    const rel = String(f);
    if (!rel.endsWith('.ts')) continue;
    if (pkg === 'api' && SKIP.has(path.basename(rel)) && !rel.includes('/')) continue;
    const dest = path.join(out, 'apps', pkg, 'src', rel.replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, rewrite(stripTypeScriptTypes(fs.readFileSync(path.join(src, rel), 'utf8'), { mode: 'transform' })));
    n++;
  }
}
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}\n');
console.log(`cloud-dist : ${n} fichiers`);
