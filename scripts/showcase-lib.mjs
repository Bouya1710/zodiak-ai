// Noyau de génération de la vitrine : fal (FLUX + Wan 2.2) -> ffmpeg (H.264 720p, poster) -> stockage public.
// Utilisé par scripts/generate-showcase.mjs (ligne de commande) et par api/showcase-gen.js (fonction Vercel).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLIPS, MODELS } from './showcase-clips.mjs';

export const falHeaders = (key) => ({ authorization: `Key ${key}`, 'content-type': 'application/json' });

async function json(res, what) {
  const t = await res.text();
  if (!res.ok) throw new Error(`${what} : HTTP ${res.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

/** Étape 1 : image de départ FLUX (synchrone) puis soumission de la vidéo Wan 2.2 dans la file fal. */
export async function submitClip(key, clip, seed = 1000 + Number(clip.id.slice(1))) {
  const img = await json(await fetch(`https://fal.run/${MODELS.image.id}`, {
    method: 'POST', headers: falHeaders(key),
    body: JSON.stringify({ prompt: clip.image, image_size: clip.size, num_inference_steps: 4, seed, enable_safety_checker: true, output_format: 'jpeg' }),
  }), 'FLUX');
  const imageUrl = img.images?.[0]?.url;
  if (!imageUrl) throw new Error('FLUX : pas d image');
  const sub = await json(await fetch(`https://queue.fal.run/${MODELS.video.id}`, {
    method: 'POST', headers: falHeaders(key),
    body: JSON.stringify({
      prompt: clip.motion, image_url: imageUrl, resolution: MODELS.video.resolution, num_frames: MODELS.video.frames,
      frames_per_second: MODELS.video.fps, aspect_ratio: clip.size === 'portrait_16_9' ? '9:16' : '16:9', seed,
      enable_safety_checker: true,
    }),
  }), 'Wan');
  return { id: clip.id, imageUrl, status_url: sub.status_url, response_url: sub.response_url };
}

/** Étape 2 : état du job ; quand il est terminé, renvoie l URL de la vidéo brute. */
export async function pollClip(key, job) {
  const st = await json(await fetch(job.status_url, { headers: falHeaders(key) }), 'statut fal');
  if (st.status !== 'COMPLETED') return { done: false, status: st.status, position: st.queue_position };
  const out = await json(await fetch(job.response_url, { headers: falHeaders(key) }), 'résultat fal');
  const url = out.video?.url;
  if (!url) throw new Error('Wan : pas de vidéo dans la réponse');
  return { done: true, videoUrl: url };
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-800); });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c} : ${err}`))));
  });
}

/** Étape 3 : télécharge, compresse en H.264 720p sans audio (cible 1 à 3 Mo) et extrait un poster JPEG. */
export async function compressClip(videoUrl, ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-'));
  const src = path.join(dir, 'src.mp4');
  const mp4 = path.join(dir, 'clip.mp4');
  const poster = path.join(dir, 'poster.jpg');
  const r = await fetch(videoUrl);
  if (!r.ok) throw new Error(`téléchargement vidéo : HTTP ${r.status}`);
  fs.writeFileSync(src, Buffer.from(await r.arrayBuffer()));
  await run(ffmpeg, ['-y', '-i', src, '-vf', 'scale=-2:720:force_original_aspect_ratio=decrease', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-maxrate', '3500k', '-bufsize', '7000k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
  await run(ffmpeg, ['-y', '-ss', '1.5', '-i', mp4, '-frames:v', '1', '-q:v', '4', poster]);
  const out = { mp4: fs.readFileSync(mp4), poster: fs.readFileSync(poster), rawBytes: fs.statSync(src).size };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

/** Étape 4 : envoi vers la fonction Edge Supabase (qui détient la clé de service) dans le bucket public « showcase ». */
export async function upload(uploadUrl, token, name, buf) {
  const r = await fetch(`${uploadUrl}?name=${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'x-showcase-token': token }, body: buf });
  if (!r.ok) throw new Error(`upload ${name} : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

export const clipById = (id) => CLIPS.find((c) => c.id === id);
