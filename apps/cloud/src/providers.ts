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
// Fournisseurs « directs » (chez l'éditeur du modèle, moins cher que fal) : clé(s) requise(s).
const DIRECT_KEYS: Record<string, string[]> = {
  modal: ['MODAL_TOKEN', 'MODAL_SUBMIT_URL', 'MODAL_STATUS_URL'], kling: ['KLING_API_KEY'], byteplus: ['ARK_API_KEY'], google: ['GEMINI_API_KEY'],
};
export const isDirect = (id: string) => id in DIRECT_KEYS;
export const directReady = (id: string) => (DIRECT_KEYS[id] ?? []).every((k) => !!process.env[k]);
export const isRemote = (id: string) => id === 'fal' || id === 'runpod' || isDirect(id);

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

/** Fournisseur d'un job : celui du modèle choisi (catalogue), sinon le moteur par défaut du site.
 *  Fournisseur direct sans clé → repli sur fal si le modèle y a une adresse. */
export function providerFor(job: Row, fallback: string): string {
  const id = JSON.parse(job.params ?? '{}').engine; // posé seulement quand le site tourne avec des modèles distants
  const e = id ? engineFor(job.kind, id) : null;
  if (!e?.provider) return fallback;
  return directReady(e.provider) || !Object.keys(e.endpoints).length ? e.provider : 'fal';
}

/** Modèle proposable : moteur fal, ou fournisseur direct configuré, ou repli fal possible. */
export const engineUsable = (e: { provider?: string; endpoints: Record<string, string> }) =>
  !e.provider || directReady(e.provider) || Object.keys(e.endpoints).length > 0;

const modalHeaders = () => {
  const token = process.env.MODAL_TOKEN;
  if (!token || !process.env.MODAL_SUBMIT_URL || !process.env.MODAL_STATUS_URL) throw new Error('MODAL_TOKEN / MODAL_SUBMIT_URL / MODAL_STATUS_URL manquants');
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
};

const KLING = 'https://api-singapore.klingai.com';
const ARK = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const bearer = (key: string) => ({ authorization: `Bearer ${process.env[key]}`, 'content-type': 'application/json' });
const googleHeaders = () => ({ 'x-goog-api-key': process.env.GEMINI_API_KEY!, 'content-type': 'application/json' });
const b64 = (file: string) => {
  const buf = fs.readFileSync(file);
  return { data: buf.toString('base64'), mime_type: buf[0] === 0xff ? 'image/jpeg' : buf[0] === 0x52 ? 'image/webp' : 'image/png' };
};

export type DirectInputs = { startUrl?: string | null; endUrl?: string | null; startFile?: string | null; endFile?: string | null };

