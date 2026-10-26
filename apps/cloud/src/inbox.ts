// Envoi d'images depuis un poste (connecteur MCP, Claude Code) : lien signé, puis import dans la galerie.
// Identifiant d'envoi : « envoi_<uuid>_<ext> » ; le fichier attend dans <uid>/inbox/ jusqu'à son utilisation.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as supa from './supa.ts';
import type { Session } from './session.ts';
import { ingest } from './process.ts';
import { sniff } from '../../api/src/serialize.ts';
import { HttpError } from '../../api/src/ctx.ts';

const EXTS: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const inboxKey = (s: Session, id: string, ext: string) => `${s.user.id}/inbox/${id}.${ext}`;

export async function prepareUpload(s: Session, fileName: string): Promise<{ envoi_id: string; upload_url: string; content_type: string }> {
  const ext = (path.extname(String(fileName)).slice(1) || 'png').toLowerCase();
  if (!EXTS[ext]) throw new HttpError(422, 'invalid', 'Formats acceptés : PNG, JPEG, WebP');
  const id = crypto.randomUUID();
  const norm = ext === 'jpeg' ? 'jpg' : ext;
  return { envoi_id: `envoi_${id}_${norm}`, upload_url: await supa.signedUploadUrl(inboxKey(s, id, norm), s.jwt), content_type: EXTS[norm]! };
}

/** Image de galerie à partir d'un identifiant : média existant (uuid) ou envoi à importer (envoi_…). */
export async function resolveImage(s: Session, ref: unknown, consent: boolean): Promise<string | undefined> {
  if (ref === undefined || ref === null || ref === '') return undefined;
  const v = String(ref);
  const m = /^envoi_([0-9a-f-]{36})_(png|jpg|webp)$/.exec(v);
  if (!m) return v; // identifiant de galerie : vérifié ensuite par la planification
  if (!consent) throw new HttpError(422, 'consent_required', "Confirmez avoir le droit d'utiliser cette image (droits_image: true)");
  const key = inboxKey(s, m[1]!, m[2]!);
  let buf: Buffer;
  try { buf = await supa.download(key, s.jwt); } catch { throw new HttpError(404, 'not_found', `Envoi introuvable : le fichier n'a pas été envoyé sur le lien (${v})`); }
  const sn = sniff(buf);
  if (!sn || sn.kind !== 'image') throw new HttpError(422, 'invalid', "Le fichier envoyé n'est pas une image lisible");
  const tmp = path.join(os.tmpdir(), `zodiak-inbox-${m[1]}.${m[2]}`);
  fs.writeFileSync(tmp, buf);
  try {
    const row = await ingest(s, { file: tmp, mime: sn.mime, kind: 'image', title: `Envoi ${new Date().toLocaleDateString('fr-FR')}`, origin: 'upload' });
    await supa.removeObjects([key], s.jwt);
    return row.id as string;
  } finally { fs.rmSync(tmp, { force: true }); }
}
