-- 1e: what each sample product needs before it can be shown (R38, risk 13).
-- slug: the catalog's own product id, also the image file name (public/catalog/<slug>.jpg).
-- image_alt: the photo's description, read out by screen readers.
-- image_source: where the photo came from (generator, model, prompt, date) and Sabine's review.
-- The table is empty until the seed, so the new columns can be required straight away.
alter table public.catalog_products
  add column slug text not null unique check (slug ~ '^[wm]-[a-z0-9-]+$'),
  add column image_alt text not null,
  alter column image_path set not null,
  alter column image_source type jsonb using image_source::jsonb,
  alter column image_source set not null;
