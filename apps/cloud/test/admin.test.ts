import test from 'node:test';
import assert from 'node:assert/strict';
import { startFakeSupabase, SECRET } from './fake-supabase.ts';

// Compteur de dépenses : regroupement par fournisseur, niveaux d'alerte, solde Kie.ai bas.
test('dépenses du mois par fournisseur, alerte à 80 %, blocage à 100 %', async (t) => {
  const fake = await startFakeSupabase();
  t.after(() => fake.close());
  Object.assign(process.env, { SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: 'anon', ZODIAK_SERVER_SECRET: SECRET, MONTHLY_BUDGET_USD: '2' });
  const { monthly, alerts, monthStart } = await import('../src/admin.ts');
  const now = new Date().toISOString();
  const job = (engine: string | null, cost: number, status = 'done', created_at = now) =>
    fake.tables.jobs!.push({ id: crypto.randomUUID(), params: JSON.stringify(engine ? { engine } : {}), cost, status, cache_hit: false, created_at });
  job('zodiak-ltx', 8); job('zodiak-ltx', 20); job('omni-flash', 56); job('kling-3', 39);
  job('kling-3', 39, 'failed'); // remboursé : exclu
  job(null, 1); // démo : exclu
  job('omni-flash', 56, 'done', new Date(monthStart().getTime() - 1000).toISOString()); // mois précédent
  const m = await monthly();
  assert.deepEqual(m.providers.map((p) => [p.id, Math.round(p.usd * 100), p.jobs]), [['google', 56, 1], ['kie', 39, 1], ['modal', 28, 2]]);
  assert.equal(Math.round(m.usd * 100), 123);
  assert.equal(m.level, 'ok');
  assert.deepEqual(alerts(m, { credits: 500, usd: 2.5 }), []);
  job('seedance-2', 69);
  assert.equal((await monthly()).level, 'alerte'); // 1,92 $ sur 2 $
  job('nano-banana-2', 8);
  const m2 = await monthly();
  assert.equal(m2.level, 'bloque');
  assert.match(alerts(m2, { credits: 10, usd: 0.05 }).join('\n'), /Budget du mois atteint[\s\S]*Solde Kie\.ai bas : 10 crédits/);
  assert.equal(alerts({ ...m, usd: 1.7, level: 'alerte' }, { error: 'x' })[0], 'Budget du mois utilisé à 85 % (1,70 $ sur 2 $).');
});
