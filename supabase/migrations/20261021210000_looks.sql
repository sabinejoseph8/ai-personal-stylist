-- 4b: looks and preference checks (R54, R55, R59). Like notes and photos, they're the app's own record
-- (decision A): only the server writes them, so a guest can't mark a look published. A look reaches the
-- screen only through publish_look, the one publishing gate (tech spec 5, pattern 6): it needs a passing
-- check of that exact look (the database fingerprints its items itself) made against the requirements
-- the app says are current. A look checked before the budget changed can never slip through.

drop policy "owner can add" on public.looks;
drop policy "owner can change" on public.looks;
drop policy "owner can delete" on public.looks;
drop policy "owner can add" on public.check_results;
drop policy "owner can change" on public.check_results;
drop policy "owner can delete" on public.check_results;

-- The look's short name ("Garden ceremony"), and the fingerprint of everything it was built to meet:
-- the profile's departments, sizes, budget and rules, the confirmed notes, the item to style around and
-- the wardrobe items chosen for styling. Made by the app (lib/looks-service.ts).
alter table public.looks
  add column name text check (length(name) <= 60),
  add column requirements_key text;

-- 1. Records a check of a look as it is now. The items' fingerprint is taken here, from the stored look.
create function public.record_check(look uuid, verdict text, reasons jsonb, requirements_key text)
returns uuid
language sql
set search_path = ''
as $$
  insert into public.check_results (user_id, session_id, look_id, versions_checked, verdict, reasons)
  select l.user_id, l.session_id, l.id,
    jsonb_build_object('items', md5(l.items::text), 'requirements', requirements_key), verdict, reasons
  from public.looks l
  where l.id = look
  returning id;
$$;

-- 2. The publishing gate. True when the look is now published: a passing check exists for these exact
--    items against these requirements, and its session is still open.
create function public.publish_look(look uuid, current_requirements text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.looks l set status = 'published'
  from public.sessions s
  where l.id = look
    and s.id = l.session_id and s.status <> 'ended'
    and l.requirements_key = current_requirements
    and exists (
      select 1 from public.check_results c
      where c.look_id = l.id and c.verdict = 'pass'
        and c.versions_checked ->> 'items' = md5(l.items::text)
        and c.versions_checked ->> 'requirements' = current_requirements
    );
  return found;
end;
$$;

-- 3. A session's looks and their checks are session-only data (R63): deleted when it ends, except
--    saved ones (Phase 5). Checks go with their look.
create or replace function public.delete_session_data(session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.session_notes where session_id = session;
  delete from public.looks where session_id = session and status <> 'saved';
$$;

create or replace function public.close_idle_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  update public.sessions set status = 'ended', ended_at = now()
  where status in ('active', 'paused') and last_activity_at < now() - interval '30 minutes';
  get diagnostics closed = row_count;
  delete from public.session_notes n using public.sessions s where n.session_id = s.id and s.status = 'ended';
  delete from public.looks l using public.sessions s where l.session_id = s.id and s.status = 'ended' and l.status <> 'saved';
  return closed;
end;
$$;

revoke all on function public.record_check(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.publish_look(uuid, text) from public, anon, authenticated;
grant execute on function public.record_check(uuid, text, jsonb, text) to service_role;
grant execute on function public.publish_look(uuid, text) to service_role;
