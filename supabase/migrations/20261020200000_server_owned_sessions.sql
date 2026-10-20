-- 2a: sessions are the app's own record (decision A, Phase 1 code review). Guests can read their
-- sessions, but only the server, with the server key, starts, changes or ends them, after checking
-- the session is theirs.
drop policy "owner can add" on public.sessions;
drop policy "owner can change" on public.sessions;
drop policy "owner can delete" on public.sessions;

-- The live call, so the server can end it and give back the time it didn't use (budget guard).
alter table public.sessions
  add column call_id text,
  add column call_started_at timestamptz,
  add column reserved_seconds integer check (reserved_seconds is null or reserved_seconds >= 0),
  add column reserved_day date;

-- At most one open session per guest, so two tabs can't start two at once.
create unique index sessions_one_open_per_guest on public.sessions (user_id) where status in ('active', 'paused');
