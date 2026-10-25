import fs from 'node:fs';
import crypto from 'node:crypto';
import { cloud } from './env.ts';
import { catalog, engineFor } from '../../api/src/catalog.ts';
import { loadWorkflow, renderWorkflow, injectLora } from '../../api/src/workflows.ts';
import { workflowFor, wanLength } from '../../api/src/backends/comfyui.ts';
import { config } from '../../api/src/config.ts';
import { buildGenRequest } from '../../api/src/exec.ts';

// ⚠ Fournisseurs distants (fal, RunPod) : écrits d'après leur documentation publique, NON testés
// (aucune clé dans l'environnement de développement). Fonctionnement asynchrone adapté à Vercel :
// soumission → webhook du fournisseur (/api/webhooks/<fournisseur>) → clôture au prochain suivi du job.

type Row = Record<string, any>;
export const isRemote = (id: string) => id === 'fal' || id === 'runpod';

export const webhookSig = (jobId: string) => crypto.createHmac('sha256', cloud.serverSecret).update(`webhook:${jobId}`).digest('hex').slice(0, 32);
const hookUrl = (provider: string, jobId: string) =>
  cloud.publicUrl ? `${cloud.publicUrl}/api/webhooks/${provider}?job=${jobId}&sig=${webhookSig(jobId)}` : '';

const ratio = (w: number, h: number, allowed: string[]) => {
  const r = w / h;
  return allowed.map((a) => [a, Math.abs(Math.log(r / (Number(a.split(':')[0]) / Number(a.split(':')[1]))))] as const).sort((x, y) => x[1] - y[1])[0]![0];
};

/** Corps de requête fal propre à chaque modèle (schémas lus sur fal.ai/models/<id>/api). */
export function falBody(engineId: string, kind: string, req: { prompt: string; negative: string }, p: Record<string, any>, imageUrl: string | null): Record<string, unknown> {
  const w = Number(p.width) || 1024, h = Number(p.height) || 1024;
  switch (engineId) {
    case 'flux-schnell':
      return { prompt: req.prompt, seed: p.seed, image_size: { width: w, height: h }, num_inference_steps: 4, enable_safety_checker: true };
    case 'nano-banana':
      return { prompt: req.prompt, seed: p.seed, num_images: 1, output_format: 'jpeg', aspect_ratio: ratio(w, h, ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16']) };
    case 'kling-25': {
      const body: Record<string, unknown> = { prompt: req.prompt, duration: '5', ...(req.negative ? { negative_prompt: req.negative } : {}) };
      if (kind === 'i2v') body.image_url = imageUrl;
      else body.aspect_ratio = ratio(w, h, ['16:9', '9:16', '1:1']);
      return body;
    }
    default: { // wan-22
      const body: Record<string, unknown> = {
        prompt: req.prompt, seed: p.seed, resolution: p.draft ? '480p' : '720p', num_frames: 81, frames_per_second: 16,
        aspect_ratio: ratio(w, h, ['16:9', '9:16', '1:1']), enable_safety_checker: true, ...(req.negative ? { negative_prompt: req.negative } : {}),
      };
      if (kind === 'i2v') body.image_url = imageUrl;
      return body;
    }
  }
}

export async function submitRemote(provider: string, job: Row, o: { character?: Row; inputPath: string | null; jobId: string }): Promise<{ ref: string; urls: Record<string, string> }> {
  const hook = hookUrl(provider, o.jobId);
  const p = JSON.parse(job.params);
  const noop = new AbortController().signal;
  const req = buildGenRequest(job, {
    backend: { id: provider } as never, inputPath: () => o.inputPath ?? '', assetKind: () => 'image', character: o.character,
    workDir: '', signal: noop, progress: () => {},
  });
  if (provider === 'fal') {
    const key = process.env.FAL_KEY;
    if (!key) throw new Error('FAL_KEY manquante');
    const engine = engineFor(job.kind, p.engine);
    const endpoint = engine?.endpoints[job.kind as 't2i'];
    if (!engine || !endpoint) throw new Error(`Aucun modèle fal pour ${job.kind}`);
    let imageUrl: string | null = null;
    if (o.inputPath) {
      const buf = fs.readFileSync(o.inputPath);
      const mime = buf[0] === 0xff ? 'image/jpeg' : buf[0] === 0x52 ? 'image/webp' : 'image/png';
      imageUrl = `data:${mime};base64,${buf.toString('base64')}`;
    }
    const body = falBody(engine.id, job.kind, req, p, imageUrl);
    const url = `https://queue.fal.run/${endpoint}${hook ? `?fal_webhook=${encodeURIComponent(hook)}` : ''}`;
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Key ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await res.json()) as any;
    if (!res.ok || !j.status_url) throw new Error(`fal : ${JSON.stringify(j).slice(0, 200)}`);
    return { ref: j.request_id, urls: { status: j.status_url, response: j.response_url } };
  }
  // RunPod : endpoint serverless « worker-comfyui » (entrée { workflow, images }).
  const key = process.env.RUNPOD_API_KEY, ep = process.env.RUNPOD_ENDPOINT_ID;
  if (!key || !ep) throw new Error('RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID manquants');
  const prof = catalog.profiles[config.gpuProfile]!;
  let graph = renderWorkflow(loadWorkflow(workflowFor(job.kind)).nodes, {
    prompt: req.prompt, negative: req.negative, width: p.width, height: p.height, seed: p.seed, steps: p.steps, fps: p.fps ?? 24,
    length: wanLength(p.duration ?? 5, p.fps ?? 24), image: 'input.png', flux_ckpt: prof.flux_ckpt ?? '', flux_unet: prof.flux_unet ?? '', wan_unet: prof.wan_unet ?? '',
  });
  if (o.character?.lora_name) graph = injectLora(graph, o.character.lora_name);
  const input: Record<string, unknown> = { workflow: graph };
  if (o.inputPath) input.images = [{ name: 'input.png', image: fs.readFileSync(o.inputPath).toString('base64') }];
  const res = await fetch(`https://api.runpod.ai/v2/${ep}/run`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ input, ...(hook ? { webhook: hook } : {}) }),
  });
  const j = (await res.json()) as any;
  if (!res.ok || !j.id) throw new Error(`RunPod : ${JSON.stringify(j).slice(0, 200)}`);
  return { ref: j.id, urls: { status: `https://api.runpod.ai/v2/${ep}/status/${j.id}` } };
}

