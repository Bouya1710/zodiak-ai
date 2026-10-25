import { createClient } from 'npm:@supabase/supabase-js@2';

// Seul le hash SHA-256 du jeton est dans le code ; le jeton lui-même reste dans `.showcase-token` (local, ignoré par Git).
const TOKEN_SHA256 = '990475f84a664f88798c4776b48c60d59b2fb07c672b722ec3549b3a9a20db41';
const TYPES: Record<string, string> = { mp4: 'video/mp4', jpg: 'image/jpeg', json: 'application/json' };

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'PUT') return new Response('method', { status: 405 });
  if ((await sha256(req.headers.get('x-showcase-token') ?? '')) !== TOKEN_SHA256) return new Response('forbidden', { status: 403 });
  const name = new URL(req.url).searchParams.get('name') ?? '';
  if (!/^[a-z0-9]+\.(mp4|jpg|json)$/.test(name)) return new Response('nom invalide', { status: 400 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length > 8 * 1024 * 1024) return new Response('trop gros', { status: 413 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await sb.storage.from('showcase').upload(name, body, { upsert: true, contentType: TYPES[name.split('.')[1]], cacheControl: '31536000' });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true, name, bytes: body.length });
});
