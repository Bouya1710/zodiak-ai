import type http from 'node:http';
import { cloud } from './env.ts';
import * as supa from './supa.ts';
import { parseCookies } from '../../api/src/http.ts';

export const COOKIE = 'zodiak_session';

export interface User { id: string; email: string; role: 'user' | 'admin'; credits: number }
export interface Session { user: User; jwt: string }

const enc = (t: supa.Tokens) => Buffer.from(JSON.stringify({ a: t.access_token, r: t.refresh_token })).toString('base64url');
const dec = (v: string | undefined): { a: string; r: string } | null => {
  if (!v) return null;
  try { const j = JSON.parse(Buffer.from(v, 'base64url').toString('utf8')); return j.a && j.r ? j : null; } catch { return null; }
};

export function cookieFor(t: supa.Tokens | null): string {
  const base = `${COOKIE}=${t ? enc(t) : ''}; Path=/; HttpOnly; SameSite=Lax${cloud.secureCookies ? '; Secure' : ''}`;
  return t ? `${base}; Max-Age=${30 * 86400}` : `${base}; Max-Age=0`;
}

const toUser = (r: Record<string, any>): User => ({ id: r.id, email: r.email, role: r.role, credits: cloud.creditsEnabled ? Number(r.credits) : 0 });

async function profile(jwt: string): Promise<User | null> {
  try {
    const rows = await supa.select('profiles', { select: '*', limit: '1' }, jwt);
    return rows[0] ? toUser(rows[0]) : null;
  } catch (e) {
    if (e instanceof supa.SupaError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

/** Identifie l'utilisateur depuis le cookie ; rafraîchit le jeton si besoin (et pose le nouveau cookie). */
export async function sessionFrom(req: http.IncomingMessage, res: http.ServerResponse): Promise<Session | null> {
  const tok = dec(parseCookies(req.headers.cookie)[COOKIE]);
  if (!tok) return null;
  let user = await profile(tok.a);
  if (user) return { user, jwt: tok.a };
  const fresh = await supa.refreshSession(tok.r);
  if (!fresh) return null;
  user = await profile(fresh.access_token);
  if (!user) return null;
  res.setHeader('set-cookie', cookieFor(fresh));
  return { user, jwt: fresh.access_token };
}

export async function refreshProfile(s: Session): Promise<User> {
  return (await profile(s.jwt)) ?? s.user;
}
