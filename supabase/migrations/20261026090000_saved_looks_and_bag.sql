-- 6a: saved looks and the demo bag (R60 to R62). Both tables are written only by the server (review
-- batch 5 dropped the guests' write rules); guests keep reading their own rows.

-- A saved look is kept once: its pieces, in order, as "kind:id|kind:id".
alter table public.saved_looks add column items_key text not null;
alter table public.saved_looks add constraint saved_looks_once unique (user_id, items_key);

-- One row per product in the bag: adding it again changes its size. A size is always chosen.
alter table public.bag_items alter column size set not null;
alter table public.bag_items add constraint bag_items_once unique (user_id, product_id);
