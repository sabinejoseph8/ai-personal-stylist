import { describe, expect, it } from "vitest";
import type { Product } from "@/connectors/catalog/types";
import { builderPrompt, createFakeLooksBuilder, looksFrom } from "@/core/looks/builder";
import { type FirmRule, filterCandidates, type Requirements } from "@/core/looks/candidates";
import { codeCheck } from "@/core/looks/checker";
import { createFakeJudge, verdictFrom } from "@/core/looks/judge";
import type { OwnedPiece, ResolvedItem } from "@/core/looks/look";
import { explainNoMatch } from "@/core/looks/no-match";
import { looksReadiness } from "@/core/looks/readiness";
import { describeRule } from "@/core/looks/rules";
import type { Note } from "@/core/notes/types";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { catalogProducts } from "./support/catalog-products";

// 4b: the preference checker's rules in code (R54 to R56), when looks are built (R39), the builder's
// numbers, the judgment step's verdict, and the no-match explanation (R45, R59). Phase 4 automated
// test: with "Never: high heels" saved, a look with an unknown heel height fails.

const rules: FirmRule[] = SAMPLE_PROFILE.preferences.flatMap((p) => (p.kind === "likes" ? [] : [{ kind: p.kind, words: p.words, rule: p.rule!, from: "profile" as const }]));
const req: Requirements = { departments: ["womenswear"], categories: null, sizes: {}, budget: { meaning: "up_to", amount: 350, from: "notes" }, rules };
const find = (test: (p: Product) => boolean) => catalogProducts.find((p) => p.department === "womenswear" && test(p))!;
const sleevedDress = find((p) => p.category === "dress" && p.details.sleeve !== "sleeveless" && p.price.amountCents <= 20000);
const flats = find((p) => p.category === "shoes" && (p.details.heelCm ?? 99) <= 2 && p.price.amountCents <= 10000);
const heels = find((p) => p.category === "shoes" && (p.details.heelCm ?? 0) > 5);
const bag = find((p) => p.category === "bag" && p.price.amountCents <= 8000);
const product = (p: Product): ResolvedItem => ({ ref: { kind: "product", productId: p.id }, product: p });
const blazer: OwnedPiece = { ref: { kind: "photo", photoId: "photo-1", version: 1 }, name: "Navy wool blazer", group: "outer", words: "blazer, navy" };
const check = (items: ResolvedItem[], extra: Partial<Parameters<typeof codeCheck>[0]> = {}) => codeCheck({ items, requirements: req, anchor: null, wardrobePicks: [], ...extra });
const failing = (r: ReturnType<typeof codeCheck>) => r.reasons.filter((x) => !x.ok).map((x) => x.why);

