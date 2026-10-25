import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.join(import.meta.dirname, '..');
const packs = fs.readdirSync(root).filter((f) => /^pack-\d+\.txt$/.test(f)).sort();
if (!packs.length) process.exit(0);
const chunks = packs.map((f) => fs.readFileSync(path.join(root, f), 'utf8'));
packs.forEach((f, i) => console.log(`${f} ${chunks[i].length} ${crypto.createHash('sha1').update(chunks[i]).digest('hex').slice(0, 8)}`));
let n = 0;
for (const part of chunks.join('').split('§§')) {
const i = part.indexOf('¶');
if (i < 1) continue;
const dest = path.join(root, part.slice(0, i));
if (fs.existsSync(dest)) continue;
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, part.slice(i + 1).replaceAll('¶', '\n').replaceAll('¨', '"').replaceAll('¦', '\\'));
n++;
}
console.log(`unpack : ${n} fichiers`);
