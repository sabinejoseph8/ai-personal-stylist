-- Full code review, batch 4 (25 Oct 2026): the one-build-at-a-time lock is released only by the request
-- that holds it (C11). A build that ran past its 5-minute claim released the lock when it finished, though
-- another request had taken it since, so a third request could build alongside the second: the 4d bug
-- the lock was added for. Claiming now hands out a token, and releasing needs the same token.

alter table public.sessions add column looks_busy_token uuid;

-- The token when this build may start (nobody else is building, or their claim ran out); null otherwise.
-- The app deployed before this migration reads the answer as true or false, which a token or null still is.
drop function public.claim_looks_build(uuid);
create function public.claim_looks_build(session uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  t uuid := gen_random_uuid();
begin
  update public.sessions set looks_busy_until = now() + interval '5 minutes', looks_busy_token = t
  where id = session and (looks_busy_until is null or looks_busy_until < now());
  if not found then
    return null;
  end if;
  return t;
end;
$$;

create function public.release_looks_build(session uuid, token uuid)
returns void
language sql
set search_path = ''
as $$
  update public.sessions set looks_busy_until = null, looks_busy_token = null where id = session and looks_busy_token = token;
$$;

-- The one-argument release stays for the app deployed before this migration, and goes with batch 5.
revoke all on function public.claim_looks_build(uuid) from public, anon, authenticated;
revoke all on function public.release_looks_build(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_looks_build(uuid) to service_role;
grant execute on function public.release_looks_build(uuid, uuid) to service_role;
