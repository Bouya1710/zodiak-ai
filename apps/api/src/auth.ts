import crypto from 'node:crypto';
import { config } from './config.ts';
import { one, run, tx, type Db, type Row } from './db.ts';
import { HttpError, nowIso } from './ctx.ts';

export const LOCAL_USER_ID = 'local';
export const COOKIE = 'zodiak_session';

export interface User { id: string; email: string; role: 'user' | 'admin'; credits: number }

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const got = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(got, expected);
}

const toUser = (r: Row): User => ({ id: r.id, email: r.email, role: r.role, credits: config.creditsEnabled ? Number(r.credits) : 0 });

/** Utilisateur implicite du mode personnel (créé au besoin). */
export function ensureLocalUser(db: Db): User {
  let r = one(db, 'SELECT * FROM users WHERE id = ?', LOCAL_USER_ID);
  if (!r) {
    db.prepare("INSERT INTO users (id, email, role, credits) VALUES (?, 'local@zodiak.local', 'admin', 0)").run(LOCAL_USER_ID);
    r = one(db, 'SELECT * FROM users WHERE id = ?', LOCAL_USER_ID)!;
  }
  return toUser(r);
}

/** Crée le compte admin décrit par ADMIN_EMAIL / ADMIN_PASSWORD (mode multi). */
export function ensureAdmin(db: Db): void {
  if (config.mode !== 'multi' || !config.adminEmail || !config.adminPassword) return;
  const ex = one(db, 'SELECT id FROM users WHERE email = ?', config.adminEmail.toLowerCase());
  if (ex) return;
  db.prepare("INSERT INTO users (id, email, password_hash, role, credits) VALUES (?, ?, ?, 'admin', ?)")
    .run(crypto.randomUUID(), config.adminEmail.toLowerCase(), hashPassword(config.adminPassword), config.creditsSignup);
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function register(db: Db, email: unknown, password: unknown): User {
  if (config.mode !== 'multi') throw new HttpError(403, 'forbidden', 'Inscription indisponible en mode personnel');
  if (!config.registrationOpen) throw new HttpError(403, 'forbidden', 'Les inscriptions sont fermées');
  if (typeof email !== 'string' || !EMAIL.test(email)) throw new HttpError(422, 'invalid', 'Adresse e-mail invalide');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new HttpError(422, 'invalid', 'Mot de passe : 8 caractères minimum');
  const mail = email.toLowerCase();
  const id = crypto.randomUUID();
  return tx(db, () => {
    if (one(db, 'SELECT 1 AS x FROM users WHERE email = ?', mail)) throw new HttpError(422, 'invalid', 'Cette adresse est déjà utilisée');
    const initial = config.creditsEnabled ? config.creditsSignup : 0;
    db.prepare("INSERT INTO users (id, email, password_hash, role, credits) VALUES (?, ?, ?, 'user', ?)").run(id, mail, hashPassword(password), initial);
    if (initial) db.prepare("INSERT INTO credit_ledger (user_id, delta, reason) VALUES (?, ?, 'signup')").run(id, initial);
    return toUser(one(db, 'SELECT * FROM users WHERE id = ?', id)!);
  });
}

export function login(db: Db, email: unknown, password: unknown): { user: User; session: string; expires: Date } {
  const r = typeof email === 'string' ? one(db, 'SELECT * FROM users WHERE email = ?', email.toLowerCase()) : undefined;
  // Vérification même si l'utilisateur n'existe pas (temps constant approximatif).
  const ok = verifyPassword(typeof password === 'string' ? password : '', r?.password_hash ?? hashPassword('x'));
  if (!r || !ok || r.id === LOCAL_USER_ID) throw new HttpError(401, 'unauthorized', 'Identifiants invalides');
  const session = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(session), r.id, expires.toISOString());
  return { user: toUser(r), session, expires };
}

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export function logout(db: Db, token: string | undefined): void {
  if (token) run(db, 'DELETE FROM sessions WHERE id = ?', hashToken(token));
}

export function userFromSession(db: Db, token: string | undefined): User | null {
  if (!token) return null;
  const s = one(db, 'SELECT user_id, expires_at FROM sessions WHERE id = ?', hashToken(token));
  if (!s) return null;
  if (s.expires_at < nowIso()) { run(db, 'DELETE FROM sessions WHERE id = ?', hashToken(token)); return null; }
  const r = one(db, 'SELECT * FROM users WHERE id = ?', s.user_id);
  return r ? toUser(r) : null;
}

export function getUser(db: Db, token: string | undefined): User | null {
  if (config.mode === 'personal') return ensureLocalUser(db);
  return userFromSession(db, token);
}

export function refreshUser(db: Db, id: string): User {
  return toUser(one(db, 'SELECT * FROM users WHERE id = ?', id)!);
}
