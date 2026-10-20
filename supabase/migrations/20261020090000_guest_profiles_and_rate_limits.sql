-- 1b: a profile row for every new guest, and per-guest rate limits (tech spec section 6).

-- Every new guest gets a profile automatically.
create or replace function public.create_guest_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.consents (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_guest_created
  after insert on auth.users
  for each row execute function public.create_guest_profile();

-- Rate limits: one counter per guest, limit name and time window. Server-side only.
create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table public.rate_limits enable row level security;

-- Counts one use of a limit for the signed-in guest. Returns true while the guest is within
-- the limit, false once it's reached. Guests can call it, but can't read or change the counters.
create or replace function public.take_rate_limit(bucket text, max_hits integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  guest uuid := auth.uid();
  started timestamptz;
  used integer;
begin
  if guest is null or max_hits < 1 or window_seconds < 1 then
    return false;
  end if;
  started := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.rate_limits as r (user_id, bucket, window_start, hits)
  values (guest, take_rate_limit.bucket, started, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into used;
  delete from public.rate_limits
  where user_id = guest and rate_limits.bucket = take_rate_limit.bucket and window_start < started;
  return used <= max_hits;
end;
$$;

revoke all on function public.take_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.take_rate_limit(text, integer, integer) to authenticated;
revoke all on function public.create_guest_profile() from public, anon, authenticated;
