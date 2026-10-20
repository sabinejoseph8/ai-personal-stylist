-- 2e: session endings. A session's session-only data is deleted when it ends (R63). Sessions idle for
-- 30 minutes are ended by a database timer every 10 minutes (Supabase Cron, Sabine's answer to Q1 in
-- 2e), and nothing can be saved to a session once it has ended. Ending a left-behind call at Tavus
-- needs the Tavus key, so the app does that (lib/sessions.ts), not the database.

-- Supabase Cron (pg_cron) runs the timer below.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 1. A session's session-only data: today its notes. Feedback, photos and exceptions join this as
--    they're built (Phases 3 to 5).
create function public.delete_session_data(session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.session_notes where session_id = session;
$$;

-- 2. Ends sessions idle for 30 minutes (R12) and sweeps the data of every ended session, so nothing is
--    left behind if a deletion was missed. Returns how many sessions it ended.
create function public.close_idle_sessions()
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
  return closed;
end;
$$;

-- 3. The daily job uses the same step, and clears the timer's run history after 7 days.
create or replace function public.daily_tidy()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
  old_usage integer;
  old_limits integer;
begin
  closed := public.close_idle_sessions();
  delete from public.usage where day < (now() at time zone 'utc')::date - 90;
  get diagnostics old_usage = row_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics old_limits = row_count;
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  return jsonb_build_object('sessions_closed', closed, 'usage_deleted', old_usage, 'rate_limits_deleted', old_limits);
end;
$$;

-- 4. Saving notes to a session that has ended is refused, so a reading still running when the
--    shopper taps End can't bring its notes back (found in 2c).
create or replace function public.save_notes(session uuid, expected_version integer, rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  owner uuid;
  current_version integer;
  current_status text;
begin
  select user_id, notes_version, status into owner, current_version, current_status from public.sessions where id = session for update;
  if owner is null then
    raise exception 'save_notes: no such session';
  end if;
  if current_status = 'ended' then
    raise exception 'save_notes: session ended';
  end if;
  if current_version <> expected_version then
    return null;
  end if;
  insert into public.session_notes as n
    (id, user_id, session_id, note_text, kind, hidden_details, status, source, changed_seq, version, removed, updated_at)
  select r.id, owner, session, r.note_text, r.kind, r.hidden_details, r.status, r.source, r.changed_seq, r.version, r.removed, now()
  from jsonb_to_recordset(rows) as r(
    id uuid, note_text text, kind text, hidden_details jsonb, status text, source text, changed_seq bigint, version integer, removed boolean
  )
  on conflict (id) do update set
    note_text = excluded.note_text,
    kind = excluded.kind,
    hidden_details = excluded.hidden_details,
    status = excluded.status,
    source = excluded.source,
    changed_seq = excluded.changed_seq,
    version = excluded.version,
    removed = excluded.removed,
    updated_at = now()
  where n.session_id = session;
  update public.sessions set notes_version = current_version + 1, last_activity_at = now() where id = session;
  return current_version + 1;
end;
$$;

revoke all on function public.delete_session_data(uuid) from public, anon, authenticated;
revoke all on function public.close_idle_sessions() from public, anon, authenticated;
grant execute on function public.delete_session_data(uuid) to service_role;
grant execute on function public.close_idle_sessions() to service_role;

-- 5. The timer: every 10 minutes, inside the database.
select cron.schedule('close-idle-sessions', '*/10 * * * *', 'select public.close_idle_sessions()');
