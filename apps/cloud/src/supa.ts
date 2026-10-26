import { cloud } from './env.ts';
import { HttpError } from '../../api/src/ctx.ts';

type Row = Record<string, any>;

async function readError(res: Response): Promise<{ message: string; code?: string }> {
  const t = await res.text();
  try { const j = JSON.parse(t); return { message: j.message ?? j.error ?? j.msg ?? t, code: j.code }; } catch { return { message: t.slice(0, 300) }; }
}

function headers(jwt?: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: cloud.anonKey, authorization: `Bearer ${jwt ?? cloud.anonKey}`, ...extra };
}

export class SupaError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  const { message } = await readError(res);
  throw new SupaError(res.status, message);
}

// ---------- PostgREST (lecture avec le jeton de l'utilisateur : la RLS limite aux lignes du propriétaire)
export async function select(table: string, params: Record<string, string>, jwt: string): Promise<Row[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await check(await fetch(`${cloud.supabaseUrl}/rest/v1/${table}?${qs}`, { headers: headers(jwt) }));
  return (await res.json()) as Row[];
}

async function rpc<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${cloud.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: headers(undefined, { 'content-type': 'application/json' }),
    body: JSON.stringify({ p_secret: cloud.serverSecret, ...args }),
  });
  if (!res.ok) throw new SupaError(res.status, (await readError(res)).message);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ---------- Écritures : fonctions SQL protégées par le secret serveur
export const write = (op: 'insert' | 'update' | 'delete' | 'get', table: 'jobs' | 'assets' | 'characters' | 'audit_log', row: Row = {}, id?: string): Promise<Row | null> =>
  rpc('app_write', { p_op: op, p_table: table, p_row: row, p_id: id ?? null });

export async function credits(userId: string, delta: number, reason: string, jobId?: string): Promise<number> {
  try { return await rpc<number>('app_credits', { p_user: userId, p_delta: delta, p_reason: reason, p_job: jobId ?? null }); }
  catch (e) {
    if (e instanceof SupaError && /insufficient_credits|invalid_credit/.test(e.message)) throw new HttpError(402, 'insufficient_credits', 'Crédits insuffisants');
    throw e;
  }
}

/** Crédits engagés par tous les utilisateurs depuis `since` (plafond quotidien). */
export const spentSince = (since: Date) => rpc<number>('app_spent_since', { p_since: since.toISOString() });

/** Même total, détaillé par modèle (suivi des dépenses par fournisseur). */
export const spentByEngine = (since: Date) => rpc<{ engine: string; credits: number; jobs: number }[]>('app_spent_by_engine', { p_since: since.toISOString() });

/** Nom affiché du profil (écrit par le serveur, fonction SQL app_profile). */
export const setDisplayName = (userId: string, name: string) => rpc<Row>('app_profile', { p_user: userId, p_name: name });

/** Déconnecte toutes les sessions de l'utilisateur (tous appareils, connecteurs compris). */
export async function logoutAll(jwt: string): Promise<void> {
  await fetch(`${cloud.supabaseUrl}/auth/v1/logout?scope=global`, { method: 'POST', headers: headers(jwt) }).catch(() => {});
}

/** Suppression définitive du compte et de ses fichiers (edge function delete-user). */
export async function deleteUser(userId: string): Promise<void> {
  const res = await fetch(`${cloud.supabaseUrl}/functions/v1/delete-user`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: cloud.serverSecret, user_id: userId }),
  });
  if (!res.ok) throw new SupaError(res.status, `delete-user : ${(await res.text()).slice(0, 200)}`);
}