/** Corps de requête des fournisseurs directs (d'après leur documentation officielle du 26/10/2026). */
export function directBody(provider: string, job: Row, req: { prompt: string; negative: string }, o: DirectInputs): { url: string; body: Record<string, unknown> } {
  const p = JSON.parse(job.params);
  const e = engineFor(job.kind, p.engine);
  const w = Number(p.width) || 1280, h = Number(p.height) || 720;
  const seconds = Math.round(Math.min(5, Number(p.duration) || 5));
  switch (provider) {
    case 'modal':
      return { url: process.env.MODAL_SUBMIT_URL!, body: { model: e?.model ?? 'wan22-lightning', start_url: o.startUrl ?? undefined, end_url: o.endUrl ?? undefined, prompt: req.prompt,
        negative: req.negative, resolution: p.draft ? '480p' : '720p', seconds, seed: p.seed } };
    case 'kling': { // API « nouvelle génération » : pas de champ négatif, multi_shot vaut true par défaut
      const settings = { resolution: '720p', duration: Math.max(3, seconds), audio: 'off', multi_shot: false };
      if (job.kind === 't2v') return { url: `${KLING}/text-to-video/${e?.model}`, body: { prompt: req.prompt, settings: { ...settings, aspect_ratio: ratio(w, h, ['16:9', '9:16', '1:1']) } } };
      const contents = [{ type: 'prompt', text: req.prompt }, { type: 'first_frame', url: o.startUrl }, ...(o.endUrl ? [{ type: 'last_frame', url: o.endUrl }] : [])];
      return { url: `${KLING}/image-to-video/${e?.model}`, body: { contents, settings, options: { watermark_info: { enabled: false } } } };
    }
    case 'byteplus': {
      const content: Record<string, unknown>[] = [{ type: 'text', text: req.prompt }];
      if (o.startUrl) content.push({ type: 'image_url', image_url: { url: o.startUrl }, role: 'first_frame' });
      if (o.endUrl) content.push({ type: 'image_url', image_url: { url: o.endUrl }, role: 'last_frame' });
      return { url: `${ARK}/contents/generations/tasks`, body: { model: e?.model, content, resolution: '720p', duration: Math.max(4, seconds), generate_audio: true, watermark: false,
        ratio: o.startUrl ? 'adaptive' : ratio(w, h, ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9']) } };
    }
    default: { // google (Interactions API) : image (Nano Banana) ou vidéo (Omni), en arrière-plan
      if (job.kind === 't2i') return { url: `${GEMINI}/interactions`, body: { model: e?.model, input: req.prompt, background: true,
        response_format: { type: 'image', mime_type: 'image/jpeg', image_size: '1K', aspect_ratio: ratio(w, h, ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16']) } } };
      const images = [o.startFile, o.endFile].filter(Boolean).map((f) => ({ type: 'image', ...b64(f!) }));
      // Omni n'a pas de champ durée : elle se donne dans le texte (vérifié le 26/10 : 5 s demandées → 5,0 s facturées).
      return { url: `${GEMINI}/interactions`, body: { model: e?.model, input: [...images, { type: 'text', text: `${req.prompt} Duration: ${seconds} seconds.` }], background: true,
        response_format: { type: 'video', resolution: '720p', aspect_ratio: ratio(w, h, ['16:9', '9:16']) } } };
    }
  }
}

/** Envoi chez un fournisseur direct : Modal, Kling, BytePlus (Seedance) ou Google (Gemini). Suivi par interrogation. */
export async function submitDirect(provider: string, job: Row, req: { prompt: string; negative: string }, o: DirectInputs): Promise<{ ref: string; urls: Record<string, string> }> {
  if (!directReady(provider)) throw new Error(`${provider} : clé manquante (${DIRECT_KEYS[provider]!.join(', ')})`);
  if (job.kind === 'i2v' && provider === 'kling' && !o.startUrl) throw new Error('Kling : image de départ requise');
  const { url, body } = directBody(provider, job, req, o);
  const headers = provider === 'modal' ? modalHeaders() : provider === 'kling' ? bearer('KLING_API_KEY') : provider === 'byteplus' ? bearer('ARK_API_KEY') : googleHeaders();
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as any;
  const id = provider === 'kling' ? j.data?.id : j.id;
  if (!res.ok || !id || (provider === 'kling' && j.code !== 0)) throw new Error(`${provider} : ${String(j.error?.message ?? j.error ?? j.message ?? j.detail ?? res.status).slice(0, 200)}`);
  const status = provider === 'modal' ? `${process.env.MODAL_STATUS_URL}?id=${encodeURIComponent(id)}`
    : provider === 'kling' ? `${KLING}/tasks?task_ids=${encodeURIComponent(id)}`
    : provider === 'byteplus' ? `${ARK}/contents/generations/tasks/${encodeURIComponent(id)}` : `${GEMINI}/interactions/${encodeURIComponent(id)}`;
  return { ref: id, urls: { status } };
}

/** Média produit par Gemini : steps[] → model_output → image/vidéo (base64), rendu en lien data: pour le téléchargement. */
export function googleMedia(j: any): string | null {
  for (const step of j?.steps ?? []) {
    if (step.type !== 'model_output') continue;
    const c = (step.content ?? []).find((x: any) => (x.type === 'video' || x.type === 'image') && (x.data || x.uri));
    if (c?.data) return `data:${c.mime_type ?? 'application/octet-stream'};base64,${c.data}`;
    if (c?.uri) return c.uri;
  }
  return null;
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

export type RemoteStatus = { state: 'pending' } | { state: 'failed'; error?: string } | { state: 'done'; url: string; headers?: Record<string, string> };

/** Interroge le fournisseur (utilisé comme filet de sécurité si le webhook n'est pas arrivé). */
export async function remoteStatus(provider: string, job: Row): Promise<RemoteStatus> {
  const urls = JSON.parse(job.provider_urls ?? '{}') as Record<string, string>;
  if (urls.result) return { state: 'done', url: urls.result }; // posé par le webhook
  if (provider === 'modal') {
    const res = await fetch(urls.status!, { headers: modalHeaders() });
    if (/video\/mp4/.test(res.headers.get('content-type') ?? '')) return { state: 'done', url: urls.status!, headers: modalHeaders() };
    const st = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) return { state: 'failed', error: `Modal : ${res.status}` };
    return st.state === 'failed' ? { state: 'failed', error: String(st.error ?? 'échec du GPU') } : { state: 'pending' };
  }
  if (provider === 'kling' || provider === 'byteplus' || provider === 'google') {
    const headers = provider === 'kling' ? bearer('KLING_API_KEY') : provider === 'byteplus' ? bearer('ARK_API_KEY') : googleHeaders();
    const res = await fetch(urls.status!, { headers });
    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) return { state: 'failed', error: `${provider} : ${String(j.error?.message ?? j.message ?? res.status).slice(0, 200)}` };
    return parseDirectStatus(provider, j);
  }
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

/** État d'une tâche Kling (GET /tasks), BytePlus (GET /contents/generations/tasks/{id}) ou Gemini (GET /interactions/{id}). */
export function parseDirectStatus(provider: string, j: any): RemoteStatus {
  if (provider === 'kling') {
    const t = j?.data?.[0];
    if (t?.status === 'succeeded') {
      const url = (t.outputs ?? []).find((x: any) => x.type === 'video')?.url;
      return url ? { state: 'done', url } : { state: 'failed', error: 'Kling : aucune vidéo en sortie' };
    }
    return t?.status === 'failed' ? { state: 'failed', error: `Kling : ${t.message ?? 'échec'}` } : { state: 'pending' };
  }
  if (provider === 'byteplus') {
    if (j?.status === 'succeeded') return j.content?.video_url ? { state: 'done', url: j.content.video_url } : { state: 'failed', error: 'Seedance : aucune vidéo en sortie' };
    return ['failed', 'expired', 'cancelled'].includes(j?.status) ? { state: 'failed', error: `Seedance : ${j.error?.message ?? j.status}` } : { state: 'pending' };
  }
  if (j?.status === 'completed') {
    const url = googleMedia(j);
    if (!url) return { state: 'failed', error: 'Gemini : aucun média en sortie' };
    return url.startsWith('data:') ? { state: 'done', url } : { state: 'done', url, headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' } };
  }
  const err = j?.errors?.[0] ?? j?.error;
  return ['failed', 'cancelled'].includes(j?.status) ? { state: 'failed', error: `Gemini : ${err?.code ? `${err.code} ` : ''}${err?.message ?? j.status}` } : { state: 'pending' };
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
