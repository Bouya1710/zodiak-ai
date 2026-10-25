import fs from 'node:fs';
import path from 'node:path';
import { mockImage } from '../png.ts';
import { ffmpeg } from '../ffmpeg.ts';
import { config } from '../config.ts';
import type { Backend, GenRequest, GenResult } from './types.ts';
import { CanceledError } from './types.ts';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new CanceledError());
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new CanceledError()); }, { once: true });
  });

/** Expressions zoompan par mouvement. N = nombre total d'images, `on` = index courant. */
export function zoompanExpr(motion: string, frames: number): { z: string; x: string; y: string } {
  const t = `(on/${Math.max(1, frames - 1)})`;
  const cx = '(iw-iw/zoom)/2', cy = '(ih-ih/zoom)/2';
  switch (motion) {
    case 'zoom_in': return { z: `1+0.25*${t}`, x: cx, y: cy };
    case 'zoom_out': return { z: `1.25-0.25*${t}`, x: cx, y: cy };
    case 'pan_left': return { z: '1.2', x: `(iw-iw/zoom)*(1-${t})`, y: cy };
    case 'pan_right': return { z: '1.2', x: `(iw-iw/zoom)*${t}`, y: cy };
    case 'tilt_up': return { z: '1.2', x: cx, y: `(ih-ih/zoom)*(1-${t})` };
    case 'tilt_down': return { z: '1.2', x: cx, y: `(ih-ih/zoom)*${t}` };
    case 'orbit': return { z: '1.2', x: `${cx}*(1+sin(2*PI*${t}))`, y: `${cy}*(1+cos(2*PI*${t}))` };
    case 'rise': return { z: `1+0.15*${t}`, x: cx, y: `(ih-ih/zoom)*(1-${t})` };
    case 'fall': return { z: `1+0.15*${t}`, x: cx, y: `(ih-ih/zoom)*${t}` };
    default: return { z: '1.0', x: '0', y: '0' };
  }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** MOCK_MAX_SIDE : réduit les dimensions des sorties de démonstration (hébergement léger). */
function capDims(w: number, h: number): { w: number; h: number } {
  const max = Number(process.env.MOCK_MAX_SIDE ?? 0);
  if (!max || Math.max(w, h) <= max) return { w, h };
  const k = max / Math.max(w, h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/**
 * Backend de démonstration : aucune IA, aucun GPU. Les images sont procédurales
 * (étiquetées « ZODIAK MOCK ») et les vidéos sont un mouvement de caméra ffmpeg
 * (zoompan) appliqué à l'image d'entrée ou à une image procédurale.
 */
export const mockBackend: Backend = {
  id: 'mock',
  supports: (k) => k === 't2i' || k === 'i2v' || k === 't2v' || k === 'upscale',
  async generate(req: GenRequest): Promise<GenResult> {
    const stages = req.kind === 't2i' ? 3 : 5;
    const step = async (i: number, msg: string) => {
      req.progress(Math.round((i / stages) * 90), msg);
      await sleep(config.mockDelayMs, req.signal);
    };
    fs.mkdirSync(req.workDir, { recursive: true });
    if (req.kind === 't2i') {
      await step(1, 'Chargement du modèle (mock)');
      await step(2, 'Échantillonnage (mock)');
      const d = capDims(req.width, req.height);
      const png = mockImage(d.w, d.h, req.prompt, req.seed);
      const file = path.join(req.workDir, 'out.png');
      fs.writeFileSync(file, png);
      return { file, mime: 'image/png', kind: 'image', note: 'image de démonstration (backend mock)' };
    }
    if (req.kind === 'upscale') throw new Error('upscale pris en charge par les outils ffmpeg');
    await step(1, 'Préparation (mock)');
    let src = req.inputPath;
    if (!src) {
      src = path.join(req.workDir, 'base.png');
      const d = capDims(req.width, req.height);
      fs.writeFileSync(src, mockImage(d.w, d.h, req.prompt, req.seed));
    }
    await step(2, 'Diffusion vidéo (mock)');
    await step(3, 'Décodage (mock)');
    const frames = Math.max(2, Math.round(req.duration * req.fps));
    const cd = capDims(req.width, req.height);
    const w = even(cd.w), h = even(cd.h);
    const { z, x, y } = zoompanExpr(req.motion, frames);
    const file = path.join(req.workDir, 'out.mp4');
    await step(4, 'Encodage');
    await ffmpeg([
      '-i', src,
      '-vf', `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${req.fps},format=yuv420p`,
      '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', file,
    ], { signal: req.signal });
    return { file, mime: 'video/mp4', kind: 'video', note: `vidéo de démonstration (mouvement ${req.motion}, backend mock, aucune IA)` };
  },
  async health() { return true; },
};
