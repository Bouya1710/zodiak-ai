-- Dépenses du site par modèle depuis une date : crédits engagés par des jobs non remboursés (tous utilisateurs).
create or replace function public.app_spent_by_engine(p_secret text, p_since timestamptz)
returns table(engine text, credits integer, jobs integer) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.check_secret(p_secret);
  return query select coalesce(j.params::jsonb->>'engine', ''), sum(j.cost)::integer, count(*)::integer
    from public.jobs j where j.created_at >= p_since and j.status in ('queued', 'running', 'done') and coalesce(j.cache_hit, false) = false
    group by 1;
end $$;
revoke all on function public.app_spent_by_engine(text, timestamptz) from public, anon, authenticated;
grant execute on function public.app_spent_by_engine(text, timestamptz) to anon;