export type RemoteStatus = { state: 'pending' } | { state: 'failed'; error?: string } | { state: 'done'; url: string };

/** Interroge le fournisseur (utilisé comme filet de sécurité si le webhook n'est pas arrivé). */
export async function remoteStatus(provider: string, job: Row): Promise<RemoteStatus> {
  const urls = JSON.parse(job.provider_urls ?? '{}') as Record<string, string>;
  if (urls.result) return { state: 'done', url: urls.result }; // posé par le webhook
  if (provider === 'fal') {
    const h = { authorization: `Key ${process.env.FAL_KEY}` };
    const st = (await (await fetch(urls.status!, { headers: h })).json()) as any;
    if (st.status === 'COMPLETED') {
      const r = (await (await fetch(urls.response!, { headers: h })).json()) as any;
      const url = r.video?.url ?? r.images?.[0]?.url;
      return url ? { state: 'done', url } : { state: 'failed', error: 'fal : aucune URL en sortie' };
    }
    return st.error ? { state: 'failed', error: String(st.error) } : { state: 'pending' };
  }
  const st = (await (await fetch(urls.status!, { headers: { authorization: `Bearer ${process.env.RUNPOD_API_KEY}` } })).json()) as any;
  if (st.status === 'COMPLETED') {
    const out = st.output?.images?.[0];
    if (out?.type === 'url' && out.data) return { state: 'done', url: out.data };
    if (out?.data) return { state: 'done', url: `data:application/octet-stream;base64,${String(out.data).replace(/^data:[^,]+,/, '')}` };
    return { state: 'failed', error: 'RunPod : sortie vide' };
  }
  return ['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(st.status) ? { state: 'failed', error: `RunPod : ${st.status}` } : { state: 'pending' };
}

/** Extrait l'URL du résultat d'un corps de webhook (fal ou RunPod). */
export function resultUrlFromWebhook(provider: string, body: any): string | null {
  if (provider === 'fal') {
    const p = body?.payload ?? body;
    return p?.video?.url ?? p?.images?.[0]?.url ?? null;
  }
  const out = body?.output?.images?.[0];
  return out?.type === 'url' ? out.data : null;
}
