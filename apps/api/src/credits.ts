import { config } from './config.ts';
import { one, all, tx, type Db } from './db.ts';
import { HttpError } from './ctx.ts';

/** Débite `cost` crédits (no-op si les crédits sont désactivés). À appeler dans une transaction existante ou seul. */
export function debit(db: Db, userId: string, cost: number, jobId: string): void {
  if (!config.creditsEnabled || cost <= 0) return;
  const u = one(db, 'SELECT credits FROM users WHERE id = ?', userId);
  if (!u || Number(u.credits) < cost) throw new HttpError(402, 'insufficient_credits', 'Crédits insuffisants');
  db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(cost, userId);
  db.prepare("INSERT INTO credit_ledger (user_id, delta, reason, job_id) VALUES (?, ?, 'job', ?)").run(userId, -cost, jobId);
}

export function refund(db: Db, userId: string, cost: number, jobId: string, reason: string): void {
  if (!config.creditsEnabled || cost <= 0) return;
  tx(db, () => {
    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(cost, userId);
    db.prepare('INSERT INTO credit_ledger (user_id, delta, reason, job_id) VALUES (?, ?, ?, ?)').run(userId, cost, reason, jobId);
  });
}

export function adjust(db: Db, userId: string, delta: number, reason: string): number {
  if (!Number.isInteger(delta) || delta === 0) throw new HttpError(422, 'invalid', 'delta invalide');
  return tx(db, () => {
    const u = one(db, 'SELECT credits FROM users WHERE id = ?', userId);
    if (!u) throw new HttpError(404, 'not_found', 'Utilisateur introuvable');
    if (Number(u.credits) + delta < 0) throw new HttpError(422, 'invalid', 'Solde négatif impossible');
    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(delta, userId);
    db.prepare('INSERT INTO credit_ledger (user_id, delta, reason) VALUES (?, ?, ?)').run(userId, delta, String(reason).slice(0, 200) || 'admin');
    return Number(one(db, 'SELECT credits FROM users WHERE id = ?', userId)!.credits);
  });
}

export function ledger(db: Db, userId: string, limit = 50) {
  return all(db, 'SELECT id, delta, reason, job_id, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit)
    .map((r) => ({ id: r.id, delta: r.delta, reason: r.reason, jobId: r.job_id, createdAt: r.created_at }));
}
