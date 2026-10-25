// Génération de la vitrine côté serveur. Actions : submit, poll, finish, manifest.
// Protégée par le jeton local `.showcase-token` : seul son hash est ici (le même que dans l'edge function showcase-upload).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { COST_PER_CLIP, CLIPS, MODELS, VERSION } from '../scripts/showcase-clips.mjs';

try {
  const { default: bin } = await import('ffmpeg-static');
  if (bin) {
    const dest = '/tmp/zodiak-ffmpeg';
    if (!fs.existsSync(dest)) { fs.copyFileSync(bin, dest); fs.chmodSync(dest, 0o755); }
    process.env.FFMPEG_PATH = dest;
  }
} catch (e) {
  console.error('ffmpeg-static indisponible :', e?.message);
}
const lib = await import('../scripts/showcase-lib.mjs');

const TOKEN_SHA256 = '990475f84a664f88798c4776b48c60d59b2fb07c672b722ec3549b3a9a20db41';
const send = (res, code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };

export default async function handler(req, res) {
  try {
    const token = String(req.headers['x-showcase-token'] ?? '');
    if (crypto.createHash('sha256').update(token).digest('hex') !== TOKEN_SHA256) return send(res, 403, { error: 'forbidden' });
    const key = process.env.FAL_KEY;
    if (!key && ['submit', 'poll'].includes(req.body?.action)) return send(res, 400, { error: 'FAL_KEY manquante' });
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    const clip = lib.clipById(body?.clip);
    const up = process.env.SHOWCASE_UPLOAD_URL || 'https://wlrjpgtjizegehhwelgh.supabase.co/functions/v1/showcase-upload';
    switch (body?.action) {
      case 'submit':
        if (!clip) return send(res, 400, { error: 'clip inconnu' });
        return send(res, 200, await lib.submitClip(key, clip));
      case 'poll':
        return send(res, 200, await lib.pollClip(key, body.job));
      case 'finish': {
        if (!clip) return send(res, 400, { error: 'clip inconnu' });
        const { mp4, poster, rawBytes } = await lib.compressClip(body.videoUrl);
        await lib.upload(up, token, `${clip.id}.mp4`, mp4);
        await lib.upload(up, token, `${clip.id}.jpg`, poster);
        return send(res, 200, { id: clip.id, bytes: mp4.length, posterBytes: poster.length, rawBytes });
      }
      case 'balance': { // contrôle de l'accès au solde fal (API Platform)
        const r = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', { headers: { authorization: `Key ${key}` } });
        return send(res, 200, { status: r.status, body: (await r.text()).slice(0, 300) });
      }
      case 'manifest': {
        const ids = body.ids ?? [];
        const m = { version: VERSION, models: MODELS, generatedAt: new Date().toISOString(), costUsd: +(ids.length * COST_PER_CLIP).toFixed(2),
          clips: CLIPS.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, title: c.title, cam: c.cam, prompt: c.motion, imagePrompt: c.image, aspect: c.size === 'portrait_16_9' ? '9:16' : '16:9' })) };
        await lib.upload(up, token, 'manifest.json', Buffer.from(JSON.stringify(m)));
        return send(res, 200, { ok: true, clips: m.clips.length });
      }
      default:
        return send(res, 400, { error: 'action inconnue' });
    }
  } catch (e) {
    return send(res, 500, { error: String(e?.message ?? e).slice(0, 400) });
  }
}
