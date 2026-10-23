import { describe, expect, it } from "vitest";
import type { Product } from "@/connectors/catalog/types";
import type { ResolvedItem } from "@/core/looks/look";
import { revisionPlan } from "@/core/looks/revise";
import { ruledOut } from "@/core/looks/rules";
import { droppedWants, type RuledPreference, wantKey, wantPieces, wantsFrom, wantsPlan } from "@/core/looks/wants";
import type { Note } from "@/core/notes/types";
import { catalogProducts } from "./support/catalog-products";

// 5c fix 6: what the shopper asked for once allowed ("High heels") changes only the pieces it's about,
// like Change, rather than failing every look and building three new ones (found on Sabine's iPhone in
// 5c, A.5). Taken back, those pieces change back.

const find = (test: (p: Product) => boolean) => catalogProducts.find((p) => p.department === "womenswear" && test(p))!;
const sleevedDress = find((p) => p.category === "dress" && Boolean(p.details.sleeve) && p.details.sleeve !== "sleeveless");
const blazer = find((p) => p.category === "blazer" && Boolean(p.details.sleeve) && p.details.sleeve !== "sleeveless");
const stilettos = find((p) => p.category === "shoes" && (p.details.heelCm ?? 0) > 5);
const flats = find((p) => p.category === "shoes" && (p.details.heelCm ?? 99) <= 2);
const bag = find((p) => p.category === "bag");
const product = (p: Product): ResolvedItem => ({ ref: { kind: "product", productId: p.id }, product: p });

const heels: RuledPreference = { id: "pref-heels", kind: "never", words: "high heels", rule: { type: "detail", categories: ["shoes"], test: { op: "over", value: 5, detail: "heelCm" } } };
const sleeves: RuledPreference = {
  id: "pref-sleeves",
  kind: "must_have",
  words: "sleeves",
  rule: { type: "detail", categories: [], test: { op: "one_of", detail: "sleeve", values: ["cap", "short", "elbow", "three_quarter", "long"] } },
};
const judged: RuledPreference = { id: "pref-loud", kind: "never", words: "anything loud", rule: { type: "judged" } };

const note = (id: string, text: string, o: Partial<Note> = {}): Note => ({ id, kind: "style", text, status: "confirmed", details: [], source: "touch", changedSeq: 1, version: 1, removed: false, ...o });

describe("what the shopper asked for once allowed (5c fix 6)", () => {
  it("is a confirmed note naming a preference allowed for this session, with a rule code can test", () => {
    const notes = [note("a", "High heels"), note("b", "Without sleeves", { status: "to_confirm" }), note("c", "Anything loud"), note("d", "Elegant")];
    expect(wantsFrom(notes, [heels, sleeves, judged]).map((w) => [w.noteId, w.words, w.kind])).toEqual([["a", "High heels", "never"]]);
    // Not allowed for this session: an ordinary note.
    expect(wantsFrom(notes, [sleeves])).toEqual([]);
    expect(wantsFrom([note("a", "High heels", { removed: true })], [heels])).toEqual([]);
  });

  it("is what the rule rules out: high heels for Never: high heels, and nothing for a detail not recorded", () => {
    expect(ruledOut("never", heels.rule, stilettos)).toBe(true);
    expect(ruledOut("never", heels.rule, flats)).toBe(false);
    expect(ruledOut("never", heels.rule, bag)).toBeNull();
    expect(ruledOut("must_have", sleeves.rule, sleevedDress)).toBe(false);
    expect(ruledOut("never", heels.rule, { ...stilettos, details: { ...stilettos.details, heelCm: undefined } })).toBeNull();
  });

  it("changes only the pieces of its kind that aren't yet what's asked, never kept ones, and a jacket keeps its sleeves", () => {
    const [want] = wantsFrom([note("a", "High heels")], [heels]);
    const look = [product(sleevedDress), product(flats), product(bag)];
    expect(wantPieces(look, want, new Set())).toEqual([1]);
    expect(wantPieces([product(sleevedDress), product(stilettos)], want, new Set())).toEqual([]);
    expect(wantPieces(look, want, new Set([flats.id]))).toEqual([]);
    // Taken back: the pieces that are what was asked change.
    expect(wantPieces([product(sleevedDress), product(stilettos)], want, new Set(), false)).toEqual([1]);
    const [noSleeves] = wantsFrom([note("b", "Without sleeves")], [sleeves]);
    expect(wantPieces([product(sleevedDress), product(blazer), product(flats)], noSleeves, new Set())).toEqual([0]);
  });

  it("makes a revision plan whose replacements are what's asked, with the reason in the change summary", () => {
    const [want] = wantsFrom([note("a", "High heels")], [heels]);
    const look = [product(sleevedDress), product(flats), product(bag)];
    const plan = wantsPlan(revisionPlan(look, [], [], () => null), look, [want], []);
    expect(plan.change).toEqual([1]);
    expect(plan.asked).toEqual(["high heels"]);
    expect(plan.wishes.map((w) => [w.group, w.test!(stilettos), w.test!(flats)])).toEqual([["shoes", true, false]]);
    expect(plan.notes).toEqual(["For this look, the shopper asked for high heels, allowed for this session"]);
    // Taken back, the replacement mustn't be high heels.
    const heeled = [product(sleevedDress), product(stilettos), product(bag)];
    const back = wantsPlan(revisionPlan(heeled, [], [], () => null), heeled, [], [want]);
    expect(back.change).toEqual([1]);
    expect(back.asked).toEqual([]);
    expect(back.wishes[0].test!(flats)).toBe(true);
    expect(back.wishes[0].test!(stilettos)).toBe(false);
  });

  it("is taken back when its note is removed while still allowed; once the preference applies again, the check does it", () => {
    const asked = note("a", "High heels");
    const answered = [wantKey({ noteId: "a", version: 1 })];
    const wants = wantsFrom([asked], [heels]);
    expect(droppedWants([asked], [heels], wants, answered)).toEqual([]);
    const removed = { ...asked, removed: true, version: 2 };
    expect(droppedWants([removed], [heels], [], answered).map((w) => w.words)).toEqual(["High heels"]);
    expect(droppedWants([removed], [], [], answered)).toEqual([]);
  });
});
