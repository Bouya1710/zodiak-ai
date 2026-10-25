-- Passerelle d'autorisation côté serveur : de petites fonctions SECURITY DEFINER, protégées par un secret
-- que seul le serveur de l'application connaît (stocké dans private.gateway_secret). Aucune clé service n'est exposée.
drop function if exists public.debit_credits(uuid, integer, uuid);
drop function if exists public.adjust_credits(uuid, integer, text, uuid);
drop function if exists public.gateway_secret();

create or replace function private.check_secret(p_secret text) returns void
language plpgsql security definer set search_path = private, pg_temp as $$
begin
  if p_secret is null or p_secret is distinct from (select value from private.gateway_secret where id = 1) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;
revoke all on function private.check_secret(text) from public, anon, authenticated;

-- Inscription : crée un compte Supabase Auth (e-mail considéré comme confirmé) + profil + crédits de bienvenue.
create or replace function public.app_register(p_secret text, p_email text, p_password text, p_role text, p_credits integer)
returns uuid language plpgsql security definer set search_path = public, auth, extensions, pg_temp as $$
declare uid uuid := gen_random_uuid(); mail text := lower(trim(p_email));
begin
  perform private.check_secret(p_secret);
  if mail !~ '^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$' then raise exception 'invalid_email' using errcode = 'P0001'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'weak_password' using errcode = 'P0001'; end if;
  if p_role not in ('user', 'admin') then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  if exists (select 1 from auth.users where lower(email) = mail) then raise exception 'email_exists' using errcode = 'P0001'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true), 'email', now(), now(), now());
  insert into public.profiles (id, email, role, credits) values (uid, mail, p_role, greatest(p_credits, 0));
  if p_credits > 0 then insert into public.credit_ledger (user_id, delta, reason) values (uid, p_credits, 'signup'); end if;
  return uid;
end $$;

-- Crédits : débit / ajustement atomiques.
create or replace function public.app_credits(p_secret text, p_user uuid, p_delta integer, p_reason text, p_job uuid default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v integer;
begin
  perform private.check_secret(p_secret);
  update profiles set credits = credits + p_delta where id = p_user and credits + p_delta >= 0 returning credits into v;
  if v is null then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;
  insert into credit_ledger (user_id, delta, reason, job_id) values (p_user, p_delta, left(p_reason, 200), p_job);
  return v;
end $$;

-- Écritures sur les tables applicatives (liste blanche de tables et de colonnes vérifiées).
create or replace function public.app_write(p_secret text, p_op text, p_table text, p_row jsonb default '{}'::jsonb, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cols text; res jsonb; k text;
begin
  perform private.check_secret(p_secret);
  if p_table not in ('jobs', 'assets', 'characters', 'audit_log') then raise exception 'table_not_allowed' using errcode = 'P0001'; end if;
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

revoke all on function public.app_register(text, text, text, text, integer) from public;
revoke all on function public.app_credits(text, uuid, integer, text, uuid) from public;
revoke all on function public.app_write(text, text, text, jsonb, uuid) from public;
grant execute on function public.app_register(text, text, text, text, integer) to anon, authenticated;
grant execute on function public.app_credits(text, uuid, integer, text, uuid) to anon, authenticated;
grant execute on function public.app_write(text, text, text, jsonb, uuid) to anon, authenticated;

-- Stockage : chaque utilisateur lit et écrit uniquement dans son dossier <uid>/ du bucket privé « media ».
create policy media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy media_update_own on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid()::text));