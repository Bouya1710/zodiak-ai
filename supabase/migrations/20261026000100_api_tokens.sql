-- Clés de connecteur (MCP) : une session Supabase dédiée par clé, rafraîchie côté serveur.
-- Le secret n'est jamais stocké (seulement son SHA-256) ; le jeton de rafraîchissement est chiffré (AES-GCM, clé dérivée du secret serveur).
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Claude',
  secret_sha256 text not null,
  refresh_enc text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_tokens_user on public.api_tokens(user_id);
alter table public.api_tokens enable row level security;
create policy api_tokens_select_own on public.api_tokens for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.api_tokens from anon;
grant select (id, user_id, label, created_at, last_used_at) on public.api_tokens to authenticated;

-- app_write : ajoute api_tokens à la liste blanche.
create or replace function public.app_write(p_secret text, p_op text, p_table text, p_row jsonb default '{}'::jsonb, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cols text; res jsonb; k text;
begin
  perform private.check_secret(p_secret);
  if p_table not in ('jobs', 'assets', 'characters', 'audit_log', 'api_tokens') then raise exception 'table_not_allowed' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = k) then
      raise exception 'unknown_column %', k using errcode = 'P0001';
    end if;
    if p_op = 'update' and k in ('id', 'user_id', 'created_at') then raise exception 'immutable_column %', k using errcode = 'P0001'; end if;
  end loop;
  select string_agg(quote_ident(key), ',') into cols from jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) as key;
  if p_op = 'insert' then
    execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning to_jsonb(%1$I.*)', p_table, cols) into res using p_row;
  elsif p_op = 'update' then
    if cols is null then raise exception 'empty_update' using errcode = 'P0001'; end if;
    execute format('update public.%1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where id = $2 returning to_jsonb(%1$I.*)', p_table, cols) into res using p_row, p_id;
  elsif p_op = 'delete' then
    execute format('delete from public.%1$I where id = $1 returning to_jsonb(%1$I.*)', p_table) into res using p_id;
  elsif p_op = 'get' then
    execute format('select to_jsonb(t.*) from public.%1$I t where id = $1', p_table) into res using p_id;
  else
    raise exception 'op_not_allowed' using errcode = 'P0001';
  end if;
  return res;
end $$;
