-- 5c: "This session only" exceptions (R57). An exception lets one saved Must have or Never preference
-- be broken for one session. It's the app's own record (decision A): the server writes it when the
-- shopper taps Allow for this session, so guests can read their exceptions but can't add, change or
-- delete them. One exception per preference per session. It ends with the session (the session's
-- data is deleted then), and a preference taken off the profile takes its exception with it.

drop policy "owner can add" on public.session_exceptions;
drop policy "owner can change" on public.session_exceptions;
drop policy "owner can delete" on public.session_exceptions;

alter table public.session_exceptions add constraint session_exceptions_one_per_preference unique (session_id, saved_preference_id);

-- An exception ends with its session (R57, R63): ending a session, or closing an idle one, deletes them.
create or replace function public.delete_session_data(session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.session_notes where session_id = session;
  delete from public.looks where session_id = session and status <> 'saved';
  delete from public.session_exceptions where session_id = session;
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
  delete from public.session_exceptions e using public.sessions s where e.session_id = s.id and s.status = 'ended';
  return closed;
end;
$$;
