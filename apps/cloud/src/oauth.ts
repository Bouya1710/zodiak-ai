// OAuth 2.1 pour le connecteur MCP (spécification MCP « Authorization ») : découverte, inscription
// dynamique des clients, autorisation avec consentement, échange du code (PKCE S256).
// Sans état : client_id et code sont scellés (HMAC / AES-GCM) avec le secret serveur.
import crypto from 'node:crypto';
import type http from 'node:http';
import { cloud } from './env.ts';
import type { Session } from './session.ts';
import { createToken } from './tokens.ts';
import { HttpError } from '../../api/src/ctx.ts';

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const hmac = (s: string) => crypto.createHmac('sha256', cloud.serverSecret).update(`oauth:${s}`).digest('base64url').slice(0, 32);
const aesKey = () => crypto.createHash('sha256').update(`${cloud.serverSecret}:oauth-code`).digest();

// L'adresse appelée par le client (le lien fixe), pas l'URL de production par défaut de Vercel.
export const origin = (raw: http.IncomingMessage) => (raw.headers.host ? `https://${raw.headers.host}` : cloud.publicUrl);

export const protectedResource = (raw: http.IncomingMessage) => ({
  resource: `${origin(raw)}/api/mcp`, authorization_servers: [origin(raw)], bearer_methods_supported: ['header'], resource_name: 'ZODIAK AI',
});

export const authServer = (raw: http.IncomingMessage) => {
  const o = origin(raw);
  return {
    issuer: o, authorization_endpoint: `${o}/oauth/authorize`, token_endpoint: `${o}/api/oauth/token`, registration_endpoint: `${o}/api/oauth/register`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code'], code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['zodiak'],
  };
};

const okRedirect = (u: unknown) => {
  try { const x = new URL(String(u)); return x.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(x.hostname); } catch { return false; }
};

/** Inscription dynamique (RFC 7591) : le client_id contient son nom et ses URL de retour, signés. */
export function register(body: Record<string, any>) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || !uris.every(okRedirect)) throw new HttpError(400, 'invalid', 'redirect_uris invalides');
  const name = String(body.client_name ?? 'Client MCP').slice(0, 60);
  const data = b64(JSON.stringify({ n: name, r: uris }));
  return {
    client_id: `${data}.${hmac(data)}`, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'], response_types: ['code'], client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

export function client(id: string): { n: string; r: string[] } {
  const [data, sig] = String(id).split('.');
  if (!data || !sig || hmac(data) !== sig) throw new HttpError(400, 'invalid', 'client_id inconnu');
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
}

/** Paramètres d'autorisation validés (utilisés pour afficher puis traiter le consentement). */
export function authRequest(q: URLSearchParams) {
  const c = client(q.get('client_id') ?? '');
  const redirect = q.get('redirect_uri') ?? c.r[0]!;
  if (!c.r.includes(redirect)) throw new HttpError(400, 'invalid', 'redirect_uri non déclarée');
  if (q.get('response_type') !== 'code') throw new HttpError(400, 'invalid', 'response_type=code attendu');
  const challenge = q.get('code_challenge') ?? '';
  if (q.get('code_challenge_method') !== 'S256' || challenge.length < 43) throw new HttpError(400, 'invalid', 'PKCE S256 requis');
  return { clientId: q.get('client_id')!, name: c.n, redirect, challenge, state: q.get('state') ?? '' };
}

/** Consentement accordé : clé de connecteur (session dédiée) puis code à usage court. */
export async function approve(s: Session, a: ReturnType<typeof authRequest>): Promise<string> {
  const t = await createToken(s.user, a.name);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aesKey(), iv);
  const plain = JSON.stringify({ t: t.token, cc: a.challenge, ru: a.redirect, ci: a.clientId, exp: Date.now() + 5 * 60_000 });
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const code = b64(Buffer.concat([iv, c.getAuthTag(), body]));
  const u = new URL(a.redirect);
  u.searchParams.set('code', code);
  if (a.state) u.searchParams.set('state', a.state);
  return u.toString();
}

