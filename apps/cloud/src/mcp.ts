// Connecteur MCP (Streamable HTTP, réponses JSON) : ZODIAK AI utilisable depuis Claude comme un outil.
// URL : /api/mcp/<clé> (ou /api/mcp avec « Authorization: Bearer <clé> »). La clé se crée sur la page Compte.
import * as supa from './supa.ts';
import type { Session } from './session.ts';
import { createJob } from './jobs.ts';
import { reconcile } from './process.ts';
import { isOwner, ownerReport } from './admin.ts';
import { catalog } from '../../api/src/catalog.ts';
import { HttpError } from '../../api/src/ctx.ts';

type Json = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SIZES = catalog.sizes.map((s) => s.id);

const TOOLS = [
  { name: 'zodiak_modeles', description: 'Liste les modèles de génération ZODIAK AI (images et vidéos), leur coût en crédits et les formats disponibles.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'zodiak_generer',
    description: "Génère une image ou une vidéo avec ZODIAK AI et débite les crédits du compte. Attend jusqu'à ~90 s : si ce n'est pas fini, renvoie l'identifiant à suivre avec zodiak_statut.",
    inputSchema: {
      type: 'object', required: ['type', 'prompt'],
      properties: {
        type: { type: 'string', enum: ['image', 'video'] },
        prompt: { type: 'string', description: 'Description de la scène (en anglais de préférence pour les modèles vidéo).' },
        modele: { type: 'string', description: 'Identifiant renvoyé par zodiak_modeles (sinon le modèle par défaut).' },
        format: { type: 'string', enum: SIZES, description: 'square, landscape, portrait ou cinema.' },
        image_id: { type: 'string', description: "Vidéo à partir d'une image : identifiant d'une image de la galerie (voir zodiak_creations)." },
        preset: { type: 'string', enum: catalog.presets.map((p) => p.id), description: 'Mouvement de caméra (vidéo).' },
      },
    },
  },
  { name: 'zodiak_statut', description: "État d'une génération et liens de téléchargement du résultat (valables 1 h).", inputSchema: { type: 'object', required: ['job_id'], properties: { job_id: { type: 'string' } } } },
  { name: 'zodiak_creations', description: 'Dernières créations du compte avec leurs liens (valables 1 h).', inputSchema: { type: 'object', properties: { nombre: { type: 'integer', minimum: 1, maximum: 20 } } } },
  { name: 'zodiak_credits', description: 'Solde de crédits du compte ZODIAK AI et dernières opérations.', inputSchema: { type: 'object', properties: {} } },
  { name: 'zodiak_fal', description: 'Propriétaire du site uniquement : solde du compte fal.ai et dépenses du site (24 h, 7 j, 30 j).', inputSchema: { type: 'object', properties: {} } },
];

async function links(s: Session, ids: string[]) {
  if (!ids.length) return [];
  const rows = await supa.select('assets', { id: `in.(${ids.join(',')})`, select: '*' }, s.jwt);
  return Promise.all(rows.map(async (a) => ({ id: a.id, type: a.kind, url: await supa.signedUrl(a.storage_key, s.jwt, 3600) })));
}

async function jobReport(s: Session, row: Json) {
  const ids: string[] = JSON.parse(row.result_asset_ids ?? '[]');
  return { job_id: row.id, statut: row.status, progression: row.progress, message: row.message, erreur: row.error ?? undefined, credits: row.cost, resultats: await links(s, ids) };
}

async function call(s: Session, name: string, a: Json): Promise<unknown> {
  switch (name) {
    case 'zodiak_modeles':
      return {
        modeles: catalog.engines.map((e) => ({ id: e.id, nom: e.name, editeur: e.vendor, types: e.kinds.map((k) => (k === 't2i' ? 'image' : k === 'i2v' ? 'vidéo depuis image' : 'vidéo depuis texte')), credits: e.credits })),
        formats: SIZES, presets: catalog.presets.map((p) => ({ id: p.id, nom: p.label })), note: '1 crédit ≈ 0,01 $',
      };
    case 'zodiak_generer': {
      const video = a.type === 'video';
      const kind = !video ? 't2i' : a.image_id ? 'i2v' : 't2v';
      let row = await createJob(s, {
        kind, prompt: a.prompt, inputAssetId: a.image_id, presetId: video ? a.preset : undefined,
        params: { sizeId: a.format ?? (video ? 'landscape' : 'square'), engine: a.modele, ...(video ? { duration: 5 } : {}) },
      });
      for (let i = 0; i < 22 && ['queued', 'running'].includes(row.status); i++) { await sleep(4000); row = await reconcile(s, row); }
      return jobReport(s, row);
    }
    case 'zodiak_statut': {
      const j = (await supa.select('jobs', { id: `eq.${String(a.job_id)}`, select: '*' }, s.jwt))[0];
      if (!j) throw new HttpError(404, 'not_found', 'Génération introuvable');
      return jobReport(s, await reconcile(s, j));
    }
    case 'zodiak_creations': {
      const n = Math.min(20, Math.max(1, Number(a.nombre) || 10));
      const rows = await supa.select('assets', { select: '*', order: 'created_at.desc', limit: String(n) }, s.jwt);
      return Promise.all(rows.map(async (r) => ({ id: r.id, type: r.kind, prompt: r.prompt, cree_le: r.created_at, url: await supa.signedUrl(r.storage_key, s.jwt, 3600) })));
    }
    case 'zodiak_credits': {
      const p = (await supa.select('profiles', { select: 'credits', limit: '1' }, s.jwt))[0];
      const ledger = await supa.select('credit_ledger', { select: 'delta,reason,created_at', order: 'id.desc', limit: '10' }, s.jwt);
      return { solde: Number(p?.credits ?? 0), dernieres_operations: ledger };
    }
    case 'zodiak_fal':
      if (!isOwner(s)) throw new HttpError(403, 'forbidden', 'Réservé au propriétaire du site');
      return ownerReport();
    default:
      throw new HttpError(404, 'not_found', `Outil inconnu : ${name}`);
  }
}

/** Traite un message JSON-RPC ; renvoie null pour une notification. */
export async function handleRpc(s: Session, msg: Json): Promise<Json | null> {
  if (msg?.id === undefined || msg.id === null) return null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'zodiak-ai', version: '1.0.0' },
        instructions: "ZODIAK AI génère des images et des vidéos (FLUX, Nano Banana, Wan 2.2, Kling). Chaque génération débite des crédits : annonce le coût (zodiak_modeles) avant d'en lancer plusieurs.",
      });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      try {
        const out = await call(s, String(msg.params?.name), msg.params?.arguments ?? {});
        return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        const m = e instanceof HttpError ? `${e.message}${e.reason ? ` (${e.reason})` : ''}` : (e as Error).message;
        return ok({ content: [{ type: 'text', text: `Erreur : ${m}` }], isError: true });
      }
    }
    default:
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Méthode inconnue : ${msg.method}` } };
  }
}
