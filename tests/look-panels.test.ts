import { describe, expect, it } from "vitest";
import type { Product } from "@/connectors/catalog/types";
import type { BudgetLimit } from "@/core/looks/budget";
import { looksChanged, looksForStylist } from "@/core/looks/context";
import type { ResolvedItem } from "@/core/looks/look";
import type { ShownLook } from "@/core/looks/shown";
import { noOtherPiece, swapCandidates } from "@/core/looks/swap";
import { catalogProducts } from "./support/catalog-products";

// 4c: the plain code behind the look panels: which replacements Swap checks first (R43, Sabine's answer
// to Q1), and what the stylist is told about the looks on screen and what changed (R44, Q4).

const women = catalogProducts.filter((p) => p.department === "womenswear");
const bySlug = (slug: string) => catalogProducts.find((p) => p.id === slug)!;
const item = (p: Product): ResolvedItem => ({ ref: { kind: "product", productId: p.id }, product: p });
const budget: BudgetLimit = { meaning: "up_to", amount: 350, from: "notes" };

describe("Swap's replacements", () => {
  const look = [item(bySlug("w-emerald-satin-midi-dress")), item(bySlug("w-nude-slingback-flats")), item(bySlug("w-pearl-drop-earrings"))];

  it("are the same kind of piece, not in the look or tried before, and keep the look within budget", () => {
    const shoes = swapCandidates(women, look, 1, new Set(["w-tan-leather-loafers"]), budget);
    expect(shoes.length).toBeGreaterThan(2);
    for (const p of shoes) {
      expect(p.category).toBe("shoes");
      expect(p.id).not.toBe("w-nude-slingback-flats");
      expect(p.id).not.toBe("w-tan-leather-loafers");
      expect(18900 + 4900 + p.price.amountCents).toBeLessThanOrEqual(35000);
    }
    // A tighter budget leaves fewer.
    expect(swapCandidates(women, look, 1, new Set(), { ...budget, amount: 300 }).length).toBeLessThan(swapCandidates(women, look, 1, new Set(), budget).length);
  });

  it("put colors already in the look first, then neutrals", () => {
    const [best] = swapCandidates(women, look, 1, new Set(), budget);
    expect(best.colors.join(" ")).toMatch(/emerald|green|pearl|white/);
  });

  it("are none for the shopper's own piece, which can't be swapped", () => {
    const owned: ResolvedItem = { ref: { kind: "photo", photoId: "p", version: 1 }, owned: { ref: { kind: "photo", photoId: "p", version: 1 }, name: "Navy wool blazer", group: "outer", words: "blazer, navy" } };
    expect(swapCandidates(women, [owned, ...look], 0, new Set(), budget)).toEqual([]);
    expect(noOtherPiece(look[1])).toBe("No other shoes fit everything you've asked for, so these stay.");
    expect(noOtherPiece(look[0])).toBe("No other dresses fit everything you've asked for, so this one stays.");
  });
});

describe("what the stylist is told about the looks", () => {
  const shown = (id: string, name: string, current = true): ShownLook => ({
    id,
    slot: 1,
    name,
    reason: "Emerald satin for an autumn wedding.",
    items: [
      { kind: "product", id: "d", group: "dress", name: "Emerald satin midi dress", category: "dress", owned: false, priceCents: 18900, imageUrl: null, imageAlt: "" },
      { kind: "photo", id: "p", group: "outer", name: "Navy wool blazer", category: "outer", owned: true, priceCents: null, imageUrl: null, imageAlt: "" },
    ],
    total: { totalCents: 18900, toBuy: "$189 to buy, owned items not included", comparison: "$161 under your $350 limit", fits: true },
    current,
  });

  it("lists the looks with their pieces, totals and reasons, which one is on screen, and how to present them (Q4)", () => {
    const told = looksForStylist({ looks: [shown("a", "Garden ceremony"), shown("b", "Velvet evening", false)], building: false, needs: null, noMatch: null, inView: 2 });
    expect(told).toContain('- Look 1, "Garden ceremony": Emerald satin midi dress, Navy wool blazer (the shopper\'s own). $189 to buy, owned items not included, $161 under your $350 limit.');
    expect(told).toContain("(being checked again after a change)");
    expect(told).toContain("The shopper is looking at Look 2.");
    expect(told).toContain("keep it short");
    expect(told).toContain("If they don't say which look and no look is on their screen, ask which one.");
  });

  it("says what's needed, that looks are coming, or why there are fewer than three (R39, R45, R59)", () => {
    expect(looksForStylist({ looks: [], building: false, needs: "Confirm your budget to see looks", noMatch: null, inView: null })).toBe('Looks: none yet. The shopper\'s screen says "Confirm your budget to see looks".');
    expect(looksForStylist({ looks: [], building: true, needs: null, noMatch: null, inView: null })).toMatch(/putting them together now/);
    const fewer = looksForStylist({ looks: [shown("a", "Garden ceremony")], building: false, needs: null, noMatch: { message: "Only 1 dress fits under your $90 limit.", choices: ["Raise the budget", "Try another outfit"] }, inView: null });
    expect(fewer).toContain("Only 1 look meets everything. Only 1 dress fits under your $90 limit. Explain this briefly and offer the choices: Raise the budget, Try another outfit.");
  });

  it("says what changed after a change, look by look (R44)", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => shown(id, id));
    expect(looksChanged([a, b, c], [a, d, c])).toBe("After the shopper's change: Look 2 is new, because the look there no longer met everything; Looks 1 and 3 still meet everything.");
    expect(looksChanged([a, b, c], [a, b, c])).toBe("After the shopper's change, every look still meets everything they've asked for.");
    expect(looksChanged([a, b, c], [a, b])).toBe("After the shopper's change: Looks 1 and 2 still meet everything; there are now 2 instead of 3.");
  });

  it("says what a revision changed, or why it couldn't be made, and which look is being revised (5b, R49, R50)", () => {
    const a = shown("a", "Garden ceremony");
    const change = "Changed: Black stiletto pumps to Nude slingback flats (you asked for lower heel). Kept: Emerald satin midi dress. New total: $288, $62 under your $350 limit.";
    const revised: ShownLook = { ...shown("a2", "Garden ceremony"), change, changed: [1] };
    expect(looksChanged([a], [revised])).toBe(`Look 1 is revised from the shopper's feedback. ${change} Say what changed in a few words.`);
    const stayed: ShownLook = { ...a, note: "No other shoes fit everything you've asked for (closed toe), so these stay." };
    expect(looksChanged([a], [stayed])).toBe(
      "Look 1 couldn't be revised as they asked: No other shoes fit everything you've asked for (closed toe), so these stay. Explain briefly, and if their budget or another requirement is what blocks it, ask which they'd rather change.",
    );
    const told = looksForStylist({ looks: [revised], building: false, needs: null, noMatch: null, inView: 1, revising: [1], feedback: [{ look: 1, text: "Lower heels", confirmed: true }] });
    expect(told).toContain(`  Revised from their feedback. ${change}`);
    expect(told).toContain("Look 1 is being revised from their feedback right now.");
    expect(told).toContain("revises that look by itself");
  });
});
