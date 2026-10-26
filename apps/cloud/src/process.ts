import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloud } from './env.ts';
import * as supa from './supa.ts';
import type { Session } from './session.ts';
import { executeJob } from '../../api/src/exec.ts';
import { createBackend } from '../../api/src/backends/index.ts';
import { sniff, EXT } from '../../api/src/serialize.ts';
import { isBlockedImage } from '../../api/src/safety.ts';
import { ffmpeg, makeThumb, probe } from '../../api/src/ffmpeg.ts';
import { CanceledError } from '../../api/src/backends/types.ts';
import { submitRemote, submitDirect, remoteStatus, isRemote, isDirect, providerFor } from './providers.ts';
import { buildGenRequest } from '../../api/src/exec.ts';
import { engineFor, nextFallback } from '../../api/src/catalog.ts';

type Row = Record<string, any>;
const iso = () => new Date().toISOString();

export const backend = () => createBackend();

export interface Ingest { file: string; mime: string; kind: 'image' | 'video' | 'audio'; title?: string | null; prompt?: string | null; jobId?: string | null; origin: 'generated' | 'upload'; fingerprint?: string | null }

/** Envoie le fichier dans Supabase Storage, génère la vignette et enregistre le média. */
export async function ingest(s: Session, a: Ingest): Promise<Row> {
  const id = crypto.randomUUID();
  const key = `${s.user.id}/${id}.${EXT[a.mime] ?? 'bin'}`;
  const buf = fs.readFileSync(a.file);
  let width: number | null = null, height: number | null = null, duration: number | null = null;
  try { const p = await probe(a.file); width = p.width; height = p.height; duration = a.kind === 'image' ? null : p.duration; } catch { /* facultatif */ }
  await supa.upload(key, buf, a.mime, s.jwt);
  let thumbKey: string | null = null;
  if (a.kind !== 'audio') {
    const tmp = path.join(os.tmpdir(), `zodiak-thumb-${id}.jpg`);
    try {
      await makeThumb(a.file, tmp);
      thumbKey = `${s.user.id}/${id}.thumb.jpg`;
      await supa.upload(thumbKey, fs.readFileSync(tmp), 'image/jpeg', s.jwt);
    } catch { thumbKey = null; } finally { try { fs.unlinkSync(tmp); } catch { /* ok */ } }
  }
  const row = await supa.write('insert', 'assets', {
    id, user_id: s.user.id, kind: a.kind, mime: a.mime, storage_key: key, thumb_key: thumbKey, width, height, duration,
    title: a.title ?? null, prompt: a.prompt ?? null, job_id: a.jobId ?? null, origin: a.origin,
    fingerprint: a.fingerprint ?? null, sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  });
  return row!;
}

const update = (id: string, patch: Row) => supa.write('update', 'jobs', patch, id);

async function fail(s: Session, job: Row, status: 'failed' | 'canceled' | 'blocked', error: string | null, message: string) {
  const cur = await supa.write('get', 'jobs', {}, job.id);
  if (cur && ['done', 'failed', 'canceled', 'blocked'].includes(cur.status)) return;
  await update(job.id, { status, error, message, finished_at: iso() });
  if (cloud.creditsEnabled && job.cost > 0) await supa.credits(job.user_id, job.cost, `refund_${status}`, job.id).catch(() => {});
}

function fingerprint(job: Row, inputShas: string[], backendId: string): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    k: job.kind, p: job.prompt, n: job.negative_prompt, params: JSON.parse(job.params), preset: job.preset_id, char: job.character_id, inputs: inputShas, backend: backendId,
  })).digest('hex');
}

/**
 * Repli automatique : le fournisseur du modèle choisi refuse ou échoue → même demande sur le modèle suivant de
 * `fallback` (catalog/engines.json), au plus 2 replis par job. Les crédits ne bougent pas (l'écart éventuel,
 * plafonné par `nextFallback`, est absorbé par le site). Renvoie false s'il n'y a pas de repli possible.
 */
export async function retryWithFallback(s: Session, job: Row, reason: string): Promise<boolean> {
  if (!['t2i', 'i2v', 't2v'].includes(job.kind)) return false;
  const p = JSON.parse(job.params ?? '{}');
  const tried: string[] = p.tried ?? [];
  const cur = engineFor(job.kind, p.engine);
  if (!cur || tried.length >= 2) return false;
  const next = nextFallback(job.kind, cur, [...tried, cur.id], { endImage: !!p.endAssetId, draft: p.draft === true });
  if (!next) return false;
  const params = JSON.stringify({ ...p, engine: next.id, tried: [...tried, cur.id] });
  console.error(`[repli] job ${job.id} : ${cur.id} → ${next.id} (${reason.slice(0, 160)})`);
  await update(job.id, { params, status: 'running', provider: null, provider_ref: null, provider_urls: null, progress: 5, message: `Repli automatique : ${cur.name} indisponible, essai avec ${next.name}` });
  await processJob(s, { ...job, params, status: 'running', provider: null, provider_ref: null, provider_urls: null });
  return true;
}

