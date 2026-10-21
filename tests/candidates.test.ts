import { describe, expect, it } from "vitest";
import { type FirmRule, filterCandidates, noteRules, outfitCategories, type Requirements, sizeFieldOf } from "@/core/looks/candidates";
import type { Note } from "@/core/notes/types";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { catalogProducts } from "./support/catalog-products";

// 4a: the candidate filter (R40, R54 to R56, tech spec 1.3 step 2), on the real sample catalog.

const note = (kind: Note["kind"], text: string, details: [string, string][], status: Note["status"] = "confirmed"): Note => ({
  id: text,
  kind,
  text,
  status,
  details: details.map(([name, value]) => ({ name, value })),
  source: "voice",
  changedSeq: 1,
  version: 1,
  removed: false,
});
const sampleRules: FirmRule[] = SAMPLE_PROFILE.preferences.flatMap((p) => (p.kind === "likes" ? [] : [{ kind: p.kind, words: p.words, rule: p.rule!, from: "profile" as const }]));
const open: Requirements = { departments: [], categories: null, sizes: {}, budget: null, rules: [] };
const reasonFor = (leftOut: { productId: string; reason: string }[], slug: string) => leftOut.find((l) => l.productId === slug)?.reason;

describe("the candidate filter", () => {
  it("keeps everything when nothing is asked for", () => {
    expect(filterCandidates(catalogProducts, open).kept).toHaveLength(catalogProducts.length);
  });

  it("the sample profile: womenswear, its sizes, its budget, and no high heels or sleeveless clothes", () => {
    const { kept, leftOut } = filterCandidates(catalogProducts, {
      departments: SAMPLE_PROFILE.departments,
      categories: null,
      sizes: SAMPLE_PROFILE.sizes,
      budget: { meaning: "up_to", amount: 400, from: "profile" },
      rules: sampleRules,
    });
    expect(kept.length).toBeGreaterThan(20);
    expect(kept.every((p) => p.department === "womenswear")).toBe(true);
    expect(kept.every((p) => p.price.amountCents <= 40000)).toBe(true);
    expect(kept.some((p) => p.category === "shoes" && (p.details.heelCm ?? 99) > 5)).toBe(false);
    expect(kept.some((p) => p.details.sleeve === "sleeveless")).toBe(false);
    // Dresses come in size 8 or are left out, with the reason recorded for Behind the scenes (4d).
    expect(kept.filter((p) => p.category === "dress").every((p) => p.variants.some((v) => v.size === "8"))).toBe(true);
    const heel = catalogProducts.find((p) => p.department === "womenswear" && (p.details.heelCm ?? 0) > 5)!;
    expect(reasonFor(leftOut, heel.id)).toBe("Breaks Never: high heels (No shoes with heels over 5 cm)");
    expect(leftOut.find((l) => l.reason.startsWith("Not womenswear"))).toBeTruthy();
  });

  it("a product missing a detail a rule needs is left out (R56)", () => {
    const shoe = catalogProducts.find((p) => p.category === "shoes")!;
    const missing = { ...shoe, details: { ...shoe.details, heelCm: undefined } };
    const { leftOut } = filterCandidates([missing], { ...open, rules: sampleRules });
    expect(leftOut[0].reason).toBe("Missing a detail that Never: high heels needs");
  });

  it("no single item costs more than the whole budget, and 'around' allows 10% over (Sabine's Q2)", () => {
    const priced = (cents: number) => ({ ...catalogProducts[0], id: `p${cents}`, price: { amountCents: cents, currency: "USD" } });
    const items = [priced(30000), priced(33000), priced(33100)];
    expect(filterCandidates(items, { ...open, budget: { meaning: "up_to", amount: 300, from: "notes" } }).kept.map((p) => p.id)).toEqual(["p30000"]);
    expect(filterCandidates(items, { ...open, budget: { meaning: "around", amount: 300, from: "notes" } }).kept.map((p) => p.id)).toEqual(["p30000", "p33000"]);
    expect(filterCandidates(items, { ...open, budget: { meaning: "between", amount: 200, max: 330, from: "profile" } }).kept).toHaveLength(2);
  });

  it("sizes: each category's own profile size, one-size items always fit, and a skipped size doesn't filter", () => {
    expect(sizeFieldOf("womenswear", "suit")).toBe("dress");
    expect(sizeFieldOf("menswear", "blazer")).toBe("suit");
    expect(sizeFieldOf("womenswear", "jeans")).toBe("bottoms");
    expect(sizeFieldOf("womenswear", "bag")).toBeNull();
    const { kept } = filterCandidates(catalogProducts, { ...open, departments: ["womenswear"], sizes: { shoes: "7" } });
    expect(kept.filter((p) => p.category === "bag").length).toBeGreaterThan(0);
    expect(kept.filter((p) => p.category === "shoes").every((p) => p.variants.some((v) => v.size === "7"))).toBe(true);
    expect(kept.some((p) => p.category === "dress")).toBe(true);
  });
});

describe("requirements from the session's notes", () => {
  it("a confirmed outfit picks its categories; one still To confirm, or unknown, doesn't filter (R40)", () => {
    expect(outfitCategories([note("outfit", "Dress", [["outfit", "dress"]])])).toEqual(expect.arrayContaining(["dress", "shoes", "bag", "coat"]));
    expect(outfitCategories([note("outfit", "Dress", [["outfit", "dress"]])])).not.toContain("trousers");
    expect(outfitCategories([note("outfit", "Pantsuit", [["outfit", "pantsuit"]])])).toEqual(expect.arrayContaining(["suit", "trousers", "shoes"]));
    expect(outfitCategories([note("outfit", "Dress", [["outfit", "dress"]], "to_confirm")])).toBeNull();
    expect(outfitCategories([note("outfit", "Jumpsuit", [["outfit", "jumpsuit"]])])).toBeNull();
  });

  it("a confirmed 'Not black' leaves out anything black; one still To confirm doesn't", () => {
    const rules = noteRules([note("colors", "Not black", [["avoid", "black"]]), note("colors", "Not red", [["avoid", "red"]], "to_confirm")]);
    expect(rules).toHaveLength(1);
    const { kept, leftOut } = filterCandidates(catalogProducts, { ...open, rules });
    expect(kept.some((p) => p.colors.some((c) => c.includes("black")))).toBe(false);
    expect(leftOut.every((l) => l.reason === "Breaks Not black (Nothing in black)")).toBe(true);
  });
});