/** Nouvelle session indépendante pour un utilisateur, sans mot de passe (edge function mint-session). */
export async function mintSession(userId: string): Promise<Tokens> {
  const res = await fetch(`${cloud.supabaseUrl}/functions/v1/mint-session`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: cloud.serverSecret, user_id: userId }),
  });
  if (!res.ok) throw new SupaError(res.status, `mint-session : ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Tokens;
}

// ---------- Auth (Supabase Auth)
export interface Tokens { access_token: string; refresh_token: string }

export async function register(email: string, password: string, role: 'user' | 'admin', initialCredits: number): Promise<string> {
  try { return await rpc<string>('app_register', { p_email: email, p_password: password, p_role: role, p_credits: initialCredits }); }
  catch (e) {
    const m = e instanceof SupaError ? e.message : '';
    if (m.includes('email_exists')) throw new HttpError(422, 'invalid', 'Cette adresse est déjà utilisée');
    if (m.includes('invalid_email')) throw new HttpError(422, 'invalid', 'Adresse e-mail invalide');
    if (m.includes('weak_password')) throw new HttpError(422, 'invalid', 'Mot de passe : 8 caractères minimum');
    throw e;
  }
}

async function tokenCall(grant: string, body: Record<string, string>): Promise<Tokens | null> {
  const res = await fetch(`${cloud.supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: headers(undefined, { 'content-type': 'application/json' }), body: JSON.stringify(body),
  });
  if (res.status === 400 || res.status === 401 || res.status === 422) return null;
  if (!res.ok) throw new SupaError(res.status, (await readError(res)).message);
  return (await res.json()) as Tokens;
}
/** Envoie l'e-mail de réinitialisation (flux PKCE : le lien revient avec ?code=). */
export async function recover(email: string, redirectTo: string, challenge: string): Promise<void> {
  const res = await fetch(`${cloud.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST', headers: headers(undefined, { 'content-type': 'application/json' }),
    body: JSON.stringify({ email, code_challenge: challenge, code_challenge_method: 's256' }),
  });
  if (!res.ok && res.status !== 404) throw new SupaError(res.status, (await readError(res)).message);
}
/** Vérifie le jeton d'un lien e-mail (modèle « {{ .TokenHash }} ») et ouvre la session. */
export async function verifyTokenHash(token_hash: string, type: 'recovery' | 'email'): Promise<Tokens | null> {
  const res = await fetch(`${cloud.supabaseUrl}/auth/v1/verify`, { method: 'POST', headers: headers(undefined, { 'content-type': 'application/json' }), body: JSON.stringify({ type, token_hash }) });
  if (!res.ok) return null;
  const j = (await res.json()) as any;
  return j.access_token && j.refresh_token ? { access_token: j.access_token, refresh_token: j.refresh_token } : null;
}
export const exchangeCode = (auth_code: string, code_verifier: string) => tokenCall('pkce', { auth_code, code_verifier });

/** Change le mot de passe de l'utilisateur connecté. */
export async function setPassword(jwt: string, password: string): Promise<void> {
  await check(await fetch(`${cloud.supabaseUrl}/auth/v1/user`, { method: 'PUT', headers: headers(jwt, { 'content-type': 'application/json' }), body: JSON.stringify({ password }) }));
}
export const passwordLogin = (email: string, password: string) => tokenCall('password', { email, password });
export const refreshSession = (refresh_token: string) => tokenCall('refresh_token', { refresh_token });

export async function ping(): Promise<boolean> {
  try { return (await fetch(`${cloud.supabaseUrl}/rest/v1/`, { headers: headers(), signal: AbortSignal.timeout(4000) })).status < 500; } catch { return false; }
}

// ---------- Storage (jeton utilisateur : dossier <uid>/ du bucket privé « media »)
const obj = (key: string) => `${cloud.supabaseUrl}/storage/v1/object/${cloud.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

export async function upload(key: string, data: Buffer, mime: string, jwt: string): Promise<void> {
  await check(await fetch(obj(key), { method: 'POST', headers: headers(jwt, { 'content-type': mime, 'x-upsert': 'true' }), body: new Uint8Array(data) }));
}

export async function download(key: string, jwt: string): Promise<Buffer> {
  const res = await check(await fetch(obj(key), { headers: headers(jwt) }));
  return Buffer.from(await res.arrayBuffer());
}

export async function signedUrl(key: string, jwt: string, seconds = 3600): Promise<string> {
  const res = await check(await fetch(`${cloud.supabaseUrl}/storage/v1/object/sign/${cloud.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: headers(jwt, { 'content-type': 'application/json' }), body: JSON.stringify({ expiresIn: seconds }),
  }));
  const j = (await res.json()) as { signedURL: string };
  return `${cloud.supabaseUrl}/storage/v1${j.signedURL}`;
}

/** Lien d'envoi signé (2 h) vers le dossier de l'utilisateur : le fichier part directement du poste, sans passer par Vercel. */
export async function signedUploadUrl(key: string, jwt: string): Promise<string> {
  const res = await check(await fetch(`${cloud.supabaseUrl}/storage/v1/object/upload/sign/${cloud.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: headers(jwt, { 'content-type': 'application/json' }), body: JSON.stringify({ expiresIn: 7200 }),
  }));
  const j = (await res.json()) as { url: string };
  return `${cloud.supabaseUrl}/storage/v1${j.url}`;
}

export async function removeObjects(keys: string[], jwt: string): Promise<void> {
  const list = keys.filter(Boolean);
  if (!list.length) return;
  await fetch(`${cloud.supabaseUrl}/storage/v1/object/${cloud.bucket}`, {
    method: 'DELETE', headers: headers(jwt, { 'content-type': 'application/json' }), body: JSON.stringify({ prefixes: list }),
  }).catch(() => {});
}
