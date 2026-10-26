// Connecteur MCP (Streamable HTTP, réponses JSON) : ZODIAK AI utilisable depuis Claude comme un outil.
// URL : /api/mcp/<clé> (ou /api/mcp avec « Authorization: Bearer <clé> »). La clé se crée sur la page Compte.
import * as supa from './supa.ts';
import type { Session } from './session.ts';
import { createJob } from './jobs.ts';
import { reconcile } from './process.ts';
import { isOwner, ownerReport } from './admin.ts';
import { prepareUpload, resolveImage } from './inbox.ts';
import { catalog } from '../../api/src/catalog.ts';
import { HttpError } from '../../api/src/ctx.ts';

type Json = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SIZES = catalog.sizes.map((s) => s.id);

const TOOLS = [
  { name: 'zodiak_modeles', description: 'Liste les modèles de génération ZODIAK AI (images et vidéos), leur coût en crédits et les formats disponibles.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'zodiak_preparer_envoi',
    description: "Prépare l'envoi d'une image depuis le poste de l'utilisateur (image de début ou de fin). Renvoie un envoi_id et une commande curl à exécuter avec le chemin du fichier (lien privé, valable 2 h). Ensuite, passer l'envoi_id à zodiak_generer (image_debut ou image_fin).",
    inputSchema: { type: 'object', required: ['fichier'], properties: { fichier: { type: 'string', description: 'Nom ou chemin du fichier (PNG, JPEG ou WebP), ex. ~/images/debut.png.' } } },
  },
  {
    name: 'zodiak_generer',
    description: "Génère une image ou une vidéo avec ZODIAK AI et débite les crédits (annoncer le coût d'abord, voir zodiak_modeles). Vidéo : image_debut (et image_fin pour verrouiller la dernière image) acceptent un identifiant de galerie ou un envoi_id ; sans image_debut, la vidéo part du texte. brouillon=true : 480p, moins cher, pour valider avant le rendu final. Attend jusqu'à ~90 s, sinon renvoie l'identifiant à suivre avec zodiak_statut.",
    inputSchema: {
      type: 'object', required: ['type', 'prompt'],
      properties: {
        type: { type: 'string', enum: ['image', 'video'] },
        prompt: { type: 'string', description: 'Description de la scène et du mouvement (anglais conseillé pour la vidéo).' },
        modele: { type: 'string', description: 'Identifiant renvoyé par zodiak_modeles (sinon le modèle par défaut, gratuit).' },
        image_debut: { type: 'string', description: 'Vidéo : image de départ (identifiant de galerie ou envoi_id).' },
        image_fin: { type: 'string', description: 'Vidéo : image de fin (identifiant de galerie ou envoi_id) ; modèles « debut_fin » uniquement.' },
        droits_image: { type: 'boolean', description: "Obligatoire si une image est envoyée : l'utilisateur confirme avoir le droit de l'utiliser (visages réels : accord de la personne)." },
        brouillon: { type: 'boolean', description: 'Vidéo : brouillon 480p, moins cher.' },
        format: { type: 'string', enum: SIZES, description: 'square, landscape, portrait ou cinema.' },
        preset: { type: 'string', enum: catalog.presets.map((p) => p.id), description: 'Mouvement de caméra (vidéo).' },
        image_id: { type: 'string', description: 'Ancien nom de image_debut (compatibilité).' },
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
        modeles: catalog.engines.map((e) => ({
          id: e.id, nom: e.name, editeur: e.vendor, gratuit_pour_le_site: e.provider === 'modal',
          types: e.kinds.map((k) => (k === 't2i' ? 'image' : k === 'i2v' ? 'vidéo depuis image' : 'vidéo depuis texte')),
          credits: e.credits, credits_brouillon: e.draftCredits ?? null, debut_fin: e.provider === 'modal',
        })),
        formats: SIZES, presets: catalog.presets.map((p) => ({ id: p.id, nom: p.label })),
        note: "1 crédit ≈ 0,01 $. Méthode conseillée : brouillons sur un modèle gratuit (debut_fin), puis rendu final payant seulement si le brouillon convient.",
      };
    case 'zodiak_preparer_envoi': {
      const u = await prepareUpload(s, String(a.fichier ?? 'image.png'));
      const chemin = String(a.fichier ?? 'image.png').replace(/"/g, '');
      return { envoi_id: u.envoi_id, commande: `curl -sS -X PUT -H "Content-Type: ${u.content_type}" --data-binary @"${chemin}" "${u.upload_url}"`, valable: '2 h', suite: "Après l'envoi, utiliser envoi_id comme image_debut ou image_fin dans zodiak_generer." };
    }
    case 'zodiak_generer': {
      const video = a.type === 'video';
      const consent = a.droits_image === true;
      const start = video ? await resolveImage(s, a.image_debut ?? a.image_id, consent) : undefined;
      const end = video ? await resolveImage(s, a.image_fin, consent) : undefined;
      if (end && !start) throw new HttpError(422, 'invalid', 'Une image de fin demande aussi une image de début');
      const kind = !video ? 't2i' : start ? 'i2v' : 't2v';
      let row = await createJob(s, {
        kind, prompt: a.prompt, inputAssetId: start, endAssetId: end, consent, presetId: video ? a.preset : undefined,
        params: { sizeId: a.format ?? (video ? 'landscape' : 'square'), engine: a.modele, ...(video ? { duration: 5, draft: a.brouillon === true } : {}) },
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
        instructions: "ZODIAK AI génère des images et des vidéos. Modèles gratuits pour le site : ZODIAK LTX-2.5 (par défaut) et ZODIAK Wan 2.2, avec image de début et de fin. Pour une image du poste : zodiak_preparer_envoi, exécuter la commande curl, puis zodiak_generer avec l'envoi_id. Annonce toujours le coût (zodiak_modeles) avant de lancer, et propose un brouillon avant un rendu payant.",
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
