// Clés de connecteur (MCP) : « zk_<id>.<secret> ». Chaque clé porte sa propre session Supabase,
// ouverte sans mot de passe à la création (edge function mint-session) puis rafraîchie ici ; seul le SHA-256 du secret est stocké.
import crypto from 'node:crypto';
import { cloud } from './env.ts';
import * as supa from './supa.ts';
import type { Session, User } from './session.ts';
import { HttpError } from '../../api/src/ctx.ts';

const key = () => crypto.createHash('sha256').update(`${cloud.serverSecret}:api-tokens`).digest();
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function seal(text: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
function open(sealed: string): string {
  const b = Buffer.from(sealed, 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

/** Crée une clé : nouvelle session dédiée (sans mot de passe), renvoyée une seule fois. */
export async function createToken(user: User, label: string): Promise<{ id: string; token: string }> {
  const t = await supa.mintSession(user.id);
  const secret = crypto.randomBytes(24).toString('base64url');
  const row = await supa.write('insert', 'api_tokens', { user_id: user.id, label: label.slice(0, 60) || 'Claude', secret_sha256: sha(secret), refresh_enc: seal(t.refresh_token) });
  return { id: row!.id, token: `zk_${row!.id}.${secret}` };
}

// Une session par clé et par instance, réutilisée tant que le jeton d'accès est valide (1 h chez Supabase).
const cache = new Map<string, { s: Session; until: number }>();

export async function sessionFromToken(token: string): Promise<Session> {
  const m = /^zk_([0-9a-f-]{36})\.([\w-]{20,})$/.exec(token.trim());
  if (!m) throw new HttpError(401, 'unauthorized', 'Clé de connecteur invalide');
  const [, id, secret] = m as unknown as [string, string, string];
  const hit = cache.get(id);
  // Le secret est revérifié à chaque appel : une clé supprimée cesse de marcher immédiatement.
  const row = await supa.write('get', 'api_tokens', {}, id);
  if (!row || !crypto.timingSafeEqual(Buffer.from(row.secret_sha256), Buffer.from(sha(secret)))) throw new HttpError(401, 'unauthorized', 'Clé de connecteur invalide ou révoquée');
  if (hit && hit.until > Date.now()) return hit.s;
  const fresh = await supa.refreshSession(open(row.refresh_enc));
  if (!fresh) throw new HttpError(401, 'unauthorized', 'Session du connecteur expirée : recréez une clé');
  await supa.write('update', 'api_tokens', { refresh_enc: seal(fresh.refresh_token), last_used_at: new Date().toISOString() }, id);
  const p = (await supa.select('profiles', { select: '*', limit: '1' }, fresh.access_token))[0];
  if (!p) throw new HttpError(401, 'unauthorized', 'Compte introuvable');
  const s: Session = { jwt: fresh.access_token, user: { id: p.id, email: p.email, role: p.role, credits: cloud.creditsEnabled ? Number(p.credits) : 0 } };
  cache.set(id, { s, until: Date.now() + 45 * 60_000 });
  return s;
}
