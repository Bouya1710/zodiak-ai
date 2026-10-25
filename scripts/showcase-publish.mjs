// Publie les clips générés ailleurs (ex. notebook Kaggle) : node scripts/showcase-publish.mjs ~/Downloads/zodiak-vitrine.zip
// Compresse chaque cNN.mp4, l'envoie dans le bucket `showcase` avec son poster, puis écrit manifest.json.
// Jeton : fichier `.showcase-token` (local, ignoré par Git). Aucune clé payante nécessaire.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CLIPS, MODELS, VERSION } from './showcase-clips.mjs';
import { compressFile, upload } from './showcase-lib.mjs';

const UPLOAD_URL = 'https://wlrjpgtjizegehhwelgh.supabase.co/functions/v1/showcase-upload';
const input = process.argv[2];
if (!input) throw new Error('Usage : node scripts/showcase-publish.mjs <zip ou dossier>');
const token = fs.readFileSync(path.join(import.meta.dirname, '..', '.showcase-token'), 'utf8').trim();
let dir = input;
if (input.endsWith('.zip')) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitrine-'));
  execFileSync('unzip', ['-q', '-o', input, '-d', dir]);
}
const found = new Map(fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => /c\d\d\.mp4$/.test(f)).map((f) => [path.basename(f, '.mp4'), path.join(dir, f)]));
const done = [];
for (const clip of CLIPS) {
  const src = found.get(clip.id);
  if (!src) { console.log(`${clip.id} absent, ignoré`); continue; }
  const { mp4, poster } = await compressFile(src);
  await upload(UPLOAD_URL, token, `${clip.id}.mp4`, mp4);
  await upload(UPLOAD_URL, token, `${clip.id}.jpg`, poster);
  done.push({ id: clip.id, title: clip.title, cam: clip.cam, prompt: clip.motion, imagePrompt: clip.image, bytes: mp4.length, aspect: clip.size === 'portrait_16_9' ? '9:16' : '16:9' });
  console.log(`${clip.id} ${clip.title} en ligne : ${(mp4.length / 1048576).toFixed(2)} Mo`);
}
const manifest = { version: VERSION, models: { video: { id: 'Wan2.2-T2V-A14B (GGUF Q4_K_M) + Wan2.2-Lightning', license: 'Apache-2.0', where: 'Kaggle' }, previous: MODELS }, generatedAt: new Date().toISOString(), costUsd: 0, clips: done };
await upload(UPLOAD_URL, token, 'manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
console.log(`Terminé : ${done.length} clips publiés.`);
