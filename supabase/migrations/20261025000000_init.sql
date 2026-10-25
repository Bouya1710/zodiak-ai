-- ZODIAK AI : schéma initial (Postgres / Supabase).
-- Les accès applicatifs passent par le serveur (clé « service »), les politiques RLS protègent
-- en plus toute lecture directe avec un jeton utilisateur.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'user' check (role in ('user','admin')),
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now()
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  reference_asset_id uuid,
  lora_name text,
  seed integer,
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio')),
  mime text not null,
  storage_key text not null,
  thumb_key text,
  width integer, height integer, duration double precision,
  title text, prompt text,
  job_id uuid,
  favorite boolean not null default false,
  origin text not null default 'generated' check (origin in ('generated','upload')),
  fingerprint text,
  sha256 text,
  created_at timestamptz not null default now()
);
create index assets_user_created on public.assets(user_id, created_at desc);
create index assets_fingerprint on public.assets(user_id, fingerprint);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  status text not null check (status in ('queued','running','done','failed','canceled','blocked')),
  progress integer not null default 0,
  message text,
  prompt text, negative_prompt text,
  params text not null default '{}',
  preset_id text, template_id text,
  character_id uuid,
  input_asset_id uuid, audio_asset_id uuid,
  result_asset_ids text not null default '[]',
  error text,
  backend text not null,
  cost integer not null default 0,
  cache_hit boolean not null default false,
  fingerprint text,
  cancel_requested boolean not null default false,
  provider text, provider_ref text, provider_urls text,
  created_at timestamptz not null default now(),
  started_at timestamptz, finished_at timestamptz
);
create index jobs_user_created on public.jobs(user_id, created_at desc);
create index jobs_status on public.jobs(status, created_at);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  reason text not null,
  job_id uuid,
  created_at timestamptz not null default now()
);
create index credit_ledger_user on public.credit_ledger(user_id, id desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  event text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- RLS : chaque utilisateur ne voit que ses lignes ; aucune écriture directe (tout passe par le serveur).
alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.assets enable row level security;
alter table public.jobs enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy characters_select_own on public.characters for select to authenticated using (user_id = (select auth.uid()));
create policy assets_select_own on public.assets for select to authenticated using (user_id = (select auth.uid()));
create policy jobs_select_own on public.jobs for select to authenticated using (user_id = (select auth.uid()));
create policy ledger_select_own on public.credit_ledger for select to authenticated using (user_id = (select auth.uid()));
-- audit_log : aucune politique → illisible côté client (service uniquement).

-- Crédits : opérations atomiques, réservées au serveur.
create or replace function public.debit_credits(p_user uuid, p_cost integer, p_job uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare v integer;
begin
  update profiles set credits = credits - p_cost where id = p_user and credits >= p_cost returning credits into v;
  if v is null then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;
  insert into credit_ledger(user_id, delta, reason, job_id) values (p_user, -p_cost, 'job', p_job);
  return v;
end $$;

create or replace function public.adjust_credits(p_user uuid, p_delta integer, p_reason text, p_job uuid default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare v integer;
begin
  update profiles set credits = credits + p_delta where id = p_user and credits + p_delta >= 0 returning credits into v;
  if v is null then raise exception 'invalid_credit_adjustment' using errcode = 'P0001'; end if;
  insert into credit_ledger(user_id, delta, reason, job_id) values (p_user, p_delta, left(p_reason, 200), p_job);
  return v;
end $$;

revoke all on function public.debit_credits(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.adjust_credits(uuid, integer, text, uuid) from public, anon, authenticated;

-- Stockage privé pour les images, vidéos et fichiers audio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 52428800,
  array['image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/wav','audio/mpeg','audio/mp4','audio/ogg'])
on conflict (id) do nothing;
-- Aucune politique sur storage.objects : seul le serveur (service) lit/écrit, l'accès client passe par des URL signées.
