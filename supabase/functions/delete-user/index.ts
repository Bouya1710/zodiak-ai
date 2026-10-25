import { createClient } from 'npm:@supabase/supabase-js@2';

// Suppression définitive d'un compte (droit à l'effacement). Appelée uniquement par le serveur ZODIAK :
// le secret serveur est vérifié par app_ping ; les fichiers du bucket « media » sont supprimés avant le compte.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const { secret, user_id } = await req.json().catch(() => ({}));
  if (typeof secret !== 'string' || typeof user_id !== 'string') return new Response('invalide', { status: 400 });
  const ok = await admin.rpc('app_ping', { p_secret: secret });
  if (ok.error || ok.data !== true) return new Response('forbidden', { status: 403 });
  for (;;) {
    const { data } = await admin.storage.from('media').list(user_id, { limit: 1000 });
    if (!data?.length) break;
    const r = await admin.storage.from('media').remove(data.map((f) => `${user_id}/${f.name}`));
    if (r.error) return new Response(r.error.message, { status: 500 });
  }
  const d = await admin.auth.admin.deleteUser(user_id); // profil, jobs, médias, crédits : suppression en cascade
  if (d.error) return new Response(d.error.message, { status: 500 });
  return Response.json({ ok: true });
});
