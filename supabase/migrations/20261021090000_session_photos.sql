-- 3a: the item to style around (R26, R27, R31; FR-27). Photos are the app's own record (decision A):
-- the server checks and cleans every photo before keeping it, so guests can read their photos and
-- photo records but can't add, change or delete them. The browser sends a photo straight to private
-- storage with a one-time upload link from the app, because Vercel refuses anything over 4.5 MB
-- (Sabine's answer to Q1 in 3a). The app then checks and cleans it.

drop policy "owner can add" on public.session_assets;
drop policy "owner can change" on public.session_assets;
drop policy "owner can delete" on public.session_assets;

drop policy "guests add photos to their own folder" on storage.objects;
drop policy "guests replace their own photos" on storage.objects;
drop policy "guests delete their own photos" on storage.objects;

-- uploading: the upload link is out. ready: checked, cleaned and kept.
alter table public.session_assets
  add column status text not null default 'uploading' check (status in ('uploading', 'ready'));

-- One active photo per session: the item to style around.
create unique index session_assets_one_active on public.session_assets (session_id) where active;

-- Where a photo's files live: <guest>/<session>/<photo>-v<version>.jpg and its thumbnail. A new
-- version gets new files, so a link to the old one never shows the new photo, or the other way round.
create function public.session_asset_path(owner uuid, session uuid, asset uuid, version integer, thumbnail boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select format('%s/%s/%s-v%s%s.jpg', owner, session, asset, version, case when thumbnail then '-thumb' else '' end);
$$;

-- 1. Adds a photo to the guest's open session, as the active one, or replaces one with a new version
--    of it (R31). Up to 5 photos per session (Sabine's answer to Q3 in 3a); an upload that never
--    finished stops counting after 10 minutes. Returns the photo's id, version and paths, plus the
--    replaced version's paths to delete, or {refused: 'session' | 'full' | 'photo'}.
create function public.add_session_asset(owner uuid, session uuid, asset_source text, replaced uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  session_status text;
  added public.session_assets;
  old_paths text[] := '{}';
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
    update public.session_assets set active = false where session_id = session and active;
    insert into public.session_assets (user_id, session_id, photo_path, source)
    values (owner, session, '', asset_source)
    returning * into added;
  else
    select array[a.photo_path, a.thumbnail_path] into old_paths
    from public.session_assets a where a.id = replaced and a.session_id = session for update;
    if not found then
      return jsonb_build_object('refused', 'photo');
    end if;
    -- A new version: whatever was learned about the old photo goes with it.
    update public.session_assets
    set version = version + 1, status = 'uploading', source = asset_source, recognized_details = '{}', ownership = null
    where id = replaced
    returning * into added;
  end if;

  update public.session_assets
  set photo_path = public.session_asset_path(owner, session, added.id, added.version, false),
      thumbnail_path = public.session_asset_path(owner, session, added.id, added.version, true)
  where id = added.id
  returning * into added;
  update public.sessions set last_activity_at = now() where id = session;
  return jsonb_build_object(
    'id', added.id,
    'version', added.version,
    'photo_path', added.photo_path,
    'thumbnail_path', added.thumbnail_path,
    'replaced_paths', to_jsonb(array_remove(old_paths, null))
  );
end;
$$;

-- 2. The photo is checked, cleaned and kept: ready, unless it has been replaced or removed since, or
--    its session has ended (then the caller deletes the files it just wrote).
create function public.finish_session_asset(owner uuid, asset uuid, expected_version integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.session_assets a set status = 'ready'
  from public.sessions s
  where a.id = asset and a.user_id = owner and a.version = expected_version
    and s.id = a.session_id and s.status <> 'ended';
  return found;
end;
$$;

-- 3. What the photo reader learned (3b). A late answer for a photo that has since been replaced
--    (a newer version) or removed is refused, so it never brings back an old photo (R31).
create function public.save_asset_details(asset uuid, expected_version integer, details jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.session_assets a set recognized_details = details
  from public.sessions s
  where a.id = asset and a.version = expected_version
    and s.id = a.session_id and s.status <> 'ended';
  return found;
end;
$$;

-- 4. Makes a photo the active one: the item to style around (R31).
create function public.choose_session_asset(owner uuid, session uuid, asset uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
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

-- 5. Removes a photo (R31). If it was the active one, the newest one left becomes active. Returns the
--    removed photo's version and paths, so the caller deletes its files, or null if there's no such photo.
create function public.remove_session_asset(owner uuid, session uuid, asset uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  removed public.session_assets;
begin
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

revoke all on function public.session_asset_path(uuid, uuid, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.add_session_asset(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_session_asset(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.save_asset_details(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.choose_session_asset(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_session_asset(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.session_asset_path(uuid, uuid, uuid, integer, boolean) to service_role;
grant execute on function public.add_session_asset(uuid, uuid, text, uuid) to service_role;
grant execute on function public.finish_session_asset(uuid, uuid, integer) to service_role;
grant execute on function public.save_asset_details(uuid, integer, jsonb) to service_role;
grant execute on function public.choose_session_asset(uuid, uuid, uuid) to service_role;
grant execute on function public.remove_session_asset(uuid, uuid, uuid) to service_role;
