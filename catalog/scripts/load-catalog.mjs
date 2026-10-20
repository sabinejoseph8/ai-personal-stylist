// 1e: loads the sample products into catalog_products from catalog/products.json and
// catalog/image-sources.json, with each photo's source and Sabine's review (risk 13).
// Every product needs a published photo (public/catalog/<slug>.jpg) that she approved.
// Products are matched by slug, so re-running it updates them. Uses the server key (from the
// environment or .env.local), because the catalog is read-only for everyone else.
//   npm run catalog:load
//   npm run catalog:load -- --draft    also loads photos not reviewed yet (for building, never for launch)
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../../lib/public-config.ts";
import { requiredSetting } from "../../scripts/settings.mjs";

const draft = process.argv.includes("--draft");
const key = requiredSetting("SUPABASE_SECRET_KEY");
const products = JSON.parse(readFileSync("catalog/products.json", "utf8"));
const sources = JSON.parse(readFileSync("catalog/image-sources.json", "utf8"));

const problems = [];
const rows = products.map((p) => {
  const source = sources[p.slug];
  if (!existsSync(`public/catalog/${p.slug}.jpg`)) problems.push(`${p.slug}: no published photo`);
  if (!source) problems.push(`${p.slug}: no image source`);
  else if (!draft && source.review?.verdict !== "approved") problems.push(`${p.slug}: photo not approved`);
  return {
    slug: p.slug,
    department: p.department,
    category: p.category,
    name: p.name,
    colors: p.colors,
    style_tags: p.style_tags,
    price_cents: p.price_cents,
    currency: p.currency,
    sizes: p.sizes,
    attributes: p.attributes,
    image_path: `/catalog/${p.slug}.jpg`,
    image_alt: p.image_description,
    image_source: source ?? {},
  };
});
if (problems.length) {
  console.error(`Not loaded:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
const { error } = await db.from("catalog_products").upsert(rows, { onConflict: "slug" });
if (error) throw new Error(`loading the catalog failed: ${error.message}`);
const { data: all } = await db.from("catalog_products").select("slug");
const extra = all.filter((r) => !products.some((p) => p.slug === r.slug)).map((r) => r.slug);
console.log(`loaded ${rows.length} products${draft ? " (draft: photos not all reviewed)" : ""}`);
if (extra.length) console.log(`in the database but not in products.json (left alone): ${extra.join(", ")}`);
