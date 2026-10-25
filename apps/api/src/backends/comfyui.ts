import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.ts';
import { catalog } from '../catalog.ts';
import { loadWorkflow, renderWorkflow, injectLora } from '../workflows.ts';
import type { Backend, GenRequest, GenResult } from './types.ts';
import { CanceledError } from './types.ts';

// ⚠ Ce backend n'a pas pu être exécuté contre un vrai ComfyUI pendant le développement (pas de GPU).
// Il suit l'API HTTP documentée de ComfyUI : POST /upload/image, POST /prompt, GET /history/{id}, GET /view.

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif' };

export function workflowFor(kind: GenRequest['kind']): string {
  const prof = catalog.profiles[config.gpuProfile]!;
  if (kind === 't2i') return prof.image_workflow!;
  if (kind === 'i2v') return 'i2v_wan22_ti2v5b';
  if (kind === 't2v') return 't2v_wan22_ti2v5b';
  return 'upscale_esrgan_image';
}

/** Dimensions vidéo valides pour Wan (multiples de 32) et nombre d'images 4n+1. */
export const wanLength = (duration: number, fps: number) => Math.round((duration * fps) / 4) * 4 + 1;

async function json(res: Response): Promise<any> {
  if (!res.ok) throw new Error(`ComfyUI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export function createComfyBackend(base = config.comfyUrl): Backend {
  let currentPrompt: string | null = null;
  return {
    id: 'comfyui',
    supports: (k) => k === 't2i' || k === 'i2v' || k === 't2v' || k === 'upscale',
    async health() {
      try { const r = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(3000) }); return r.ok; } catch { return false; }
    },
    async cancel() {
      await fetch(`${base}/interrupt`, { method: 'POST' }).catch(() => {});
    },
    async generate(req: GenRequest): Promise<GenResult> {
      const prof = catalog.profiles[config.gpuProfile]!;
      const wf = loadWorkflow(workflowFor(req.kind));
      let imageName = '';
      if (req.inputPath) {
        const form = new FormData();
        const buf = fs.readFileSync(req.inputPath);
        form.append('image', new Blob([new Uint8Array(buf)]), `zodiak_${crypto.randomUUID()}${path.extname(req.inputPath) || '.png'}`);
        form.append('overwrite', 'true');
        const up = await json(await fetch(`${base}/upload/image`, { method: 'POST', body: form, signal: req.signal }));
        imageName = up.name;
      }
      const vars: Record<string, string | number | boolean> = {
        prompt: req.prompt, negative: req.negative || 'blurry, low quality, distorted, watermark, text',
        width: req.width, height: req.height, seed: req.seed, steps: req.steps, fps: req.fps,
        length: wanLength(req.duration, req.fps), image: imageName,
        flux_ckpt: prof.flux_ckpt ?? '', flux_unet: prof.flux_unet ?? '', wan_unet: prof.wan_unet ?? '',
      };
      let graph = renderWorkflow(wf.nodes, vars);
      if (req.loraName) graph = injectLora(graph, req.loraName);
      const queued = await json(await fetch(`${base}/prompt`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: req.signal,
        body: JSON.stringify({ prompt: graph, client_id: 'zodiak' }),
      }));
      const id: string = queued.prompt_id;
      currentPrompt = id;
      const onAbort = () => { void fetch(`${base}/interrupt`, { method: 'POST' }).catch(() => {}); };
      req.signal.addEventListener('abort', onAbort, { once: true });
      try {
        const started = Date.now();
        for (;;) {
          if (req.signal.aborted) throw new CanceledError();
          await new Promise((r) => setTimeout(r, 1000));
          const hist = await json(await fetch(`${base}/history/${id}`, { signal: req.signal }));
          const entry = hist[id];
          if (entry?.status?.status_str === 'error') throw new Error('ComfyUI a signalé une erreur de génération');
          if (entry?.outputs && Object.keys(entry.outputs).length) {
            const files: { filename: string; subfolder: string; type: string }[] = [];
            for (const out of Object.values<any>(entry.outputs)) for (const k of ['videos', 'images', 'gifs']) for (const f of out[k] ?? []) files.push(f);
            const pick = files.find((f) => /\.(mp4|webm)$/i.test(f.filename)) ?? files.find((f) => f.type === 'output') ?? files[0];
            if (!pick) throw new Error('ComfyUI n’a renvoyé aucun fichier');
            const q = new URLSearchParams({ filename: pick.filename, subfolder: pick.subfolder ?? '', type: pick.type ?? 'output' });
            const res = await fetch(`${base}/view?${q}`, { signal: req.signal });
            if (!res.ok) throw new Error(`ComfyUI /view ${res.status}`);
            const ext = pick.filename.split('.').pop()!.toLowerCase();
            fs.mkdirSync(req.workDir, { recursive: true });
            const file = path.join(req.workDir, `out.${ext}`);
            fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
            const mime = MIME[ext] ?? 'application/octet-stream';
            return { file, mime, kind: mime.startsWith('video') ? 'video' : 'image' };
          }
          const s = (Date.now() - started) / 1000;
          req.progress(Math.min(90, Math.round(10 + s / 6)), 'Génération en cours (ComfyUI)');
        }
      } finally {
        req.signal.removeEventListener('abort', onAbort);
        currentPrompt = null;
      }
    },
  };
}
