-- 3d: the wardrobe (R36, R37). Like session photos (3a), wardrobe items and their photos are written
-- only by the app, so a photo path can never point anywhere unchecked. Guests read their own.
drop policy "owner can add" on public.wardrobe_items;
drop policy "owner can change" on public.wardrobe_items;
drop policy "owner can delete" on public.wardrobe_items;

alter table public.wardrobe_items
  add column thumbnail_path text,
  -- Chosen with Style with these: shown in My Styling Notes and used by looks (Phase 4) until changed.
  add column styling boolean not null default false,
  -- An item being added on the Wardrobe page, until the shopper saves its details. Old drafts are deleted.
  add column draft boolean not null default false,
  -- The session photo (and its version) it was saved from, so the same photo isn't saved twice.
  add column saved_from uuid,
  add column saved_from_version integer,
  add constraint wardrobe_items_category check (
    category is null or category in ('tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'bags', 'accessories', 'other')
  );

create unique index wardrobe_items_saved_once on public.wardrobe_items (saved_from, saved_from_version) where saved_from is not null;