export function denyUrl(a: ReturnType<typeof authRequest>): string {
  const u = new URL(a.redirect);
  u.searchParams.set('error', 'access_denied');
  if (a.state) u.searchParams.set('state', a.state);
  return u.toString();
}

/** Échange du code contre le jeton d'accès (la clé du connecteur). */
export function token(f: URLSearchParams) {
  const fail = (e: string, d: string) => { throw Object.assign(new HttpError(400, 'invalid', d), { oauth: e }); };
  if (f.get('grant_type') !== 'authorization_code') fail('unsupported_grant_type', 'grant_type non pris en charge');
  let p: any;
  try {
    const b = Buffer.from(f.get('code') ?? '', 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', aesKey(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    p = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch { fail('invalid_grant', 'code invalide'); }
  if (p.exp < Date.now()) fail('invalid_grant', 'code expiré');
  if (f.get('client_id') && f.get('client_id') !== p.ci) fail('invalid_grant', 'client différent');
  if (f.get('redirect_uri') && f.get('redirect_uri') !== p.ru) fail('invalid_grant', 'redirect_uri différente');
  const v = crypto.createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url');
  if (v !== p.cc) fail('invalid_grant', 'code_verifier incorrect');
  return { access_token: p.t, token_type: 'Bearer', scope: 'zodiak' };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Page de consentement (HTML autonome, styles en ligne autorisés par la CSP). */
export function consentPage(a: ReturnType<typeof authRequest>, email: string, query: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autoriser ${esc(a.name)} - ZODIAK AI</title><link rel="icon" href="/favicon.svg"><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#f5f5f5;font:15px/1.5 Inter,system-ui,-apple-system,sans-serif;padding:16px}
.c{width:min(440px,100%);background:#111;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:28px}
.b{display:flex;gap:10px;align-items:center;font-weight:900;letter-spacing:.08em;margin-bottom:22px}
h1{font-size:1.3rem;margin:0 0 6px}p{color:#9b9b9b;margin:0 0 14px}ul{margin:0 0 20px;padding-left:18px;color:#d0d0d0}
.r{display:flex;gap:10px}button{flex:1;font:inherit;font-weight:700;border-radius:10px;padding:12px;cursor:pointer;border:1px solid rgba(255,255,255,.14)}
.ok{background:#36d9e8;color:#051416;border-color:#36d9e8}.no{background:transparent;color:#f5f5f5}small{display:block;margin-top:14px;color:#777}
</style></head><body><form class="c" method="post" action="/oauth/authorize?${esc(query)}">
<div class="b"><img src="/favicon.svg" width="28" height="28" alt="">ZODIAK AI</div>
<h1>Autoriser ${esc(a.name)} ?</h1><p>Connecté en tant que <b>${esc(email)}</b>. ${esc(a.name)} pourra :</p>
<ul><li>générer des images et des vidéos (débite vos crédits)</li><li>voir vos créations et suivre leur avancement</li><li>consulter votre solde de crédits</li></ul>
<div class="r"><button class="no" name="decision" value="deny">Refuser</button><button class="ok" name="decision" value="allow">Autoriser</button></div>
<small>Vous pourrez retirer cet accès à tout moment dans Paramètres → Connecteurs.</small></form></body></html>`;
}

/** Corps application/x-www-form-urlencoded (ou JSON) d'une requête. */
export async function formBody(raw: http.IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of raw) { size += (c as Buffer).length; if (size > 100_000) throw new HttpError(413, 'invalid', 'Corps trop volumineux'); chunks.push(c as Buffer); }
  const text = Buffer.concat(chunks).toString('utf8');
  if (/json/i.test(String(raw.headers['content-type']))) {
    try { return new URLSearchParams(Object.entries(JSON.parse(text)).map(([k, v]) => [k, String(v)])); } catch { return new URLSearchParams(); }
  }
  return new URLSearchParams(text);
}
