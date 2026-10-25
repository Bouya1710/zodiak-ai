-- Permet à une edge function de vérifier le secret serveur sans le connaître.
create or replace function public.app_ping(p_secret text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.check_secret(p_secret);
  return true;
end $$;
revoke all on function public.app_ping(text) from public, anon, authenticated;
grant execute on function public.app_ping(text) to service_role;
