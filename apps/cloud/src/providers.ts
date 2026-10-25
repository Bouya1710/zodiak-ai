import fs from 'node:fs';
import crypto from 'node:crypto';
import { cloud } from './env.ts';
import { catalog } from '../../api/src/catalog.ts';
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

const FAL_MODELS: Record<string, string> = {
  t2i: process.env.FAL_MODEL_T2I ?? 'fal-ai/flux/schnell',
  i2v: process.env.FAL_MODEL_I2V ?? 'fal-ai/wan/v2.2-5b/image-to-video',
  t2v: process.env.FAL_MODEL_T2V ?? 'fal-ai/wan/v2.2-5b/text-to-video',
};

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
    const body: Record<string, unknown> = { prompt: req.prompt, seed: p.seed };
    if (job.kind === 't2i') body.image_size = { width: p.width, height: p.height };
    if (o.inputPath) body.image_url = `data:image/png;base64,${fs.readFileSync(o.inputPath).toString('base64')}`;
    const url = `https://queue.fal.run/${FAL_MODELS[job.kind]}${hook ? `?fal_webhook=${encodeURIComponent(hook)}` : ''}`;
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
