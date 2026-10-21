-- 4c: look panels (R43, R44, R58). Each look on screen has a place, 1 to 3 (input_versions.slot). A swap
-- publishes a new look in the same place and retires the old one as 'replaced', in the same step, so
-- the screen never shows both. A look being checked again after a change is 'needs_check' (still on
-- screen, marked Needs a new check) until it passes or is held.

alter table public.looks drop constraint looks_status_check;
alter table public.looks add constraint looks_status_check
  check (status in ('building', 'checking', 'published', 'held', 'needs_check', 'saved', 'replaced'));

-- The publishing gate, as in 4b, with one more guard and one more job:
-- - a look that was held, replaced or saved can't be published again (Phase 5 restores a copy instead);
-- - `replaces`, when given, is retired in the same step, only if the new look was published.
drop function public.publish_look(uuid, text);
create function public.publish_look(look uuid, current_requirements text, replaces uuid default null)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  session uuid;
begin
  update public.looks l set status = 'published'
  from public.sessions s
  where l.id = look
    and l.status in ('checking', 'needs_check', 'published')
    and s.id = l.session_id and s.status <> 'ended'
    and l.requirements_key = current_requirements
    and exists (
      select 1 from public.check_results c
      where c.look_id = l.id and c.verdict = 'pass'
        and c.versions_checked ->> 'items' = md5(l.items::text)
        and c.versions_checked ->> 'requirements' = current_requirements
    )
  returning l.session_id into session;
  if not found then
    return false;
  end if;
  if replaces is not null and replaces <> look then
    update public.looks set status = 'replaced'
    where id = replaces and session_id = session and status in ('published', 'needs_check');
  end if;
  return true;
end;
$$;

revoke all on function public.publish_look(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.publish_look(uuid, text, uuid) to service_role;
