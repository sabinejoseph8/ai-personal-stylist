import { describe, expect, it } from "vitest";
import { budgetFrom, compareWithBudget } from "@/core/looks/budget";
import { lookTotal } from "@/core/looks/totals";
import type { Note } from "@/core/notes/types";

// 4a: the budget a look must fit, and its total without owned items (R42; Phase 4 automated test:
// totals leave out owned items).

const budgetNote = (details: [string, string][], status: Note["status"] = "confirmed"): Note => ({
  id: "b",
  kind: "budget",
  text: "Budget",
  status,
  details: details.map(([name, value]) => ({ name, value })),
  source: "voice",
  changedSeq: 1,
  version: 1,
  removed: false,
});

describe("which budget counts", () => {
  it("a confirmed budget note beats the profile's default; one still To confirm doesn't", () => {
    const profile = { meaning: "up_to" as const, amount: 400 };
    expect(budgetFrom([budgetNote([["max", "350"]])], profile)).toEqual({ meaning: "up_to", amount: 350, from: "notes" });
    expect(budgetFrom([budgetNote([["max", "350"]], "to_confirm")], profile)).toEqual({ meaning: "up_to", amount: 400, from: "profile" });
    expect(budgetFrom([budgetNote([["min", "200"], ["max", "300"]])], null)).toEqual({ meaning: "between", amount: 200, max: 300, from: "notes" });
    expect(budgetFrom([budgetNote([["around", "300"]])], null)).toEqual({ meaning: "around", amount: 300, from: "notes" });
    expect(budgetFrom([], null)).toBeNull();
  });
});

describe("totals (R42)", () => {
  const limit = { meaning: "up_to" as const, amount: 350, from: "notes" as const };

  it("leave out owned items: the photo item and wardrobe items", () => {
    const total = lookTotal([{ owned: false, priceCents: 21200 }, { owned: true }, { owned: false, priceCents: 10000 }, { owned: true }], limit);
    expect(total).toEqual({ totalCents: 31200, toBuy: "$312 to buy, owned items not included", comparison: "$38 under your $350 limit", fits: true });
  });

  it("compare with each kind of budget, in the design's words", () => {
    expect(compareWithBudget(37000, limit)).toEqual({ fits: false, words: "$20 over your $350 limit" });
    expect(compareWithBudget(35000, limit)).toEqual({ fits: true, words: "Right at your $350 limit" });
    // "Around" allows up to 10% over (Sabine's Q2).
    const around = { meaning: "around" as const, amount: 300, from: "notes" as const };
    expect(compareWithBudget(32000, around)).toEqual({ fits: true, words: "$20 over your budget of around $300" });
    expect(compareWithBudget(34000, around)).toEqual({ fits: false, words: "$40 over your budget of around $300" });
    const between = { meaning: "between" as const, amount: 200, max: 300, from: "profile" as const };
    expect(compareWithBudget(25000, between)).toEqual({ fits: true, words: "Within your $200 to $300 budget" });
    expect(compareWithBudget(15000, between)).toEqual({ fits: true, words: "$50 under your $200 to $300 budget" });
    expect(compareWithBudget(31050, between)).toEqual({ fits: false, words: "$10.50 over your $200 to $300 budget" });
    expect(compareWithBudget(99900, null)).toEqual({ fits: true, words: null });
  });
});
