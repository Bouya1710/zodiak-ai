-- Plafond global de dépense : crédits engagés par des jobs non remboursés depuis une date (tous utilisateurs).
create or replace function public.app_spent_since(p_secret text, p_since timestamptz)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.check_secret(p_secret);
  return coalesce((select sum(cost) from jobs where created_at >= p_since and status in ('queued', 'running', 'done') and coalesce(cache_hit, false) = false), 0)::integer;
end $$;
revoke all on function public.app_spent_since(text, timestamptz) from public, anon, authenticated;
grant execute on function public.app_spent_since(text, timestamptz) to anon;
