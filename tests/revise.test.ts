import { describe, expect, it } from "vitest";
import type { Product } from "@/connectors/catalog/types";
import type { ResolvedItem } from "@/core/looks/look";
import { changeSummary, detailTest, lookFeedback, nothingFits, pendingFeedback, revisionPlan, seenOf, turnedDownIn } from "@/core/looks/revise";
import { lookTotal } from "@/core/looks/totals";
import { feedbackDetails } from "@/core/notes/feedback";
import type { FeedbackAct, FeedbackScope, Note } from "@/core/notes/types";
import { catalogProducts } from "./support/catalog-products";

// 5b: revising a look from its feedback (R48 to R50). Which lines a revision answers, what it keeps and
// changes, the details plain code can test, and the change summary's words.

const find = (test: (p: Product) => boolean) => catalogProducts.find((p) => p.department === "womenswear" && test(p))!;
const dress = find((p) => p.category === "dress");
const stilettos = find((p) => p.category === "shoes" && (p.details.heelCm ?? 0) > 5);
const flats = find((p) => p.category === "shoes" && (p.details.heelCm ?? 99) <= 2);
const bag = find((p) => p.category === "bag");
const product = (p: Product): ResolvedItem => ({ ref: { kind: "product", productId: p.id }, product: p });
const look = [product(dress), product(stilettos), product(bag)];

let n = 0;
const line = (text: string, act: FeedbackAct, items: string[], o: { slot?: number; scope?: FeedbackScope; about?: string; status?: Note["status"]; version?: number } = {}): Note => ({
  id: `n${++n}`,
  kind: "feedback",
  text,
  status: o.status ?? "confirmed",
  details: feedbackDetails({ look: o.slot ?? 1, items, act, scope: o.scope ?? "item" }, o.about),
  source: "voice",
  changedSeq: 1,
  version: o.version ?? 1,
  removed: false,
});

describe("which feedback a revision answers", () => {
  it("takes the confirmed lines on its own look, leaving pencil lines and every-look feedback out", () => {
    const notes = [
      line("Keep the dress", "keep", [dress.id]),
      line("Lower heels", "change", [stilettos.id], { about: "lower heel" }),
      line("Maybe the bag?", "change", [bag.id], { status: "to_confirm" }),
      line("Not these shoes", "dislike", [stilettos.id], { slot: 2 }),
      line("No high heels in any look", "change", [], { scope: "session", about: "high heel" }),
    ];
    expect(lookFeedback(notes, 1).map((l) => l.text)).toEqual(["Keep the dress", "Lower heels"]);
  });

  it("is due for change and dislike lines it hasn't seen: Keep alone changes nothing (Q1)", () => {
    const lines = lookFeedback([line("Keep the dress", "keep", [dress.id]), line("Lower heels", "change", [stilettos.id])], 1);
    expect(pendingFeedback(lines, []).map((l) => l.text)).toEqual(["Lower heels"]);
    expect(pendingFeedback(lines, seenOf(lines))).toEqual([]);
    // A voice correction makes a new version, so it's due again.
    const corrected = lookFeedback([line("Keep the dress", "keep", [dress.id]), { ...line("Closed toe", "change", [stilettos.id]), id: lines[1].id, version: 2 }], 1);
    expect(pendingFeedback(corrected, seenOf(lines)).map((l) => l.text)).toEqual(["Closed toe"]);
  });

  it("turns down only the pieces named, unless kept since (R48)", () => {
    const lines = lookFeedback([line("Not these shoes", "dislike", [stilettos.id]), line("Change the bag", "change", [bag.id]), line("Keep the bag", "keep", [bag.id])], 1);
    expect([...turnedDownIn(lines)]).toEqual([stilettos.id]);
  });
});

