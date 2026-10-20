-- 1f: the budget guard (risk 4) and the daily clean-up job.
-- Days and months are counted in UTC. The limits themselves live in the app's settings and are
-- passed in, so they can change without a migration.

-- usage keeps Claude and OpenAI costs apart, because each has its own monthly ceiling.
alter table public.usage rename column ai_cost_microdollars to claude_microdollars;
alter table public.usage add column openai_microdollars bigint not null default 0;
create index on public.usage (day);

-- Reserves conversation time before a call starts, in one step, so two tabs or two visitors
-- can't spend the same minutes. Grants up to `wanted` seconds, limited by the guest's time left
-- today and, for video, the demo's video time left this month. Returns what was granted and
-- what was left before, so the server can say why a call was refused.
create function public.budget_reserve_time(guest uuid, engine text, wanted integer, daily_limit integer, monthly_video_limit integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  used_today integer;
  used_month integer;
  left_today integer;
  left_month integer;
  granted integer;
begin
  if guest is null or engine not in ('video', 'voice') or wanted < 0 then
    raise exception 'budget_reserve_time: bad request';
  end if;
  perform pg_advisory_xact_lock(hashtext('budget_reserve_time'));
  select coalesce(sum(video_seconds + voice_seconds), 0) into used_today
    from public.usage where user_id = guest and day = today;
  left_today := greatest(0, daily_limit - used_today);
  if engine = 'video' then
    select coalesce(sum(video_seconds), 0) into used_month
      from public.usage where day >= date_trunc('month', today)::date;
    left_month := greatest(0, monthly_video_limit - used_month);
  else
    left_month := left_today;
  end if;
  granted := least(wanted, left_today, left_month);
  if granted > 0 then
    insert into public.usage as u (user_id, day, video_seconds, voice_seconds)
    values (guest, today, case when engine = 'video' then granted else 0 end, case when engine = 'voice' then granted else 0 end)
    on conflict (user_id, day) do update set
      video_seconds = u.video_seconds + excluded.video_seconds,
      voice_seconds = u.voice_seconds + excluded.voice_seconds;
  end if;
  return jsonb_build_object('granted', granted, 'day', today, 'left_today', left_today, 'left_month', left_month);
end;
$$;

-- After a call: swaps the seconds reserved for the seconds really used, on the reservation's day.
create function public.budget_settle_time(guest uuid, engine text, reserved_day date, reserved integer, used integer)
returns void
language sql
set search_path = ''
as $$
  update public.usage set
    video_seconds = case when engine = 'video' then greatest(0, video_seconds - reserved + used) else video_seconds end,
    voice_seconds = case when engine = 'voice' then greatest(0, voice_seconds - reserved + used) else voice_seconds end
  where user_id = guest and day = reserved_day;
$$;

-- After an AI call: adds its cost, in millionths of a dollar, to the guest's day.
create function public.budget_record_ai(guest uuid, provider text, microdollars bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  if guest is null or provider not in ('claude', 'openai') or microdollars < 0 then
    raise exception 'budget_record_ai: bad request';
  end if;
  insert into public.usage as u (user_id, day, claude_microdollars, openai_microdollars)
  values (guest, today, case when provider = 'claude' then microdollars else 0 end, case when provider = 'openai' then microdollars else 0 end)
  on conflict (user_id, day) do update set
    claude_microdollars = u.claude_microdollars + excluded.claude_microdollars,
    openai_microdollars = u.openai_microdollars + excluded.openai_microdollars;
end;
$$;

-- What a guest has used today, and what the whole demo has used this month (deleted guests included).
create function public.budget_status(guest uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with this as (select (now() at time zone 'utc')::date as today)
  select jsonb_build_object(
    'today_seconds', coalesce(sum(video_seconds + voice_seconds) filter (where user_id = guest and day = this.today), 0),
    'today_microdollars', coalesce(sum(claude_microdollars + openai_microdollars) filter (where user_id = guest and day = this.today), 0),
    'month_video_seconds', coalesce(sum(video_seconds), 0),
    'month_claude_microdollars', coalesce(sum(claude_microdollars), 0),
    'month_openai_microdollars', coalesce(sum(openai_microdollars), 0)
  )
  from this left join public.usage on day >= date_trunc('month', this.today)::date
  group by this.today;
$$;

-- Guests the daily job deletes (R3): guests with no visit for idle_days, and test guests
-- (test-guest-...@example.com) older than test_hours that a test run didn't remove.
-- Only anonymous guests and test guests are ever touched. At most max_count per run, oldest first.
create function public.expired_guests(idle_days integer, test_hours integer, max_count integer)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where (u.is_anonymous or u.email like 'test-guest-%@example.com')
    and (coalesce(p.last_active_at, u.created_at) < now() - make_interval(days => idle_days)
      or (u.email like 'test-guest-%@example.com' and u.created_at < now() - make_interval(hours => test_hours)))
  order by u.created_at
  limit max_count;
$$;

-- The daily job's tidy-up: closes sessions idle for 30 minutes (R12; the app also closes them
-- itself from Phase 2), and deletes usage older than 90 days and old rate-limit counts.
create function public.daily_tidy()
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
  update public.sessions set status = 'ended', ended_at = now()
  where status in ('active', 'paused') and last_activity_at < now() - interval '30 minutes';
  get diagnostics closed = row_count;
  delete from public.usage where day < (now() at time zone 'utc')::date - 90;
  get diagnostics old_usage = row_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics old_limits = row_count;
  return jsonb_build_object('sessions_closed', closed, 'usage_deleted', old_usage, 'rate_limits_deleted', old_limits);
end;
$$;

-- A visit keeps a guest from being deleted (R3). Called on each visit, it writes at most once an hour.
create function public.touch_last_active()
returns void
language sql
set search_path = ''
as $$
  update public.profiles set last_active_at = now()
  where user_id = auth.uid() and last_active_at < now() - interval '1 hour';
$$;

-- Only the server (with the server key) may reserve, record or clean up. Visitors may only mark their own visit.
revoke all on function public.budget_reserve_time(uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.budget_settle_time(uuid, text, date, integer, integer) from public, anon, authenticated;
revoke all on function public.budget_record_ai(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.budget_status(uuid) from public, anon, authenticated;
revoke all on function public.expired_guests(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.daily_tidy() from public, anon, authenticated;
grant execute on function public.budget_reserve_time(uuid, text, integer, integer, integer) to service_role;
grant execute on function public.budget_settle_time(uuid, text, date, integer, integer) to service_role;
grant execute on function public.budget_record_ai(uuid, text, bigint) to service_role;
grant execute on function public.budget_status(uuid) to service_role;
grant execute on function public.expired_guests(integer, integer, integer) to service_role;
grant execute on function public.daily_tidy() to service_role;
revoke all on function public.touch_last_active() from public, anon;
grant execute on function public.touch_last_active() to authenticated;
