-- Phase 3 code review: choosing or removing a photo now takes the session's lock first, as adding one
-- does (3a), so changes at the same moment (a still captured by voice while the shopper taps another
-- photo) wait their turn instead of breaking the one-active-photo rule with an error.

create or replace function public.choose_session_asset(owner uuid, session uuid, asset uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.sessions where id = session and user_id = owner for update;
  if not found then
    return false;
  end if;
  perform 1 from public.session_assets where id = asset and session_id = session and user_id = owner for update;
  if not found then
    return false;
  end if;
  update public.session_assets set active = false where session_id = session and active and id <> asset;
  update public.session_assets set active = true where id = asset;
  update public.sessions set last_activity_at = now() where id = session;
  return true;
end;
$$;

create or replace function public.remove_session_asset(owner uuid, session uuid, asset uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  removed public.session_assets;
begin
  perform 1 from public.sessions where id = session and user_id = owner for update;
  if not found then
    return null;
  end if;
  delete from public.session_assets where id = asset and session_id = session and user_id = owner returning * into removed;
  if removed.id is null then
    return null;
  end if;
  if removed.active then
    update public.session_assets set active = true
    where id = (select a.id from public.session_assets a where a.session_id = session order by a.created_at desc limit 1);
  end if;
  update public.sessions set last_activity_at = now() where id = session;
  return jsonb_build_object('version', removed.version, 'paths', to_jsonb(array_remove(array[removed.photo_path, removed.thumbnail_path], null)));
end;
$$;
