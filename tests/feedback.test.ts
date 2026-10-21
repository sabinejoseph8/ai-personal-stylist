import { describe, expect, it } from "vitest";
import { feedbackDetails, feedbackOf, touchFeedback } from "@/core/notes/feedback";
import { mergeNotes } from "@/core/notes/merge";
import { createNotesReader, type Ask, type LookForReader } from "@/core/notes/reader";
import { active, type Note } from "@/core/notes/types";

// 5a: feedback on a look, kept as notes (Sabine's answer to Q1): what it's about, Keep and Change by
// touch (Q3: jotted in ink), merging per look, and the notes reader turning spoken feedback into lines
// under the right look (R46, R47).

let ids = 0;
const newId = () => `id-${++ids}`;
const names = { dress: "Emerald satin midi dress", shoes: "Nude slingback flats", bag: "Emerald satin clutch" };
const note = (text: string, look: number, items: string[], act: "keep" | "change" | "like" | "dislike", status: Note["status"] = "confirmed"): Note => ({
  id: newId(),
  kind: "feedback",
  text,
  status,
  details: feedbackDetails({ look, items, act, scope: "item" }),
  source: "voice",
  changedSeq: 1,
  version: 1,
  removed: false,
});
const lines = (notes: Note[]) => active(notes).map((n) => [n.text, feedbackOf(n)?.look, feedbackOf(n)?.act, n.status, n.source]);

describe("feedback on a look", () => {
  it("knows its look, items, act and scope from its hidden details", () => {
    const n = note("Keep the dress and bag", 2, ["dress", "bag"], "keep");
    expect(feedbackOf(n)).toEqual({ look: 2, items: ["dress", "bag"], act: "keep", scope: "item" });
    expect(feedbackOf({ kind: "style", details: [] })).toBeNull();
  });

  it("Keep by touch jots its line in ink, and pressing it again takes it back (Q3 in 5a)", () => {
    const on = touchFeedback([], { look: 1, item: "dress", act: "keep", on: true, names }, 5, newId);
    expect(lines(on.notes)).toEqual([["Keep the emerald satin midi dress", 1, "keep", "confirmed", "touch"]]);
    const off = touchFeedback(on.notes, { look: 1, item: "dress", act: "keep", on: false, names }, 6, newId);
    expect(active(off.notes)).toEqual([]);
  });

  it("Change takes the item out of a line that keeps it, rewording that line", () => {
    const said = [note("Keep the dress and bag", 1, ["dress", "bag"], "keep")];
    const changed = touchFeedback(said, { look: 1, item: "bag", act: "change", on: true, names }, 5, newId);
    expect(lines(changed.notes)).toEqual([
      ["Keep the emerald satin midi dress", 1, "keep", "confirmed", "touch"],
      ["Change the emerald satin clutch", 1, "change", "confirmed", "touch"],
    ]);
  });

  it("is merged only with feedback on the same look, and never counts against the notes' limit", () => {
    const one = mergeNotes([], { add: [{ kind: "feedback", text: "Keep the dress", status: "confirmed", details: feedbackDetails({ look: 1, items: ["dress"], act: "keep", scope: "item" }) }], update: [], remove: [] }, 1, 12, newId);
    const two = mergeNotes(one.notes, { add: [{ kind: "feedback", text: "Keep the dress", status: "confirmed", details: feedbackDetails({ look: 2, items: ["dress-2"], act: "keep", scope: "item" }) }], update: [], remove: [] }, 2, 12, newId);
    expect(active(two.notes).map((n) => feedbackOf(n)?.look)).toEqual([1, 2]);
    // The same line in more words takes the place of the shorter one, on its own look.
    const more = mergeNotes(two.notes, { add: [{ kind: "feedback", text: "Keep the dress and bag", status: "confirmed", details: feedbackDetails({ look: 1, items: ["dress", "bag"], act: "keep", scope: "item" }) }], update: [], remove: [] }, 3, 12, newId);
    expect(active(more.notes).map((n) => [n.text, feedbackOf(n)?.look])).toEqual([
      ["Keep the dress and bag", 1],
      ["Keep the dress", 2],
    ]);
    // A full notebook still takes feedback.
    const full = Array.from({ length: 12 }, (_, i) => ({ ...note(`Note ${i}`, 1, [], "like"), kind: "style" as const, details: [] }));
    const added = mergeNotes(full, { add: [{ kind: "feedback", text: "Lower heels", status: "confirmed", details: feedbackDetails({ look: 1, items: [], act: "change", scope: "item" }) }], update: [], remove: [] }, 4, 12, newId);
    expect(active(added.notes).some((n) => n.kind === "feedback")).toBe(true);
  });
});

describe("the notes reader's feedback (R46, R47)", () => {
  const LOOKS: LookForReader[] = [1, 2].map((n) => ({
    number: n,
    slot: n + 1,
    name: `Look ${n}`,
    items: [
      { id: `dress-${n}`, name: `Dress ${n}`, group: "dress", owned: false },
      { id: `shoes-${n}`, name: `Shoes ${n}`, group: "shoes", owned: false },
    ],
  }));
  const reading = (add: unknown[]) => {
    const prompts: string[] = [];
    const ask: Ask = async ({ system }) => (prompts.push(system), { data: { add, update: [], remove: [], q: { t: "", o: [] }, w: { l: 0, p: "" } }, costUsd: 0 });
    return { reader: createNotesReader(ask), prompts };
  };

  it("lists each look's items by code, and turns a line's look number and codes into its place and items", async () => {
    const { reader, prompts } = reading([{ k: "feedback", t: "Keep the dress", d: ["look=2", "items=i3", "act=keep", "scope=item", "clear=yes"] }]);
    const r = await reader.read({ stylistSaid: "", words: "Keep the dress in look two", notes: [], looks: LOOKS, inView: 1 });
    expect(prompts[0]).toContain('Look 2, "Look 2": i3 Dress 2 (dress); i4 Shoes 2 (shoes)');
    expect(prompts[0]).toContain("they're looking at Look 1");
    expect(r?.changes.add).toEqual([{ kind: "feedback", text: "Keep the dress", status: "confirmed", details: feedbackDetails({ look: 3, items: ["dress-2"], act: "keep", scope: "item" }) }]);
  });

  it("jots unclear feedback in pencil, under the look on screen when none is named", async () => {
    const { reader } = reading([{ k: "feedback", t: "Likes one piece, not another", d: ["act=like", "scope=item", "clear=no"] }]);
    const r = await reader.read({ stylistSaid: "", words: "I like that but not this", notes: [], looks: LOOKS, inView: 2 });
    expect(r?.changes.add[0]).toMatchObject({ kind: "feedback", status: "to_confirm" });
    expect(feedbackOf(r!.changes.add[0])?.look).toBe(3);
  });

  it("drops feedback when no looks were given, so readings while talking never jot it", async () => {
    const { reader } = reading([{ k: "feedback", t: "Keep the dress", d: ["look=1", "items=i1", "act=keep"] }]);
    const r = await reader.read({ stylistSaid: "", words: "Keep the dress", notes: [] });
    expect(r?.changes.add).toEqual([]);
  });
});