describe("the preference checker's rules in code", () => {
  it("passes a complete look that meets every rule, and records each rule it checked", () => {
    const r = check([product(sleevedDress), product(flats), product(bag)]);
    expect(failing(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.reasons.map((x) => x.about)).toEqual(expect.arrayContaining(["Never: high heels", "Must have: sleeves", "Budget", "Outfit"]));
  });

  it("fails high heels under Never: high heels, naming the product", () => {
    const r = check([product(sleevedDress), product(heels)]);
    expect(r.ok).toBe(false);
    expect(failing(r)).toContain(`${heels.name}: Breaks Never: high heels (${describeRule("never", rules[0].rule)})`);
    expect(r.failedProducts).toEqual([heels.id]);
  });

  it("fails shoes with an unknown heel height under Never: high heels (Phase 4 test, R56)", () => {
    const unknown = { ...flats, details: { ...flats.details, heelCm: undefined } };
    expect(failing(check([product(sleevedDress), product(unknown)]))).toContain(`${flats.name}: Missing a detail that Never: high heels needs`);
  });

  it("fails a look over the budget, though each item fits", () => {
    const pricey = (p: Product) => ({ ...p, price: { amountCents: 20000, currency: "USD" } });
    expect(failing(check([product(pricey(sleevedDress)), product(pricey(flats))]))).toContain("$50 over your $350 limit");
  });

  it("fails a look without the shopper's own item to style around, or with a photo item that isn't theirs", () => {
    const anchor = { photoId: "photo-1", version: 1, name: "Navy wool blazer", owned: true };
    expect(failing(check([product(sleevedDress), product(flats)], { anchor }))).toContain("Leaves out your Navy wool blazer");
    expect(check([product(sleevedDress), product(flats), { ref: blazer.ref, owned: blazer }], { anchor }).ok).toBe(true);
    expect(failing(check([product(sleevedDress), product(flats), { ref: blazer.ref, owned: blazer }], { anchor: { ...anchor, owned: false } }))).toContain(
      "Uses a photo item that isn't yours to style around",
    );
  });

  it("fails a wardrobe item the shopper didn't choose, an incomplete outfit, and the same item twice", () => {
    const sneakers: OwnedPiece = { ref: { kind: "wardrobe", itemId: "w-1" }, name: "White sneakers", group: "shoes", words: "sneakers" };
    expect(failing(check([product(sleevedDress), { ref: sneakers.ref, owned: sneakers }]))).toContain("Uses a wardrobe item you didn't choose to style with");
    expect(check([product(sleevedDress), { ref: sneakers.ref, owned: sneakers }], { wardrobePicks: ["w-1"] }).ok).toBe(true);
    expect(failing(check([product(sleevedDress), product(bag)]))).toContain("No shoes");
    expect(failing(check([product(sleevedDress), product(flats), product(flats)]))).toContain("The same item twice");
    const top = find((p) => p.category === "top" && p.details.sleeve !== "sleeveless");
    expect(failing(check([product(top), product(flats)]))).toContain("Not a complete outfit: it needs a dress, a suit, or a top with something on the bottom");
  });
});

describe("when looks are built (R39)", () => {
  const note = (kind: Note["kind"], status: Note["status"], details: [string, string][] = []): Note => ({
    id: `${kind}${status}`,
    kind,
    text: kind,
    status,
    details: details.map(([name, value]) => ({ name, value })),
    source: "voice",
    changedSeq: 1,
    version: 1,
    removed: false,
  });

  it("waits for a confirmed occasion, and for any stated budget, colors to avoid or outfit to be confirmed", () => {
    expect(looksReadiness([])).toEqual({ ready: false, needs: "Tell the stylist the occasion to see looks" });
    expect(looksReadiness([note("occasion", "to_confirm")])).toEqual({ ready: false, needs: "Confirm the occasion to see looks" });
    expect(looksReadiness([note("occasion", "confirmed"), note("budget", "to_confirm")])).toEqual({ ready: false, needs: "Confirm your budget to see looks" });
    expect(looksReadiness([note("occasion", "confirmed"), note("colors", "to_confirm", [["avoid", "black"]])])).toEqual({ ready: false, needs: "Confirm the colors to avoid to see looks" });
    expect(looksReadiness([note("occasion", "confirmed"), note("style", "to_confirm")])).toEqual({ ready: true });
  });
});

describe("the looks builder's numbers", () => {
  it("lists products by number only, and drops a look that uses a number it wasn't given", () => {
    const { user, ids } = builderPrompt({ products: [sleevedDress, flats], owned: [blazer], mustUse: [blazer.ref], inspiration: null, notes: ["Outdoor wedding, November"], budget: "up to $350", likes: [], judged: [], avoid: [] });
    expect(user).toContain(`p1: ${sleevedDress.name}`);
    expect(user).toContain("o1: Navy wool blazer (blazer, navy) (must use)");
    expect(user).not.toContain(sleevedDress.id);
    const looks = looksFrom({ l: [{ n: "Garden ceremony", r: "Elegant for a wedding.", i: ["p1", "p2", "o1"] }, { n: "Made up", r: "x", i: ["p1", "p9"] }] }, ids);
    expect(looks).toEqual([{ name: "Garden ceremony", reason: "Elegant for a wedding.", items: [{ kind: "product", productId: sleevedDress.id }, { kind: "product", productId: flats.id }, blazer.ref] }]);
  });

  it("the fake builder for tests makes complete looks with the shopper's own item", async () => {
    const { kept } = filterCandidates(catalogProducts, req);
    const { looks } = await createFakeLooksBuilder().build({ products: kept, owned: [blazer], mustUse: [blazer.ref], inspiration: null, notes: [], budget: null, likes: [], judged: [], avoid: [] });
    expect(looks).toHaveLength(5);
    for (const look of looks) expect(look.items[0]).toEqual(blazer.ref);
  });
});

describe("the judgment step's verdict", () => {
  it("can't pass with a failed point, and keeps its reasons", () => {
    expect(verdictFrom({ v: "pass", r: [{ a: "Never: anything too flashy", ok: false, w: "Sequins" }] }).verdict).toBe("conflict");
    expect(verdictFrom({ v: "clarify", r: [] }).verdict).toBe("needs_clarification");
    expect(verdictFrom({ v: "pass", r: [{ a: "Outdoor wedding, November", ok: true, w: "Warm enough" }] })).toEqual({
      verdict: "pass",
      reasons: [{ about: "Outdoor wedding, November", ok: true, why: "Warm enough" }],
    });
  });

  it("the fake judge for tests fails sequins under a 'flashy' preference", async () => {
    const sequins = find((p) => /sequin/i.test(`${p.details.material} ${p.details.pattern}`));
    const result = await createFakeJudge().judge({ items: [product(sequins)], notes: [], judged: ["Never: anything too flashy"], inspiration: null });
    expect(result.verdict).toBe("conflict");
  });
});

describe("the no-match explanation (R45, R59)", () => {
  it("names the requirement that limits the looks, with choices", () => {
    const tight: Requirements = { ...req, categories: ["dress", "shoes", "bag"], budget: { meaning: "up_to", amount: 60, from: "notes" } };
    const { kept, leftOut } = filterCandidates(catalogProducts, tight);
    expect(explainNoMatch(tight, kept, leftOut, 0)).toEqual({ message: expect.stringMatching(/^Only \d dresses fit under your \$60 limit\.$/), choices: ["Raise the budget", "Try another outfit"] });
    const sized: Requirements = { ...req, categories: ["dress", "shoes", "bag"], sizes: { dress: "18" } };
    const s = filterCandidates(catalogProducts, sized);
    expect(explainNoMatch(sized, s.kept, s.leftOut, 0).message).toBe("Only 0 dresses come in your size.");
    const { kept: all, leftOut: none } = filterCandidates(catalogProducts, req);
    expect(explainNoMatch(req, all, none, 2)).toEqual({ message: "I found 2 looks that meet everything you've asked for.", choices: ["Change a requirement", "Try again"] });
  });
});