/** Télécharge dans un dossier temporaire les médias dont le job a besoin. */
async function fetchInputs(s: Session, job: Row, dir: string) {
  const p = JSON.parse(job.params);
  const ids = [job.input_asset_id, job.audio_asset_id, p.endAssetId, ...((p.assetIds ?? []) as string[])].filter(Boolean) as string[];
  const rows = new Map<string, Row>();
  for (const id of new Set(ids)) {
    const r = (await supa.select('assets', { id: `eq.${id}`, select: '*' }, s.jwt))[0];
    if (!r) throw new Error('Média source introuvable');
    const file = path.join(dir, `in-${id}.${EXT[r.mime] ?? 'bin'}`);
    fs.writeFileSync(file, await supa.download(r.storage_key, s.jwt));
    rows.set(id, { ...r, file });
  }
  return rows;
}

/** Traite un job : génération (mock ou fournisseur distant) ou outil ffmpeg. Appelé en arrière-plan (waitUntil). */
export async function processJob(s: Session, job: Row): Promise<void> {
  const dir = path.join(os.tmpdir(), 'zodiak-jobs', job.id);
  fs.mkdirSync(dir, { recursive: true });
  const be = backend();
  const ac = new AbortController();
  let submitting = false; // vrai pendant l'envoi au fournisseur : un échec à ce stade déclenche le repli
  try {
    await update(job.id, { status: 'running', started_at: iso(), progress: 3, message: 'Démarrage' });
    const inputs = await fetchInputs(s, job, dir);
    const fp = fingerprint(job, [...inputs.values()].map((r) => r.sha256 ?? ''), be.id);

    // Cache : même empreinte (graine explicite comprise) → on réutilise, crédits rendus.
    const hit = (await supa.select('assets', { fingerprint: `eq.${fp}`, select: 'id', limit: '1', order: 'created_at.desc' }, s.jwt))[0];
    if (hit) {
      if (cloud.creditsEnabled && job.cost > 0) await supa.credits(job.user_id, job.cost, 'refund_cache', job.id).catch(() => {});
      await update(job.id, { status: 'done', progress: 100, cache_hit: true, cost: 0, result_asset_ids: JSON.stringify([hit.id]), message: 'Résultat identique déjà généré (cache)', finished_at: iso() });
      return;
    }

    const character = job.character_id ? (await supa.select('characters', { id: `eq.${job.character_id}`, select: '*' }, s.jwt))[0] : undefined;

    const provider = providerFor(job, be.id);
    if (isRemote(provider) && ['t2i', 'i2v', 't2v'].includes(job.kind)) {
      submitting = true;
      let sub;
      if (isDirect(provider)) {
        // Le fournisseur télécharge lui-même les images (liens signés 1 h) : pas de limite de taille côté Vercel.
        const p = JSON.parse(job.params);
        const signed = async (id: string | null | undefined) => (id ? supa.signedUrl(inputs.get(id)!.storage_key, s.jwt, 3600) : null);
        const startUrl = await signed(job.input_asset_id);
        if (!startUrl && job.kind === 'i2v') throw new Error('Image de départ introuvable');
        const req = buildGenRequest(job, { backend: { id: provider } as never, inputPath: () => '', assetKind: () => 'image', character, workDir: '', signal: ac.signal, progress: () => {} });
        sub = await submitDirect(provider, job, req, {
          startUrl, endUrl: await signed(p.endAssetId),
          startFile: job.input_asset_id ? inputs.get(job.input_asset_id)!.file : null, endFile: p.endAssetId ? inputs.get(p.endAssetId)!.file : null,
        });
      } else {
        const ref = job.input_asset_id ? inputs.get(job.input_asset_id)?.file ?? null : null;
        sub = await submitRemote(provider, job, { character, inputPath: ref, jobId: job.id });
      }
      submitting = false; // envoyé : plus de repli sur une simple erreur d'écriture en base
      await update(job.id, { provider, provider_ref: sub.ref, provider_urls: JSON.stringify(sub.urls), fingerprint: fp, progress: 10, message: provider === 'modal' ? 'Envoyé au moteur ZODIAK' : `Envoyé à ${provider}` });
      return; // la suite : webhook du fournisseur (ou interrogation lors du prochain suivi du job)
    }

    let last = 0;
    const out = await executeJob(job, {
      backend: be, workDir: dir, signal: ac.signal, character,
      inputPath: (id) => inputs.get(id)!.file,
      assetKind: (id) => inputs.get(id)!.kind,
      progress: (pct, msg) => { if (Date.now() - last > 400) { last = Date.now(); void update(job.id, { progress: Math.min(94, Math.round(pct)), message: msg }).catch(() => {}); } },
    });
    await finalize(s, job, out, fp);
  } catch (e) {
    if (e instanceof CanceledError) await fail(s, job, 'canceled', null, 'Annulé');
    else if (submitting && await retryWithFallback(s, job, (e as Error).message).catch(() => false)) return;
    else await fail(s, job, 'failed', (e as Error).message.slice(0, 500), 'Échec');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }
}

