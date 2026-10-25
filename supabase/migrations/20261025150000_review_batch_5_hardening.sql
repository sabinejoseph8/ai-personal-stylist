-- Full code review, batch 5 (25 Oct 2026): hardening.
-- 1. The bag, saved looks and feedback tables are the app's own records (tech spec 6, decision A of the
--    Phase 1 review): guests could still write them directly, skipping the preference check the bag
--    needs (E2). Nothing reads them yet.
-- 2. A guest could set their own last-active date far in the future and never be cleaned up after 7
--    days (E3). A trigger keeps the date as it was when a guest changes it directly; the app's own touch
--    runs as the function owner, so it still works.
-- 3. The rate-limit step took any bucket name and window, so a guest could fill the table with junk
--    rows (E7). Names are capped at 64 characters and windows at a day.
-- 4. Two "photo has arrived" requests at the same instant could both clean and read a photo, paying
--    Claude twice and putting a confirmed detail back in pencil (D3). The first claims the photo.
-- 5. The one-argument lock release from before batch 4 goes: the app releases with its token.

drop policy "owner can add" on public.bag_items;
drop policy "owner can change" on public.bag_items;
drop policy "owner can delete" on public.bag_items;
drop policy "owner can add" on public.saved_looks;
drop policy "owner can change" on public.saved_looks;
drop policy "owner can delete" on public.saved_looks;
drop policy "owner can add" on public.session_feedback;
drop policy "owner can change" on public.session_feedback;
drop policy "owner can delete" on public.session_feedback;

create function public.keep_last_active_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.last_active_at is distinct from old.last_active_at then
    new.last_active_at := old.last_active_at;
  end if;
  return new;
end;
$$;

create trigger profiles_last_active_kept
before update on public.profiles
for each row execute function public.keep_last_active_at();

-- The app's touch (once an hour on a visit, R3) runs as the function owner, so the trigger lets it through.
create or replace function public.touch_last_active()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_active_at = now()
  where user_id = auth.uid() and last_active_at < now() - interval '1 hour';
$$;

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
  if guest is null or max_hits < 1 or window_seconds < 1 or window_seconds > 86400 or length(bucket) > 64 then
    return false;
  end if;
  started := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.rate_limits as r (user_id, bucket, window_start, hits)
  values (guest, take_rate_limit.bucket, started, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into used;
  delete from public.rate_limits
  where user_id = guest and rate_limits.bucket = take_rate_limit.bucket and window_start < now() - interval '1 day';
  return used <= max_hits;
end;
$$;

-- The version a "photo has arrived" request is cleaning: claimed once, and let go when the cleaning
-- fails, so a retry can claim it again.
alter table public.session_assets add column cleaning_version integer;

create function public.claim_session_asset(owner uuid, asset uuid, expected_version integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.session_assets set cleaning_version = expected_version
  where id = asset and user_id = owner and cleaning_version is distinct from expected_version
    and (pending_version = expected_version or (status = 'uploading' and version = expected_version));
  return found;
end;
$$;

create function public.unclaim_session_asset(owner uuid, asset uuid, expected_version integer)
returns void
language sql
set search_path = ''
as $$
  update public.session_assets set cleaning_version = null where id = asset and user_id = owner and cleaning_version = expected_version;
$$;

revoke all on function public.claim_session_asset(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.unclaim_session_asset(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_session_asset(uuid, uuid, integer) to service_role;
grant execute on function public.unclaim_session_asset(uuid, uuid, integer) to service_role;

drop function public.release_looks_build(uuid);
