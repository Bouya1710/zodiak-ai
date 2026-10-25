// Génère la vitrine avec la clé fal posée dans Vercel (FAL_KEY) : rien à coller en local.
// node scripts/showcase-remote.mjs [--only=c01,c02]
// Vercel lance et suit les rendus (/api/showcase-gen) ; ce Mac compresse puis publie (jeton `.showcase-token`).
import fs from 'node:fs';
import path from 'node:path';
import { CLIPS, COST_PER_CLIP, MODELS, VERSION } from './showcase-clips.mjs';
import { compressClip, upload } from './showcase-lib.mjs';

const SITE = 'https://zodiak-ai-mrow.vercel.app/api/showcase-gen';
const UPLOAD_URL = 'https://wlrjpgtjizegehhwelgh.supabase.co/functions/v1/showcase-upload';
const token = fs.readFileSync(path.join(import.meta.dirname, '..', '.showcase-token'), 'utf8').trim();
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const clips = CLIPS.filter((c) => !only || only.includes(c.id));
const call = async (body) => {
  const r = await fetch(SITE, { method: 'POST', headers: { 'content-type': 'application/json', 'x-showcase-token': token }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${body.action} ${body.clip ?? ''} : HTTP ${r.status} ${j.error ?? ''}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`Vitrine v${VERSION} : ${clips.length} clips, ≈ ${(clips.length * COST_PER_CLIP).toFixed(2)} USD sur fal`);
const ok = [];
await Promise.all(clips.map(async (clip, i) => {
  await sleep(i * 1500);
  try {
    const job = await call({ action: 'submit', clip: clip.id });
    let r;
    do { await sleep(8000); r = await call({ action: 'poll', job }); } while (!r.done);
    const { mp4, poster } = await compressClip(r.videoUrl);
    await upload(UPLOAD_URL, token, `${clip.id}.mp4`, mp4);
    await upload(UPLOAD_URL, token, `${clip.id}.jpg`, poster);
    ok.push({ id: clip.id, title: clip.title, cam: clip.cam, prompt: clip.motion, imagePrompt: clip.image, bytes: mp4.length, aspect: clip.size === 'portrait_16_9' ? '9:16' : '16:9' });
    console.log(`${clip.id} ${clip.title} en ligne : ${(mp4.length / 1048576).toFixed(2)} Mo`);
  } catch (e) {
    console.log(`${clip.id} ÉCHEC : ${e.message}`);
  }
}));
// Le manifeste garde les clips déjà publiés lors d'un passage précédent.
const prev = await fetch('https://zodiak-ai-mrow.vercel.app/showcase/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { clips: [] })).catch(() => ({ clips: [] }));
const all = [...(prev.clips ?? []).filter((c) => !ok.some((o) => o.id === c.id) && CLIPS.some((x) => x.id === c.id)), ...ok].sort((a, b) => a.id.localeCompare(b.id));
await upload(UPLOAD_URL, token, 'manifest.json', Buffer.from(JSON.stringify({ version: VERSION, models: MODELS, generatedAt: new Date().toISOString(), clips: all }, null, 2)));
console.log(`Terminé : ${ok.length}/${clips.length} nouveaux, ${all.length} clips en ligne.`);
