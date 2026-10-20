import type { SupabaseClient } from "@supabase/supabase-js";
import type { Availability, CatalogConnector, Department, Product, SearchFilters } from "./types";

// The sample catalog (PRD D03): about 140 made-up products in the catalog_products table, with
// AI-made photos served from public/catalog. Nothing can be bought, and every capability is off
// (R62). Only type imports here, so Node can also run this file (catalog/scripts/check-catalog.mjs).

type Row = {
  id: string;
  slug: string;
  department: Department;
  category: string;
  name: string;
  colors: string[];
  style_tags: string[];
  price_cents: number;
  currency: string;
  sizes: string[];
  attributes: Record<string, unknown>;
  image_path: string;
  image_alt: string;
  image_source: { generator?: string; model?: string } | null;
};

const COLUMNS =
  "id, slug, department, category, name, colors, style_tags, price_cents, currency, sizes, attributes, image_path, image_alt, image_source";
const ONE_SIZE = "one size";
const DEFAULT_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toProduct(r: Row): Product {
  const a = r.attributes;
  const details: Product["details"] = {
    formality: a.formality as number,
    material: a.material as string,
    pattern: a.pattern as string,
  };
  if (a.heel_cm !== undefined) details.heelCm = a.heel_cm as number;
  if (a.toe !== undefined) details.toe = a.toe as "open" | "closed";
  if (a.sleeve !== undefined) details.sleeve = a.sleeve as string;
  if (a.neckline !== undefined) details.neckline = a.neckline as string;
  if (a.coverage !== undefined) details.coverage = a.coverage as string;
  const made = [r.image_source?.generator, r.image_source?.model].filter(Boolean).join(" ");
  return {
    id: r.id,
    provider: "sample",
    providerProductId: r.slug,
    department: r.department,
    category: r.category,
    name: r.name,
    colors: r.colors,
    styleTags: r.style_tags,
    price: { amountCents: r.price_cents, currency: r.currency },
    variants: r.sizes.map((size) => ({ id: `${r.slug}:${size}`, size })),
    details,
    image: { url: r.image_path, alt: r.image_alt, rights: `AI-generated sample photo${made ? ` (${made})` : ""}. No real brands.` },
    region: "US",
    availableFrom: null,
    retailer: { name: "Sample catalog", attribution: "Sample product. Not for sale." },
    purchaseUrl: null,
    canBeBought: false,
  };
}

const lower = (list: string[]) => list.map((s) => s.trim().toLowerCase());

/** The filters the database query can't do simply: sizes, style tags, color words and excluded ids. */
function matches(p: Product, f: SearchFilters): boolean {
  if (f.sizes?.length) {
    const wanted = lower(f.sizes);
    if (!p.variants.some((v) => v.size.toLowerCase() === ONE_SIZE || wanted.includes(v.size.toLowerCase()))) return false;
  }
  if (f.styleTags?.length) {
    const wanted = lower(f.styleTags);
    if (!p.styleTags.some((t) => wanted.includes(t.toLowerCase()))) return false;
  }
  if (f.colors?.length) {
    const wanted = lower(f.colors);
    const words = p.colors.flatMap((c) => c.toLowerCase().split(/\s+/));
    if (!wanted.some((w) => words.includes(w) || p.colors.some((c) => c.toLowerCase() === w))) return false;
  }
  if (f.excludeIds?.includes(p.id)) return false;
  return true;
}

export function createSampleCatalog(db: SupabaseClient): CatalogConnector {
  return {
    provider: "sample",

    capabilities: () => ({ checkout: false, cartTransfer: false, orderTracking: false }),

    async search(f = {}) {
      let query = db.from("catalog_products").select(COLUMNS).eq("provider", "sample");
      if (f.department) query = query.eq("department", f.department);
      if (f.categories?.length) query = query.in("category", f.categories);
      if (f.minPriceCents !== undefined) query = query.gte("price_cents", f.minPriceCents);
      if (f.maxPriceCents !== undefined) query = query.lte("price_cents", f.maxPriceCents);
      const { data, error } = await query.order("price_cents").order("name");
      if (error) throw new Error(`catalog search failed: ${error.message}`);
      const limit = Math.max(0, f.limit ?? DEFAULT_LIMIT);
      return (data as Row[]).map(toProduct).filter((p) => matches(p, f)).slice(0, limit);
    },

    async getProduct(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await db.from("catalog_products").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(`catalog lookup failed: ${error.message}`);
      return data ? toProduct(data as Row) : null;
    },

    async getAvailability(ids) {
      const valid = ids.filter((id) => UUID.test(id));
      const known = new Set<string>();
      if (valid.length) {
        const { data, error } = await db.from("catalog_products").select("id").in("id", valid);
        if (error) throw new Error(`catalog availability failed: ${error.message}`);
        for (const r of data) known.add(r.id);
      }
      return ids.map(
        (id): Availability => ({ productId: id, status: known.has(id) ? "not_for_sale" : "unknown", availableFrom: null }),
      );
    },
  };
}
