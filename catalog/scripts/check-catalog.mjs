// The Phase 1 catalog check (docs/progress.md, manual verification): how many sample products
// the app can see, and whether every one has a photo, a price and every required detail.
// It reads through the same catalog connector the app uses.
//   npm run catalog:check
//   npm run catalog:check -- --site https://ai-personal-stylist-inky.vercel.app   also checks the live photos
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../lib/public-config.ts";
import { createSampleCatalog } from "../../connectors/catalog/sample.ts";
import { missingDetails } from "../../connectors/catalog/required-details.ts";

const siteAt = process.argv.indexOf("--site");
const site = siteAt > 0 ? process.argv[siteAt + 1]?.replace(/\/$/, "") : null;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const products = await createSampleCatalog(db).search({ limit: 10000 });
const { data: sources, error } = await db.from("catalog_products").select("id, image_source");
if (error) throw new Error(`reading photo sources failed: ${error.message}`);
const reviewOf = new Map(sources.map((r) => [r.id, r.image_source?.review?.verdict]));

const problems = [];
let photos = 0;
for (const p of products) {
  const missing = missingDetails(p);
  if (missing.length) problems.push(`${p.name}: missing ${missing.join(", ")}`);
  if (p.canBeBought || p.purchaseUrl) problems.push(`${p.name}: shown as for sale`);
  let photo = existsSync(`public${p.image.url}`);
  if (!photo) problems.push(`${p.name}: no photo file at public${p.image.url}`);
  if (site) {
    const res = await fetch(`${site}${p.image.url}`, { method: "HEAD" });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
      problems.push(`${p.name}: the site doesn't serve its photo (${res.status})`);
      photo = false;
    }
  }
  if (reviewOf.get(p.id) !== "approved") {
    problems.push(`${p.name}: photo not approved`);
    photo = false;
  }
  if (photo) photos++;
}

const count = (d) => products.filter((p) => p.department === d).length;
const prices = products.map((p) => p.price.amountCents / 100);
const complete = products.filter((p) => !missingDetails(p).length).length;
console.log(`Sample catalog: ${products.length} products (${count("womenswear")} womenswear, ${count("menswear")} menswear)`);
console.log(`  Photos: ${photos} of ${products.length} approved and in place${site ? `, served by ${site}` : ""}`);
console.log(`  Prices: ${prices.filter((x) => x > 0).length} of ${products.length}, from $${Math.min(...prices)} to $${Math.max(...prices)} (US dollars)`);
console.log(`  Details: ${complete} of ${products.length} complete`);
console.log(`  For sale: ${products.filter((p) => p.canBeBought).length} (sample products only)`);
if (products.length < 120) problems.push(`only ${products.length} products (expected about 150)`);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("\nAll good.");
