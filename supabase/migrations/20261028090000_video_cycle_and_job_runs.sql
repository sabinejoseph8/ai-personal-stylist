-- 7c (Sabine's answer to Q1): the month's video minutes are counted from the day Tavus's plan renews
-- (the 21st), not the 1st, so the app's stop and Tavus's own count agree. Claude and OpenAI stay on
-- calendar months, as their providers bill. The new parameter defaults to 1 (calendar months), so a
-- caller that doesn't pass it behaves as before. Also a small record of the daily job's runs, for the
-- health page (7c monitoring).

-- The first day of the video month that `today` is in, when it starts on `cycle_day` (1 to 28).
create function public.video_cycle_start(today date, cycle_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(day from today) >= least(greatest(cycle_day, 1), 28)
      then (date_trunc('month', today) + make_interval(days => least(greatest(cycle_day, 1), 28) - 1))::date
    else (date_trunc('month', today - interval '1 month') + make_interval(days => least(greatest(cycle_day, 1), 28) - 1))::date
  end;
$$;

-- The automated tests' guests talk to a free fake stylist, but their reserved seconds landed in the same
-- usage table, so they counted against the real month's video minutes (about 23 minutes on 28 Oct 2026).
-- Their daily limits still apply; only the month's video total leaves them out (7c).
create function public.is_test_guest(id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = is_test_guest.id and u.email like 'test-guest-%@example.com');
$$;

drop function public.budget_reserve_time(uuid, text, integer, integer, integer);
create function public.budget_reserve_time(guest uuid, engine text, wanted integer, daily_limit integer, monthly_video_limit integer, video_cycle_day integer default 1)
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
      from public.usage
      where day >= public.video_cycle_start(today, video_cycle_day)
        and (user_id is null or not public.is_test_guest(user_id));
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

drop function public.budget_status(uuid);
create function public.budget_status(guest uuid, video_cycle_day integer default 1)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with this as (select (now() at time zone 'utc')::date as today)
  select jsonb_build_object(
    'today_seconds', coalesce(sum(video_seconds + voice_seconds) filter (where user_id = guest and day = this.today), 0),
    'today_microdollars', coalesce(sum(claude_microdollars + openai_microdollars) filter (where user_id = guest and day = this.today), 0),
    'month_video_seconds', coalesce(sum(video_seconds) filter (where day >= public.video_cycle_start(this.today, video_cycle_day) and (user_id is null or not public.is_test_guest(user_id))), 0),
    'month_claude_microdollars', coalesce(sum(claude_microdollars) filter (where day >= date_trunc('month', this.today)::date), 0),
    'month_openai_microdollars', coalesce(sum(openai_microdollars) filter (where day >= date_trunc('month', this.today)::date), 0)
  )
  from this left join public.usage on day >= least(date_trunc('month', this.today)::date, public.video_cycle_start(this.today, video_cycle_day))
  group by this.today;
$$;

revoke all on function public.video_cycle_start(date, integer) from public, anon, authenticated;
revoke all on function public.is_test_guest(uuid) from public, anon, authenticated;
grant execute on function public.is_test_guest(uuid) to service_role;
revoke all on function public.budget_reserve_time(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.budget_status(uuid, integer) from public, anon, authenticated;
grant execute on function public.video_cycle_start(date, integer) to service_role;
grant execute on function public.budget_reserve_time(uuid, text, integer, integer, integer, integer) to service_role;
grant execute on function public.budget_status(uuid, integer) to service_role;

-- The daily job's last run, read by the health page: only the server writes or reads it.
create table public.job_runs (
  name text primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  summary jsonb not null default '{}'
);
alter table public.job_runs enable row level security;
revoke all on table public.job_runs from anon, authenticated;
