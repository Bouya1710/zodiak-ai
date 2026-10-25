import { createClient } from 'npm:@supabase/supabase-js@2';

// Ouvre une session Supabase indépendante pour un utilisateur, sans mot de passe (connecteur Claude).
// Appelée uniquement par le serveur ZODIAK : le secret serveur est vérifié par la fonction SQL app_ping.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const anon = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const { secret, user_id } = await req.json().catch(() => ({}));
  if (typeof secret !== 'string' || typeof user_id !== 'string') return new Response('invalide', { status: 400 });
  const ok = await admin.rpc('app_ping', { p_secret: secret });
  if (ok.error || ok.data !== true) return new Response('forbidden', { status: 403 });
  const u = await admin.auth.admin.getUserById(user_id);
  if (u.error || !u.data.user?.email) return new Response('utilisateur introuvable', { status: 404 });
  // Lien magique généré (jamais envoyé) puis échangé aussitôt contre une session.
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.data.user.email });
  if (link.error) return new Response(link.error.message, { status: 500 });
  const v = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'email' });
  if (v.error || !v.data.session) return new Response(v.error?.message ?? 'session impossible', { status: 500 });
  return Response.json({ access_token: v.data.session.access_token, refresh_token: v.data.session.refresh_token });
});
