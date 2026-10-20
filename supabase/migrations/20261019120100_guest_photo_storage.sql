-- Private photo storage with one folder per guest (tech spec section 6).
-- A photo lives at guest-photos/<the guest's user id>/<file>. Only that guest can reach it,
-- and only through short-lived signed links. Files are limited to 10 MB (FR-27).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guest-photos', 'guest-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "guests read their own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'guest-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "guests add photos to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'guest-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "guests replace their own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'guest-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'guest-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "guests delete their own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'guest-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
