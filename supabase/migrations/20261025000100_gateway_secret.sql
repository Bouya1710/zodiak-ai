create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.gateway_secret (id int primary key default 1 check (id = 1), value text not null);
insert into private.gateway_secret (id, value) values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;
create or replace function public.gateway_secret() returns text language sql security definer set search_path = private, pg_temp as $$ select value from private.gateway_secret where id = 1 $$;
revoke all on function public.gateway_secret() from public, anon, authenticated;
grant execute on function public.gateway_secret() to service_role;