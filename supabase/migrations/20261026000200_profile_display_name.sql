alter table public.profiles add column if not exists display_name text check (char_length(display_name) <= 60);

-- Mise à jour du profil par le serveur (le client ne peut pas écrire dans profiles).
create or replace function public.app_profile(p_secret text, p_user uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare res jsonb;
begin
  perform private.check_secret(p_secret);
  update profiles set display_name = nullif(btrim(left(p_name, 60)), '') where id = p_user returning to_jsonb(profiles.*) into res;
  return res;
end $$;
revoke all on function public.app_profile(text, uuid, text) from public;
grant execute on function public.app_profile(text, uuid, text) to anon, authenticated;
