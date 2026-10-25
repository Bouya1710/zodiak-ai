// Génère la vitrine : node scripts/generate-showcase.mjs [--run] [--only=c01,c02] [--force]
// Sans --run : affiche seulement l estimation de coût (aucun appel payant).
// Variables : FAL_KEY, SHOWCASE_UPLOAD_URL, SHOWCASE_TOKEN (ou --out=dossier pour écrire en local). ffmpeg doit être installé.
import fs from 'node:fs';
import path from 'node:path';
import { CLIPS, COST_PER_CLIP, MODELS, SECONDS, VERSION } from './showcase-clips.mjs';
import { compressClip, pollClip, submitClip, upload } from './showcase-lib.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const only = flag('only')?.split(',');
const outDir = flag('out');
const clips = CLIPS.filter((c) => !only || only.includes(c.id));
const total = +(clips.length * COST_PER_CLIP).toFixed(2);
console.log(`Vitrine v${VERSION} : ${clips.length} clips x ${SECONDS.toFixed(1)} s, ${MODELS.video.id} ${MODELS.video.resolution}`);
console.log(`Coût estimé : ${COST_PER_CLIP} USD par clip, ${total} USD au total (marge conseillée +25 % pour les relances : ${(total * 1.25).toFixed(2)} USD)`);
if (!args.includes('--run')) process.exit(0);

const key = process.env.FAL_KEY;
if (!key) throw new Error('FAL_KEY manquante');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { version: VERSION, models: MODELS, generatedAt: new Date().toISOString(), clips: [] };
const save = async (name, buf) => {
  if (outDir) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, name), buf); }
  else await upload(process.env.SHOWCASE_UPLOAD_URL, process.env.SHOWCASE_TOKEN, name, buf);
};
let spent = 0;
await Promise.all(clips.map(async (clip) => {
  const job = await submitClip(key, clip);
  let r;
  do { await sleep(5000); r = await pollClip(key, job); console.log(clip.id, r.status ?? 'terminé'); } while (!r.done);
  const { mp4, poster } = await compressClip(r.videoUrl);
  await save(`${clip.id}.mp4`, mp4);
  await save(`${clip.id}.jpg`, poster);
  spent += COST_PER_CLIP;
  manifest.clips.push({ id: clip.id, title: clip.title, cam: clip.cam, prompt: clip.motion, imagePrompt: clip.image, bytes: mp4.length, aspect: clip.size === 'portrait_16_9' ? '9:16' : '16:9' });
  console.log(`${clip.id} OK : ${(mp4.length / 1048576).toFixed(2)} Mo`);
}));
manifest.clips.sort((a, b) => a.id.localeCompare(b.id));
manifest.costUsd = +spent.toFixed(2);
await save('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
console.log(`Terminé. Coût estimé réel : ${manifest.costUsd} USD`);
