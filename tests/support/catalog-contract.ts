import { beforeAll, describe, expect, it } from "vitest";
import { missingDetails } from "@/connectors/catalog/required-details";
import type { CatalogConnector, Product } from "@/connectors/catalog/types";

const ZERO_ID = "00000000-0000-4000-8000-000000000000";

/**
 * The tests every catalog connector must pass (PRD D19). A real retailer's connector runs
 * this same suite before it can replace or join the sample catalog.
 */
export function catalogContract(name: string, make: () => CatalogConnector) {
  describe(`catalog contract: ${name}`, () => {
    let catalog: CatalogConnector;
    let all: Product[];

    beforeAll(async () => {
      catalog = make();
      all = await catalog.search({ limit: 10000 });
    });

    it("has products, each with its own id", () => {
      expect(all.length).toBeGreaterThan(0);
      expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    });

    it("every product has every detail that looks and checks need (risk 6)", () => {
      const incomplete = all.map((p) => ({ product: p.name, missing: missingDetails(p) })).filter((x) => x.missing.length);
      expect(incomplete).toEqual([]);
    });

    it("every product has a provider id, sizes as variants, a region and retailer attribution", () => {
      for (const p of all) {
        expect(p.provider).toBe(catalog.provider);
        expect(p.providerProductId).toBeTruthy();
        expect(["womenswear", "menswear"]).toContain(p.department);
        for (const v of p.variants) expect(v.id && v.size).toBeTruthy();
        expect(p.region).toMatch(/^[A-Z]{2}$/);
        expect(p.retailer.name && p.retailer.attribution).toBeTruthy();
      }
    });

    it("never says a product can be bought while checkout is off (R62)", () => {
      if (catalog.capabilities().checkout) return;
      for (const p of all) {
        expect(p.canBeBought).toBe(false);
        expect(p.purchaseUrl).toBeNull();
      }
    });

    it("lists the cheapest first", () => {
      const prices = all.map((p) => p.price.amountCents);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    it("filters by department and category", async () => {
      const { department, category } = all[0];
      const found = await catalog.search({ department, categories: [category] });
      expect(found.length).toBeGreaterThan(0);
      expect(found.every((p) => p.department === department && p.category === category)).toBe(true);
      expect(found.length).toBe(all.filter((p) => p.department === department && p.category === category).length);
    });

    it("filters by price, inclusive at both ends", async () => {
      const prices = all.map((p) => p.price.amountCents);
      const min = prices[Math.floor(prices.length / 4)];
      const max = prices[Math.floor((prices.length * 3) / 4)];
      const found = await catalog.search({ minPriceCents: min, maxPriceCents: max, limit: 10000 });
      expect(found.length).toBe(all.filter((p) => p.price.amountCents >= min && p.price.amountCents <= max).length);
      expect(found.some((p) => p.price.amountCents === min) && found.some((p) => p.price.amountCents === max)).toBe(true);
    });

    it("filters by size, and one-size products always match", async () => {
      const size = all.find((p) => p.variants.length > 1)!.variants[0].size;
      const found = await catalog.search({ sizes: [size.toLowerCase()], limit: 10000 });
      expect(found.length).toBeGreaterThan(0);
      for (const p of found) {
        expect(p.variants.some((v) => v.size.toLowerCase() === size.toLowerCase() || v.size.toLowerCase() === "one size")).toBe(true);
      }
      const oneSize = all.filter((p) => p.variants.some((v) => v.size.toLowerCase() === "one size"));
      expect(oneSize.every((p) => found.some((f) => f.id === p.id))).toBe(true);
    });

    it("filters by style tag and by a word in a color name, ignoring case", async () => {
      const tag = all[0].styleTags[0];
      const byTag = await catalog.search({ styleTags: [tag.toUpperCase()], limit: 10000 });
      expect(byTag.length).toBeGreaterThan(0);
      expect(byTag.every((p) => p.styleTags.some((t) => t.toLowerCase() === tag.toLowerCase()))).toBe(true);
      const word = all[0].colors[0].split(" ").pop()!;
      const byColor = await catalog.search({ colors: [word.toUpperCase()], limit: 10000 });
      expect(byColor.some((p) => p.id === all[0].id)).toBe(true);
      expect(byColor.every((p) => p.colors.some((c) => c.toLowerCase().split(/\s+/).includes(word.toLowerCase())))).toBe(true);
    });

    it("leaves out excluded products and keeps to the limit", async () => {
      const found = await catalog.search({ excludeIds: [all[0].id], limit: 3 });
      expect(found).toHaveLength(Math.min(3, all.length - 1));
      expect(found.some((p) => p.id === all[0].id)).toBe(false);
    });

    it("gets one product by id, exactly as search returned it", async () => {
      const p = all[all.length - 1];
      expect(await catalog.getProduct(p.id)).toEqual(p);
    });

    it("returns nothing for an unknown or malformed id, without failing", async () => {
      expect(await catalog.getProduct(ZERO_ID)).toBeNull();
      expect(await catalog.getProduct("not-an-id'); drop table x;--")).toBeNull();
    });

    it("gives availability for every id asked for, in order, and never shows a product it can't sell as in stock", async () => {
      const ids = [all[0].id, ZERO_ID, "nonsense", all[1]?.id ?? all[0].id];
      const found = await catalog.getAvailability(ids);
      expect(found.map((a) => a.productId)).toEqual(ids);
      expect(found[1].status).toBe("unknown");
      expect(found[2].status).toBe("unknown");
      if (!catalog.capabilities().checkout) expect(found.every((a) => a.status !== "in_stock")).toBe(true);
    });
  });
}