/** Contrôle de sortie, enregistrement du média et clôture du job. */
export async function finalize(s: Session, job: Row, out: { file: string; mime: string; kind: 'image' | 'video'; note?: string }, fp: string): Promise<void> {
  const cur = await supa.write('get', 'jobs', {}, job.id);
  if (cur && ['canceled', 'done'].includes(cur.status)) return; // annulé pendant le traitement
  await update(job.id, { progress: 95, message: 'Vérification' });
  if (process.env.SAFETY_URL) {
    let probeFile = out.file;
    if (out.kind === 'video') { probeFile = `${out.file}.frame.jpg`; await ffmpeg(['-i', out.file, '-frames:v', '1', probeFile]); }
    if (await isBlockedImage(probeFile)) {
      await supa.write('insert', 'audit_log', { user_id: job.user_id, event: 'output_blocked', detail: job.id });
      await fail(s, job, 'blocked', 'Résultat bloqué par le contrôle de contenu', 'Bloqué');
      return;
    }
  }
  const asset = await ingest(s, { file: out.file, mime: out.mime, kind: out.kind, prompt: job.prompt, jobId: job.id, origin: 'generated', fingerprint: fp });
  await update(job.id, { status: 'done', progress: 100, result_asset_ids: JSON.stringify([asset.id]), message: out.note ?? 'Terminé', finished_at: iso() });
}

/**
 * Appelé à chaque suivi d'un job en cours : récupère le résultat chez le fournisseur si prêt,
 * et clôture les jobs « perdus » (fonction interrompue) pour rendre les crédits.
 */
export async function reconcile(s: Session, job: Row): Promise<Row> {
  if (!['queued', 'running'].includes(job.status)) return job;
  const age = Date.now() - new Date(job.started_at ?? job.created_at).getTime();
  if (job.provider && job.provider_ref) {
    const st = await remoteStatus(job.provider, job).catch((e) => ({ state: 'failed' as const, error: (e as Error).message }));
    if (st.state === 'failed') {
      // Un seul suivi à la fois relance : on relit le job et on vérifie qu'il n'a pas déjà été relancé par un autre suivi.
      const cur = await supa.write('get', 'jobs', {}, job.id);
      const same = cur?.status === 'running' && cur.provider_ref === job.provider_ref;
      if (!same || !(await retryWithFallback(s, job, st.error ?? '').catch(() => false))) {
        if (same) await fail(s, job, 'failed', (st.error ?? 'Échec du fournisseur').slice(0, 500), 'Échec');
      }
    } else if (st.state === 'done') {
      const dir = path.join(os.tmpdir(), 'zodiak-jobs', job.id);
      fs.mkdirSync(dir, { recursive: true });
      try {
        const dl = await fetch(st.url, st.headers ? { headers: st.headers } : undefined);
        if (!dl.ok) throw new Error(`téléchargement du résultat : ${dl.status}`);
        const buf = Buffer.from(await dl.arrayBuffer());
        const sn = sniff(buf);
        if (!sn || sn.kind === 'audio') throw new Error('résultat illisible');
        const file = path.join(dir, `result.${EXT[sn.mime] ?? 'bin'}`);
        fs.writeFileSync(file, buf);
        await finalize(s, job, { file, mime: sn.mime, kind: sn.kind === 'image' ? 'image' : 'video' }, job.fingerprint ?? '');
      } catch (e) { await fail(s, job, 'failed', (e as Error).message, 'Échec'); }
      finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } }
    } else if (age > 30 * 60_000) await fail(s, job, 'failed', 'Délai dépassé chez le fournisseur', 'Échec');
  } else if (age > cloud.jobTimeoutMs) {
    await fail(s, job, 'failed', 'Traitement interrompu (délai dépassé)', 'Échec');
  }
  return (await supa.write('get', 'jobs', {}, job.id)) ?? job;
}
