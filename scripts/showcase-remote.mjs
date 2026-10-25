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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Réessaie les coupures réseau et les erreurs passagères (429, 5xx) au lieu d'abandonner le clip.
const call = async (body, tries = 6) => {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(SITE, { method: 'POST', headers: { 'content-type': 'application/json', 'x-showcase-token': token }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      if (r.status < 500 && r.status !== 429) throw Object.assign(new Error(`${body.action} : HTTP ${r.status} ${j.error ?? ''}`), { fatal: true });
      throw new Error(`${body.action} : HTTP ${r.status} ${j.error ?? ''}`);
    } catch (e) {
      if (e.fatal || i >= tries) throw e;
      await sleep(5000 * i);
    }
  }
};
// Les rendus lancés sont notés ici : relancer le script reprend leur suivi sans repayer.
const JOBS = path.join(import.meta.dirname, '..', 'showcase-jobs.json');
const jobs = fs.existsSync(JOBS) ? JSON.parse(fs.readFileSync(JOBS, 'utf8')) : {};
const saveJobs = () => fs.writeFileSync(JOBS, JSON.stringify(jobs, null, 2));
console.log(`Vitrine v${VERSION} : ${clips.length} clips, ≈ ${(clips.filter((c) => !jobs[c.id]).length * COST_PER_CLIP).toFixed(2)} USD à dépenser sur fal`);
const ok = [];
const queue = [...clips];
async function worker() {
  for (let clip; (clip = queue.shift());) {
    try {
      if (!jobs[clip.id]) { jobs[clip.id] = await call({ action: 'submit', clip: clip.id }); saveJobs(); console.log(`${clip.id} lancé`); }
      let r;
      do { await sleep(8000); r = await call({ action: 'poll', job: jobs[clip.id] }); } while (!r.done);
      let out;
      for (let i = 1; ; i++) { try { out = await compressClip(r.videoUrl); break; } catch (e) { if (i >= 4) throw e; await sleep(5000 * i); } }
      await upload(UPLOAD_URL, token, `${clip.id}.mp4`, out.mp4);
      await upload(UPLOAD_URL, token, `${clip.id}.jpg`, out.poster);
      ok.push({ id: clip.id, title: clip.title, cam: clip.cam, prompt: clip.motion, imagePrompt: clip.image, bytes: out.mp4.length, aspect: clip.size === 'portrait_16_9' ? '9:16' : '16:9' });
      console.log(`${clip.id} ${clip.title} en ligne : ${(out.mp4.length / 1048576).toFixed(2)} Mo`);
    } catch (e) {
      console.log(`${clip.id} ÉCHEC : ${e.message}${jobs[clip.id] ? ' (rendu noté : relancer reprendra son suivi)' : ''}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
// Le manifeste garde les clips déjà publiés lors d'un passage précédent.
const prev = await fetch('https://zodiak-ai-mrow.vercel.app/showcase/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { clips: [] })).catch(() => ({ clips: [] }));
const all = [...(prev.clips ?? []).filter((c) => !ok.some((o) => o.id === c.id) && CLIPS.some((x) => x.id === c.id)), ...ok].sort((a, b) => a.id.localeCompare(b.id));
await upload(UPLOAD_URL, token, 'manifest.json', Buffer.from(JSON.stringify({ version: VERSION, models: MODELS, generatedAt: new Date().toISOString(), clips: all }, null, 2)));
console.log(`Terminé : ${ok.length}/${clips.length} nouveaux, ${all.length} clips en ligne.`);
