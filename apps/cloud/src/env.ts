// Configuration de la couche en ligne (Vercel + Supabase). Tout vient des variables d'environnement.
const e = process.env;
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));
const int = (v: string | undefined, d: number) => (Number.isFinite(Number.parseInt(v ?? '', 10)) ? Number.parseInt(v!, 10) : d);

export const cloud = {
  supabaseUrl: (e.SUPABASE_URL ?? '').replace(/\/$/, ''),
  anonKey: e.SUPABASE_ANON_KEY ?? '',
  /** Secret de l'application serveur : autorise les fonctions SQL « app_* » (voir DECISIONS D-031). */
  serverSecret: e.ZODIAK_SERVER_SECRET ?? '',
  bucket: 'media',
  creditsEnabled: bool(e.CREDITS_ENABLED, true),
  creditsSignup: int(e.CREDITS_SIGNUP, 100),
  registrationOpen: bool(e.REGISTRATION_OPEN, true),
  adminEmail: (e.ADMIN_EMAIL ?? '').toLowerCase(),
  maxUploadMb: Math.min(4, int(e.MAX_UPLOAD_MB, 4)), // limite de corps des fonctions Vercel : 4,5 Mo
  secureCookies: bool(e.SECURE_COOKIES, true),
  publicUrl: (e.PUBLIC_URL ?? (e.VERCEL_PROJECT_PRODUCTION_URL ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, ''),
  jobTimeoutMs: 8 * 60_000,
  /** Plafond de crédits engagés sur 24 h pour tout le site (1 crédit ≈ 0,01 $ chez fal). */
  dailyBudget: int(e.DAILY_BUDGET_CREDITS, 500),
  /** Budget mensuel du site en dollars, tous fournisseurs : alerte à 80 %, générations refusées à 100 %. */
  monthlyBudgetUsd: int(e.MONTHLY_BUDGET_USD, 40),
};

export function assertCloudEnv(): void {
  const missing = (['supabaseUrl', 'anonKey', 'serverSecret'] as const).filter((k) => !cloud[k]);
  if (missing.length) throw new Error(`Variables manquantes : ${missing.join(', ')}`);
}
