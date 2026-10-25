// Suivi des dépenses : solde du compte fal et crédits engagés par le site.
import { cloud } from './env.ts';
import * as supa from './supa.ts';
import type { Session } from './session.ts';

/** Propriétaire du site : rôle admin, ou e-mail déclaré dans ADMIN_EMAIL. */
export const isOwner = (s: Session) => s.user.role === 'admin' || (!!cloud.adminEmail && s.user.email === cloud.adminEmail);

export async function falBalance(): Promise<{ balance: number; currency: string } | { error: string }> {
  const key = process.env.FAL_KEY;
  if (!key) return { error: 'FAL_KEY absente' };
  try {
    const r = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', { headers: { authorization: `Key ${key}` }, signal: AbortSignal.timeout(8000) });
    const j = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) return { error: `fal ${r.status} : ${String(j.detail ?? j.error?.message ?? j.message ?? 'refusé').slice(0, 160)}` };
    const c = j.credits ?? j;
    return typeof c.current_balance === 'number' ? { balance: c.current_balance, currency: c.currency ?? 'USD' } : { error: 'réponse fal inattendue' };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Crédits engagés par tout le site (1 crédit ≈ 0,01 $ chez fal). */
export async function usage() {
  const ago = (h: number) => supa.spentSince(new Date(Date.now() - h * 3600_000));
  const [day, week, month] = await Promise.all([ago(24), ago(24 * 7), ago(24 * 30)]);
  const usd = (c: number) => Math.round(c) / 100;
  return { day, week, month, usd: { day: usd(day), week: usd(week), month: usd(month) }, dailyBudget: cloud.dailyBudget };
}

export async function ownerReport() {
  const [fal, spent] = await Promise.all([falBalance(), usage()]);
  return { fal, spent };
}
