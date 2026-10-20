-- 2c: My Styling Notes live on the server (Phase 0 code review), and only the server changes them
-- (decision A). Guests can read their notes. Latest word wins (R22): every words request gets a
-- sequence number, and each note records the sequence of the last change to it, so a reading of
-- older words never overwrites a newer correction or a note changed by touch.
drop policy "owner can add" on public.session_notes;
drop policy "owner can change" on public.session_notes;
drop policy "owner can delete" on public.session_notes;

alter table public.session_notes add column changed_seq bigint not null default 0;
-- The notebook shows notes in the order they were jotted.
alter table public.session_notes add column created_at timestamptz not null default now();
alter table public.sessions add column words_seq bigint not null default 0;

-- The next sequence number for a session's words, taken when the words arrive.
create function public.next_words_seq(session uuid)
returns bigint
language sql
set search_path = ''
as $$
  update public.sessions set words_seq = words_seq + 1, last_activity_at = now() where id = session returning words_seq;
$$;

-- Saves changed notes and bumps the notebook's version, all or nothing. Returns the new version, or
-- null when someone else saved first (the caller reloads and merges again).
create function public.save_notes(session uuid, expected_version integer, rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  owner uuid;
  current_version integer;
begin
  select user_id, notes_version into owner, current_version from public.sessions where id = session for update;
  if owner is null then
    raise exception 'save_notes: no such session';
  end if;
  if current_version <> expected_version then
    return null;
  end if;
  insert into public.session_notes as n
    (id, user_id, session_id, note_text, kind, hidden_details, status, source, changed_seq, version, removed, updated_at)
  select r.id, owner, session, r.note_text, r.kind, r.hidden_details, r.status, r.source, r.changed_seq, r.version, r.removed, now()
  from jsonb_to_recordset(rows) as r(
    id uuid, note_text text, kind text, hidden_details jsonb, status text, source text, changed_seq bigint, version integer, removed boolean
  )
  on conflict (id) do update set
    note_text = excluded.note_text,
    kind = excluded.kind,
    hidden_details = excluded.hidden_details,
    status = excluded.status,
    source = excluded.source,
    changed_seq = excluded.changed_seq,
    version = excluded.version,
    removed = excluded.removed,
    updated_at = now()
  where n.session_id = session;
  update public.sessions set notes_version = current_version + 1, last_activity_at = now() where id = session;
  return current_version + 1;
end;
$$;

revoke all on function public.next_words_seq(uuid) from public, anon, authenticated;
revoke all on function public.save_notes(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.next_words_seq(uuid) to service_role;
grant execute on function public.save_notes(uuid, integer, jsonb) to service_role;
