-- 1g: fixes from the Phase 1 code review.

-- 1. Rate limits: a caller could wipe the current window's count by asking for a different
--    window size, because older windows were deleted on every call. Now only counts older
--    than a day are deleted here (the daily job tidies them too), so no count can be reset.
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
  where user_id = guest and rate_limits.bucket = take_rate_limit.bucket and window_start < now() - interval '1 day';
  return used <= max_hits;
end;
$$;

-- 2. Saving preferences replaces the guest's whole list in one step: all or nothing, so a failed
--    save never leaves the guest without "Never: high heels". The list keeps its order.
create function public.replace_saved_preferences(items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 30 then
    raise exception 'replace_saved_preferences: bad request';
  end if;
  delete from public.saved_preferences where user_id = auth.uid();
  insert into public.saved_preferences (user_id, kind, words, created_at)
  select auth.uid(), e.item ->> 'kind', e.item ->> 'words', now() + e.n * interval '1 millisecond'
  from jsonb_array_elements(items) with ordinality as e(item, n);
end;
$$;
revoke all on function public.replace_saved_preferences(jsonb) from public, anon;
grant execute on function public.replace_saved_preferences(jsonb) to authenticated;

-- 3. A row that points at a session, look, saved preference or check result must point at one of
--    the same guest's. The access rules only checked each row's own owner; these two-column
--    foreign keys make the database check the owner of what it points at too.
alter table public.sessions add unique (id, user_id);
alter table public.looks add unique (id, user_id);
alter table public.saved_preferences add unique (id, user_id);
alter table public.check_results add unique (id, user_id);

alter table public.session_notes
  drop constraint session_notes_session_id_fkey,
  add foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade;
alter table public.session_feedback
  drop constraint session_feedback_session_id_fkey,
  add foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  add foreign key (look_id, user_id) references public.looks (id, user_id) on delete set null (look_id);
alter table public.session_exceptions
  drop constraint session_exceptions_session_id_fkey,
  drop constraint session_exceptions_saved_preference_id_fkey,
  add foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  add foreign key (saved_preference_id, user_id) references public.saved_preferences (id, user_id) on delete cascade;
alter table public.session_assets
  drop constraint session_assets_session_id_fkey,
  add foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade;
alter table public.looks
  drop constraint looks_session_id_fkey,
  drop constraint looks_revision_of_fkey,
  add foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  add foreign key (revision_of, user_id) references public.looks (id, user_id) on delete set null (revision_of);
alter table public.check_results
  drop constraint check_results_session_id_fkey,
  drop constraint check_results_look_id_fkey,
  add foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  add foreign key (look_id, user_id) references public.looks (id, user_id) on delete cascade;
alter table public.event_log
  drop constraint event_log_session_id_fkey,
  add foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade;
alter table public.bag_items
  drop constraint bag_items_check_result_id_fkey,
  add foreign key (check_result_id, user_id) references public.check_results (id, user_id) on delete set null (check_result_id);
