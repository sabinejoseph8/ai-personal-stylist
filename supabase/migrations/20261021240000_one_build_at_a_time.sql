-- One looks build at a time per session (found while building 4d). A note changed while looks were
-- being built made the page ask again, and that request, finding no looks yet, started a second full
-- build: twice the cost, and two looks published in the same place. Now a build claims the session
-- for at most 5 minutes; a request that finds it claimed waits for it, then answers from what it made.

alter table public.sessions add column looks_busy_until timestamptz;

-- True when this build may start: nobody else is building, or their claim ran out.
create function public.claim_looks_build(session uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.sessions set looks_busy_until = now() + interval '5 minutes'
  where id = session and (looks_busy_until is null or looks_busy_until < now());
  return found;
end;
$$;

create function public.release_looks_build(session uuid)
returns void
language sql
set search_path = ''
as $$
  update public.sessions set looks_busy_until = null where id = session;
$$;

revoke all on function public.claim_looks_build(uuid) from public, anon, authenticated;
revoke all on function public.release_looks_build(uuid) from public, anon, authenticated;
grant execute on function public.claim_looks_build(uuid) to service_role;
grant execute on function public.release_looks_build(uuid) to service_role;
