import { readFileSync } from "node:fs";
import type { Department, Product } from "@/connectors/catalog/types";

// The sample catalog's 140 products from catalog/products.json, shaped as the catalog connector gives
// them, so the looks rules can be tested on the real catalog without the database.

type Row = {
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
};

const rows: Row[] = JSON.parse(readFileSync("catalog/products.json", "utf8"));

export const catalogProducts: Product[] = rows.map((r) => {
  const a = r.attributes;
  const details: Product["details"] = { formality: a.formality as number, material: a.material as string, pattern: a.pattern as string };
  if (a.heel_cm !== undefined) details.heelCm = a.heel_cm as number;
  for (const name of ["toe", "sleeve", "neckline", "coverage"] as const) if (a[name] !== undefined) (details as Record<string, unknown>)[name] = a[name];
  return {
    id: r.slug,
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
    image: { url: `/catalog/${r.slug}.jpg`, alt: r.name, rights: "sample" },
    region: "US",
    availableFrom: null,
    retailer: { name: "Sample catalog", attribution: "Sample product. Not for sale." },
    purchaseUrl: null,
    canBeBought: false,
  };
});
