-- Full code review, batch 1 (24 Oct 2026): money and data.
-- 1. A new photo becomes the active one only once it's checked and kept. It was active from the moment
--    its upload link was issued, so an upload that failed left the session with no item to style around
--    while the page still showed the earlier photo as the one in use (review finding D1).
-- 2. Replace keeps the original photo, its reading and its files until the new version is kept: the
--    new version is pending until then (pending_version). A refused or failed replacement leaves the
--    original as it was (D2). Before, the original's files and reading went when the link was issued.
-- 3. A Tavus conversation whose end or hard-delete failed is remembered (stale_call_id), so the daily
--    job can try again; the id was cleared before the call to Tavus, so nothing could retry (E5).

alter table public.session_assets add column pending_version integer;
alter table public.sessions add column stale_call_id text;

-- 1 and 2. Adds a photo (not yet active) or marks a replacement pending. Returns the version the browser
-- uploads as, with the paths that version will have.
create or replace function public.add_session_asset(owner uuid, session uuid, asset_source text, replaced uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  session_status text;
  added public.session_assets;
  upload_version integer;
begin
  select s.status into session_status from public.sessions s where s.id = session and s.user_id = owner for update;
  if session_status is null or session_status = 'ended' then
    return jsonb_build_object('refused', 'session');
  end if;

  if replaced is null then
    if (select count(*) from public.session_assets a
        where a.session_id = session and (a.status = 'ready' or a.created_at > now() - interval '10 minutes')) >= 5 then
      return jsonb_build_object('refused', 'full');
    end if;
    insert into public.session_assets (user_id, session_id, photo_path, source, active)
    values (owner, session, '', asset_source, false)
    returning * into added;
    upload_version := added.version;
    update public.session_assets
    set photo_path = public.session_asset_path(owner, session, added.id, added.version, false),
        thumbnail_path = public.session_asset_path(owner, session, added.id, added.version, true)
    where id = added.id;
  else
    perform 1 from public.session_assets a where a.id = replaced and a.session_id = session for update;
    if not found then
      return jsonb_build_object('refused', 'photo');
    end if;
    -- The original stays as it is until the new version is kept.
    update public.session_assets set pending_version = version + 1, source = asset_source
    where id = replaced
    returning * into added;
    upload_version := added.pending_version;
  end if;

  update public.sessions set last_activity_at = now() where id = session;
  -- replaced_paths is always empty now; the app deployed before this migration still reads it.
  return jsonb_build_object(
    'id', added.id,
    'version', upload_version,
    'photo_path', public.session_asset_path(owner, session, added.id, upload_version, false),
    'thumbnail_path', public.session_asset_path(owner, session, added.id, upload_version, true),
    'replaced_paths', '[]'::jsonb
  );
end;
$$;

-- The photo is checked, cleaned and kept. A new photo becomes ready and active; a pending replacement
-- becomes the photo's version, with a fresh reading, and its old files are returned for deleting.
-- Not kept (false) when it has been replaced or removed since, or its session has ended.
drop function public.finish_session_asset(uuid, uuid, integer);
create function public.finish_session_asset(owner uuid, asset uuid, expected_version integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  a public.session_assets;
  old_paths text[] := '{}';
begin
  select x.* into a
  from public.session_assets x join public.sessions s on s.id = x.session_id
  where x.id = asset and x.user_id = owner and s.status <> 'ended'
  for update of x;
  if not found then
    return jsonb_build_object('kept', false);
  end if;

  if a.pending_version = expected_version then
    old_paths := array[a.photo_path, a.thumbnail_path];
    update public.session_assets
    set version = expected_version,
        pending_version = null,
        photo_path = public.session_asset_path(owner, a.session_id, a.id, expected_version, false),
        thumbnail_path = public.session_asset_path(owner, a.session_id, a.id, expected_version, true),
        recognized_details = '{}',
        ownership = null,
        details_seq = details_seq + 1
    where id = a.id;
  elsif not (a.status = 'uploading' and a.version = expected_version) then
    return jsonb_build_object('kept', false);
  end if;

  -- A photo kept for the first time (new, or its first upload tried again) becomes the active one.
  if a.status = 'uploading' then
    update public.session_assets set active = false where session_id = a.session_id and active and id <> a.id;
    update public.session_assets set status = 'ready', active = true where id = a.id;
  end if;
  update public.sessions set last_activity_at = now() where id = a.session_id;
  return jsonb_build_object('kept', true, 'old_paths', to_jsonb(array_remove(old_paths, null)));
end;
$$;

revoke all on function public.finish_session_asset(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.finish_session_asset(uuid, uuid, integer) to service_role;

-- Only a kept photo can be the item to style around.
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
  perform 1 from public.session_assets where id = asset and session_id = session and user_id = owner and status = 'ready' for update;
  if not found then
    return false;
  end if;
  update public.session_assets set active = false where session_id = session and active and id <> asset;
  update public.session_assets set active = true where id = asset;
  update public.sessions set last_activity_at = now() where id = session;
  return true;
end;
$$;

-- Removing the active photo makes the newest kept one active, never one still uploading.
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
    where id = (select a.id from public.session_assets a where a.session_id = session and a.status = 'ready' order by a.created_at desc limit 1);
  end if;
  update public.sessions set last_activity_at = now() where id = session;
  return jsonb_build_object(
    'version', removed.version,
    'pending_version', removed.pending_version,
    'paths', to_jsonb(array_remove(array[removed.photo_path, removed.thumbnail_path], null))
  );
end;
$$;
