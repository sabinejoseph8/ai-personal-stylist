import { describe, expect, it } from "vitest";
import type { Product } from "@/connectors/catalog/types";
import type { ResolvedItem } from "@/core/looks/look";
import { revisionPlan } from "@/core/looks/revise";
import { ruledOut } from "@/core/looks/rules";
import { droppedWants, type RuledPreference, wantKey, wantMark, wantPieces, wantsFrom, wantsPlan } from "@/core/looks/wants";
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

  it("still holds for a later change of its kind of piece, once answered: Change under heels brings other heels (fix plan 9)", () => {
    const [want] = wantsFrom([note("a", "High heels")], [heels]);
    const heeled = [product(sleevedDress), product(stilettos), product(bag)];
    // Change under the shoes (from the look's feedback), with "High heels" already answered.
    const base = { ...revisionPlan(heeled, [], [], () => null), change: [1] };
    const plan = wantsPlan(base, heeled, [], [], [want]);
    expect(plan.change).toEqual([1]);
    expect(plan.wishes.map((w) => [w.group, w.test!(stilettos), w.test!(flats)])).toEqual([["shoes", true, false]]);
    expect(plan.asked).toEqual(["high heels"]);
    // A change to the bag isn't about shoes: no wish.
    expect(wantsPlan({ ...base, change: [2] }, heeled, [], [], [want]).wishes).toEqual([]);
    // Still asked when it's new to the look but its shoes are already heels, and only once when it's added too.
    expect(wantsPlan(base, heeled, [want], [], [want]).wishes).toHaveLength(1);
    const flat = [product(sleevedDress), product(flats), product(bag)];
    expect(wantsPlan({ ...revisionPlan(flat, [], [], () => null), change: [1] }, flat, [want], [], [want]).wishes).toHaveLength(1);
    // Not while it's being taken back.
    expect(wantsPlan(base, heeled, [], [want], [want]).wishes.every((w) => !w.test!(stilettos))).toBe(true);
  });

  it("is taken back when its note is removed while still allowed; once the preference applies again, the check does it", () => {
    const asked = note("a", "High heels");
    const answered = [wantKey({ noteId: "a", version: 1 })];
    const wants = wantsFrom([asked], [heels]);
    expect(droppedWants([asked], [heels], wants, answered)).toEqual([]);
    const removed = { ...asked, removed: true, version: 2 };
    expect(droppedWants([removed], [heels], [], answered).map((w) => w.words)).toEqual(["High heels"]);
    expect(droppedWants([removed], [], [], answered)).toEqual([]);
    // Another note still asks for the same thing (two "High heels" notes, one removed): nothing to take back.
    const twin = note("b", "High heels");
    expect(droppedWants([removed, twin], [heels], wantsFrom([twin], [heels]), answered)).toEqual([]);
  });
});

describe("a want by its mark (full code review, batch 3: B3, B4, C9)", () => {
  it("is recognised by its mark whatever its words, survives Save to my profile, and ends with Remove on its line", () => {
    const marked = note("n1", "Black high heels", { details: [wantMark(heels)] });
    expect(wantsFrom([marked], [heels])).toEqual([{ noteId: "n1", version: 1, words: "High heels", kind: "never", rule: heels.rule }]);
    // The preference deleted by Save to my profile: still a want, from the note's own mark.
    expect(wantsFrom([marked], [], new Set(["pref-sleeves"]))).toEqual([{ noteId: "n1", version: 1, words: "Black high heels", kind: "never", rule: heels.rule }]);
    // The preference still saved but no longer allowed (Remove on its line): not a want.
    expect(wantsFrom([marked], [], new Set(["pref-heels", "pref-sleeves"]))).toEqual([]);
    // A pencil note isn't one; a note without a mark is matched by its words, as before.
    expect(wantsFrom([note("n2", "Black high heels", { status: "to_confirm", details: [wantMark(heels)] })], [heels])).toEqual([]);
    expect(wantsFrom([note("n3", "High heels")], [heels])).toHaveLength(1);
    // A want taken back is found by its mark too.
    expect(droppedWants([{ ...marked, removed: true }], [heels], [], ["n1:1"]).map((w) => w.noteId)).toEqual(["n1"]);
    // A mark that isn't one is ignored, and so is one whose rule has no test (5d review).
    expect(wantsFrom([note("n4", "High heels", { details: [{ name: "want", value: "not json" }] })], [])).toEqual([]);
    const broken = JSON.stringify({ id: "pref-heels", kind: "never", rule: { type: "detail", categories: [], test: null } });
    expect(wantsFrom([note("n5", "High heels", { details: [{ name: "want", value: broken }] })], [], new Set())).toEqual([]);
  });
});
