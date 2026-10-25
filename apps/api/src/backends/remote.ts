import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { catalog } from '../catalog.ts';
import { loadWorkflow, renderWorkflow, injectLora } from '../workflows.ts';
import { workflowFor, wanLength } from './comfyui.ts';
import type { Backend, GenRequest, GenResult } from './types.ts';
import { CanceledError } from './types.ts';

// ⚠ RunPod et fal : code écrit d'après la documentation publique, NON testé contre les services réels
// (pas de clé d'API ni de budget dans l'environnement de développement).

const sleep = (ms: number, s: AbortSignal) => new Promise<void>((res, rej) => {
  if (s.aborted) return rej(new CanceledError());
  const t = setTimeout(res, ms);
  s.addEventListener('abort', () => { clearTimeout(t); rej(new CanceledError()); }, { once: true });
});

/** RunPod serverless avec une image « worker-comfyui » : entrée { workflow, images:[{name,image(base64)}] }. */
export function createRunpodBackend(): Backend {
  const base = `https://api.runpod.ai/v2/${config.runpodEndpointId}`;
  const headers = { authorization: `Bearer ${config.runpodApiKey}`, 'content-type': 'application/json' };
  return {
    id: 'runpod',
    supports: (k) => k === 't2i' || k === 'i2v' || k === 't2v' || k === 'upscale',
    async health() { return !!config.runpodApiKey && !!config.runpodEndpointId; },
    async generate(req: GenRequest): Promise<GenResult> {
      if (!config.runpodApiKey || !config.runpodEndpointId) throw new Error('RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID manquants');
      const prof = catalog.profiles[config.gpuProfile]!;
      const wf = loadWorkflow(workflowFor(req.kind));
      const name = 'input.png';
      let graph = renderWorkflow(wf.nodes, {
        prompt: req.prompt, negative: req.negative, width: req.width, height: req.height, seed: req.seed, steps: req.steps,
        fps: req.fps, length: wanLength(req.duration, req.fps), image: name,
        flux_ckpt: prof.flux_ckpt ?? '', flux_unet: prof.flux_unet ?? '', wan_unet: prof.wan_unet ?? '',
      });
      if (req.loraName) graph = injectLora(graph, req.loraName);
      const input: Record<string, unknown> = { workflow: graph };
      if (req.inputPath) input.images = [{ name, image: fs.readFileSync(req.inputPath).toString('base64') }];
      const sub = await (await fetch(`${base}/run`, { method: 'POST', headers, body: JSON.stringify({ input }), signal: req.signal })).json() as any;
      if (!sub.id) throw new Error(`RunPod: ${JSON.stringify(sub).slice(0, 200)}`);
      for (let i = 0; ; i++) {
        try { await sleep(2000, req.signal); } catch (e) { await fetch(`${base}/cancel/${sub.id}`, { method: 'POST', headers }).catch(() => {}); throw e; }
        const st = await (await fetch(`${base}/status/${sub.id}`, { headers, signal: req.signal })).json() as any;
        if (st.status === 'COMPLETED') {
          const out = (st.output?.images ?? [])[0];
          if (!out?.data) throw new Error('RunPod: sortie vide');
          const ext = String(out.filename ?? 'out.png').split('.').pop()!.toLowerCase();
          const file = path.join(req.workDir, `out.${ext}`);
          fs.mkdirSync(req.workDir, { recursive: true });
          fs.writeFileSync(file, Buffer.from(String(out.data).replace(/^data:[^,]+,/, ''), 'base64'));
          const video = ext === 'mp4' || ext === 'webm';
          return { file, mime: video ? `video/${ext}` : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, kind: video ? 'video' : 'image' };
        }
        if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(st.status)) throw new Error(`RunPod: ${st.status} ${st.error ?? ''}`);
        req.progress(Math.min(90, 10 + i * 2), `RunPod : ${st.status}`);
      }
    },
  };
}

/** fal.ai (file d'attente HTTP). Les identifiants de modèles sont réglables ; les valeurs par défaut sont à vérifier. */
export function createFalBackend(): Backend {
  const models: Record<string, string> = {
    t2i: process.env.FAL_MODEL_T2I ?? 'fal-ai/flux/schnell',
    i2v: process.env.FAL_MODEL_I2V ?? 'fal-ai/wan/v2.2-5b/image-to-video',
    t2v: process.env.FAL_MODEL_T2V ?? 'fal-ai/wan/v2.2-5b/text-to-video',
  };
  const headers = { authorization: `Key ${config.falKey}`, 'content-type': 'application/json' };
  return {
    id: 'fal',
    supports: (k) => k === 't2i' || k === 'i2v' || k === 't2v',
    async health() { return !!config.falKey; },
    async generate(req: GenRequest): Promise<GenResult> {
      if (!config.falKey) throw new Error('FAL_KEY manquante');
      const model = models[req.kind];
      if (!model) throw new Error(`fal ne prend pas en charge ${req.kind}`);
      const body: Record<string, unknown> = { prompt: req.prompt, seed: req.seed };
      if (req.kind === 't2i') body.image_size = { width: req.width, height: req.height };
      if (req.inputPath) body.image_url = `data:image/png;base64,${fs.readFileSync(req.inputPath).toString('base64')}`;
      const sub = await (await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal })).json() as any;
      if (!sub.status_url || !sub.response_url) throw new Error(`fal: ${JSON.stringify(sub).slice(0, 200)}`);
      for (let i = 0; ; i++) {
        await sleep(2000, req.signal);
        const st = await (await fetch(sub.status_url, { headers, signal: req.signal })).json() as any;
        if (st.status === 'COMPLETED') break;
        if (st.status === 'FAILED' || st.error) throw new Error(`fal: ${JSON.stringify(st).slice(0, 200)}`);
        req.progress(Math.min(90, 10 + i * 2), `fal : ${st.status}`);
      }
      const res = await (await fetch(sub.response_url, { headers, signal: req.signal })).json() as any;
      const url: string | undefined = res.video?.url ?? res.images?.[0]?.url;
      if (!url) throw new Error('fal: aucune URL en sortie');
      const dl = await fetch(url, { signal: req.signal });
      const ext = new URL(url).pathname.split('.').pop()!.toLowerCase().replace('jpeg', 'jpg');
      const file = path.join(req.workDir, `out.${ext}`);
      fs.mkdirSync(req.workDir, { recursive: true });
      fs.writeFileSync(file, Buffer.from(await dl.arrayBuffer()));
      const video = ext === 'mp4' || ext === 'webm';
      return { file, mime: video ? `video/${ext}` : `image/${ext === 'jpg' ? 'jpeg' : ext}`, kind: video ? 'video' : 'image' };
    },
  };
}