describe("what a revision does", () => {
  it("changes the pieces named, keeps the kept ones, and carries every detail asked for into later rounds", () => {
    const lines = lookFeedback([line("Keep the dress and bag", "keep", [dress.id, bag.id]), line("Lower heels", "change", [stilettos.id], { about: "lower heel" })], 1);
    const plan = revisionPlan(look, lines, pendingFeedback(lines, []), () => null);
    expect(plan.change).toEqual([1]);
    expect([...plan.keep]).toEqual([dress.id, bag.id]);
    expect(plan.whole).toBe(false);
    expect(plan.asked).toEqual(["lower heel"]);
    expect(plan.notes).toEqual([`For this look, the shopper asked: lower heel than the ${stilettos.name} (heel ${stilettos.details.heelCm} cm)`]);
    expect(plan.wishes[0].test!(flats)).toBe(true);
    expect(plan.wishes[0].test!(stilettos)).toBe(false);
  });

  it("never changes a kept piece, and a change to the whole look goes to the builder", () => {
    const keepAll = lookFeedback([line("Keep the dress", "keep", [dress.id]), line("Change the dress", "change", [dress.id])], 1);
    expect(revisionPlan(look, keepAll, pendingFeedback(keepAll, []), () => null).change).toEqual([]);
    const whole = lookFeedback([line("I don't like this look", "dislike", [], { scope: "look" })], 1);
    expect(revisionPlan(look, whole, pendingFeedback(whole, []), () => null).whole).toBe(true);
  });

  it("tests the details the catalog records, and leaves the rest to the judgment step", () => {
    expect(detailTest("lower heel", stilettos)!(flats)).toBe(true);
    expect(detailTest("lower heel", stilettos)!(stilettos)).toBe(false);
    const closed = detailTest("closed toe", null)!;
    expect(catalogProducts.filter((p) => p.category === "shoes").every((p) => closed(p) === (p.details.toe === "closed"))).toBe(true);
    expect(detailTest("with sleeves", null)!(dress)).toBe(Boolean(dress.details.sleeve) && dress.details.sleeve !== "sleeveless");
    expect(detailTest("something more festive", null)).toBeNull();
  });
});

describe("the change summary (R50)", () => {
  it("says what changed and why, what was kept, and the new total", () => {
    const after = [product(dress), product(flats), product(bag)];
    const total = lookTotal(after.map((i) => ({ owned: false as const, priceCents: (i as { product: Product }).product.price.amountCents })), { meaning: "up_to", amount: 1000, from: "notes" });
    expect(changeSummary(look, after, total, ["lower heel"])).toBe(
      `Changed: ${stilettos.name} to ${flats.name} (you asked for lower heel). Kept: ${dress.name} and ${bag.name}. New total: ${total.toBuy.split(" ")[0]}, ${total.comparison}.`,
    );
  });

  it("says plainly when nothing fits, so the look stays", () => {
    const lines = lookFeedback([line("Closed toe", "change", [stilettos.id], { about: "closed toe" })], 1);
    expect(nothingFits(look, revisionPlan(look, lines, lines, () => null))).toBe("No other shoes fit everything you've asked for (closed toe), so these stay.");
    const bagLines = lookFeedback([line("Change the bag", "change", [bag.id])], 1);
    expect(nothingFits(look, revisionPlan(look, bagLines, bagLines, () => null))).toBe("No other bag fits everything you've asked for, so this one stays.");
    // When the budget is the limit, or the checks couldn't run, it says so (Sabine's answer to Q4 in 5c).
    const plan = revisionPlan(look, lines, lines, () => null);
    expect(nothingFits(look, plan, { budget: "your $500 limit" })).toBe("No other shoes fit within your $500 limit with the rest of this look, so these stay.");
    expect(nothingFits(look, plan, { unchecked: true })).toBe("The new shoes couldn't be checked just now, so these stay. Try again in a moment.");
  });
});

describe("feedback on a piece that has left the look (full code review, batch 4, C7)", () => {
  it("changes the piece of that kind now in the look, not the whole look", () => {
    // The shopper swapped the stilettos for flats, and in the same breath asked for lower heels of the stilettos.
    const now = [product(dress), product(flats), product(bag)];
    const byId = (id: string) => catalogProducts.find((p) => p.id === id) ?? null;
    const lower = line("Lower heels", "change", [stilettos.id], { about: "lower heel" });
    const lines = lookFeedback([lower], 1);
    const plan = revisionPlan(now, lines, lines, byId);
    expect(plan.whole).toBe(false);
    expect(plan.change).toEqual([1]);
    expect(plan.wishes.map((w) => w.group)).toEqual(["shoes"]);
    // With the piece of that kind kept, there's nothing of its kind to change: the builder makes a whole new look.
    const withKeep = lookFeedback([line("Keep the flats", "keep", [flats.id]), lower], 1);
    const kept = revisionPlan(now, withKeep, withKeep.filter((l) => l.act === "change"), byId);
    expect(kept.change).toEqual([]);
    expect(kept.whole).toBe(true);
  });
});
