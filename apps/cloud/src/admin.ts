// Suivi des dépenses : par fournisseur, budget mensuel avec alerte, soldes lisibles (fal, Kie.ai).
import { cloud } from './env.ts';
import * as supa from './supa.ts';
import type { Session } from './session.ts';
import { catalog } from '../../api/src/catalog.ts';

/** Propriétaire du site : rôle admin, ou e-mail déclaré dans ADMIN_EMAIL. */
export const isOwner = (s: Session) => s.user.role === 'admin' || (!!cloud.adminEmail && s.user.email === cloud.adminEmail);

export async function falBalance(): Promise<{ balance: number; currency: string } | { error: string }> {
  // Le solde n'est lisible qu'avec une clé fal de portée « Admin » (la clé de génération est refusée).
  const key = process.env.FAL_ADMIN_KEY;
  if (!key) return { error: 'ajoutez FAL_ADMIN_KEY (clé fal « Admin ») dans Vercel' };
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

/** Solde Kie.ai (1 crédit Kie = 0,005 $ : 70 crédits pour 5 s de Kling 3.0, mesuré le 26/10). */
export async function kieBalance(): Promise<{ credits: number; usd: number } | { error: string }> {
  const key = process.env.KIE_API_KEY;
  if (!key) return { error: 'KIE_API_KEY absente' };
  try {
    const r = await fetch('https://api.kie.ai/api/v1/chat/credit', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    const j = (await r.json().catch(() => ({}))) as any;
    return j.code === 200 && typeof j.data === 'number' ? { credits: j.data, usd: j.data * 0.005 } : { error: `Kie.ai : ${String(j.msg ?? r.status).slice(0, 160)}` };
  } catch (e) { return { error: (e as Error).message }; }
}

const PROVIDERS: Record<string, string> = { modal: 'Modal (moteur ZODIAK)', google: 'Google Gemini', kie: 'Kie.ai', fal: 'fal.ai', kling: 'Kling', byteplus: 'BytePlus', demo: 'Démo (gratuit)' };
export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Dépense du mois par fournisseur (estimation : crédits facturés, 1 crédit ≈ 0,01 $) et niveau d'alerte. */
export async function monthly() {
  const rows = await supa.spentByEngine(monthStart());
  const by = new Map<string, { id: string; name: string; usd: number; jobs: number }>();
  for (const r of rows) {
    const e = catalog.engines.find((x) => x.id === r.engine);
    const id = !r.engine || !e ? 'demo' : e.provider ?? 'fal';
    const x = by.get(id) ?? { id, name: PROVIDERS[id] ?? id, usd: 0, jobs: 0 };
    x.usd += r.credits / 100; x.jobs += r.jobs; by.set(id, x);
  }
  const providers = [...by.values()].filter((p) => p.id !== 'demo').sort((a, b) => b.usd - a.usd);
  const usd = providers.reduce((n, p) => n + p.usd, 0);
  const ratio = usd / cloud.monthlyBudgetUsd;
  return { usd, budgetUsd: cloud.monthlyBudgetUsd, level: ratio >= 1 ? 'bloque' : ratio >= 0.8 ? 'alerte' : 'ok', providers };
}

/** Messages d'alerte : budget du mois, solde Kie.ai trop bas pour une vidéo. */
export function alerts(m: Awaited<ReturnType<typeof monthly>>, kie: Awaited<ReturnType<typeof kieBalance>>): string[] {
  const out: string[] = [];
  const usd = (n: number) => n.toFixed(2).replace('.', ',');
  const pct = Math.round((m.usd / m.budgetUsd) * 100);
  if (m.level === 'bloque') out.push(`Budget du mois atteint (${pct} %) : les générations sont suspendues jusqu'au 1er du mois, ou augmentez MONTHLY_BUDGET_USD.`);
  else if (m.level === 'alerte') out.push(`Budget du mois utilisé à ${pct} % (${usd(m.usd)} $ sur ${m.budgetUsd} $).`);
  if ('credits' in kie && kie.credits < 140) out.push(`Solde Kie.ai bas : ${kie.credits} crédits (≈ ${usd(kie.usd)} $), moins de deux vidéos Kling. Rechargez sur kie.ai.`);
  return out;
}

export async function ownerReport() {
  const [fal, kie, spent, month] = await Promise.all([falBalance(), kieBalance(), usage(), monthly()]);
  return { month, alerts: alerts(month, kie), balances: { fal, kie }, fal, spent };
}
