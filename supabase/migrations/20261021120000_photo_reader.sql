-- 3b: the photo reader (R28 to R30). What it found is kept with the photo (recognized_details), and
-- the shopper confirms or corrects details, picks one of several items and says whether it's theirs,
-- by touch or by voice. Those changes can arrive together (a tap while words are being read), so each
-- one names the details' revision it started from, and a change built on an older one is refused and
-- tried again on the newer details. A replaced photo's version still refuses everything (3a).

alter table public.session_assets add column details_seq integer not null default 0;

-- What the photo reader learned, or that it's still reading. Refused for an old version of the photo
-- or an ended session, so a late answer never brings back a replaced photo (R31).
create or replace function public.save_asset_details(asset uuid, expected_version integer, details jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.session_assets a set recognized_details = details, details_seq = a.details_seq + 1
  from public.sessions s
  where a.id = asset and a.version = expected_version
    and s.id = a.session_id and s.status <> 'ended';
  return found;
end;
$$;

-- A change by touch or voice: the new details and ownership, only if nothing else changed them since
-- the caller read them (expected_seq) and the photo is still that version.
create function public.change_asset_details(asset uuid, expected_version integer, expected_seq integer, details jsonb, new_ownership text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.session_assets a
  set recognized_details = details, ownership = new_ownership, details_seq = a.details_seq + 1
  from public.sessions s
  where a.id = asset and a.version = expected_version and a.details_seq = expected_seq
    and s.id = a.session_id and s.status <> 'ended';
  return found;
end;
$$;

revoke all on function public.change_asset_details(uuid, integer, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.change_asset_details(uuid, integer, integer, jsonb, text) to service_role;
