import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import type { Product } from "@/connectors/catalog/types";
import { catalogContract } from "./support/catalog-contract";
import { visitorDb } from "./support/test-guests";

// The catalog is readable by everyone, so these tests need no server key.
catalogContract("sample", () => createSampleCatalog(visitorDb()));

describe("sample catalog", () => {
  const catalog = createSampleCatalog(visitorDb());
  let all: Product[];

  beforeAll(async () => {
    all = await catalog.search({ limit: 10000 });
  });

  it("has every capability off, and nothing can be bought (R62)", () => {
    expect(catalog.capabilities()).toEqual({ checkout: false, cartTransfer: false, orderTracking: false });
    expect(all.every((p) => !p.canBeBought && p.retailer.attribution === "Sample product. Not for sale.")).toBe(true);
  });

  it("has about 150 products across womenswear and menswear, in US dollars (R38)", () => {
    expect(all.length).toBeGreaterThanOrEqual(120);
    expect(all.filter((p) => p.department === "womenswear").length).toBeGreaterThanOrEqual(50);
    expect(all.filter((p) => p.department === "menswear").length).toBeGreaterThanOrEqual(50);
    expect(all.every((p) => p.price.currency === "USD")).toBe(true);
  });

  it("covers the example conversations: emerald dresses and shoes with flat to high heels (R38)", async () => {
    const emerald = await catalog.search({ department: "womenswear", categories: ["dress"], colors: ["emerald"] });
    expect(emerald.length).toBeGreaterThan(0);
    const heels = new Set(all.filter((p) => p.department === "womenswear" && p.category === "shoes").map((p) => p.details.heelCm ?? -1));
    expect(heels.has(-1)).toBe(false);
    expect(Math.min(...heels)).toBeLessThanOrEqual(1);
    expect(Math.max(...heels)).toBeGreaterThan(5);
    expect(heels.size).toBeGreaterThanOrEqual(4);
  });

  it("has a published photo for every product", () => {
    const missing = all.filter((p) => !existsSync(`public${p.image.url}`)).map((p) => p.image.url);
    expect(missing).toEqual([]);
  });

  it("records where every photo came from, and every photo was approved by hand (risk 13)", async () => {
    const { data, error } = await visitorDb().from("catalog_products").select("slug, image_source");
    expect(error).toBeNull();
    const unrecorded = data!.filter((r) => !r.image_source?.model || !r.image_source?.prompt || !r.image_source?.created_at);
    const unapproved = data!.filter((r) => r.image_source?.review?.verdict !== "approved");
    expect(unrecorded.map((r) => r.slug)).toEqual([]);
    expect(unapproved.map((r) => r.slug)).toEqual([]);
  });
});
