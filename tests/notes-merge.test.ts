import { describe, expect, it } from "vitest";
import { mergeNotes, touchNote } from "@/core/notes/merge";
import { parseBudget, parseMonth, plainChanges } from "@/core/notes/plain";
import { active, type NewNote, type Note, NO_CHANGES, type NoteChanges } from "@/core/notes/types";

// Phase 2 automated tests: latest word wins (R22) and budget parsing, with no AI and no database.
let ids = 0;
const newId = () => `note-${++ids}`;
const add = (kind: NewNote["kind"], text: string, status: NewNote["status"] = "to_confirm"): NoteChanges => ({
  ...NO_CHANGES,
  add: [{ kind, text, status, details: [] }],
});
const texts = (notes: Note[]) => active(notes).map((n) => n.text);
const find = (notes: Note[], text: string) => notes.find((n) => n.text === text)!;

describe("latest word wins (R22)", () => {
  it("adds new notes from a reading, in pencil", () => {
    const { notes } = mergeNotes([], add("occasion", "Outdoor wedding, November"), 1, 12, newId);
    expect(notes).toMatchObject([{ text: "Outdoor wedding, November", status: "to_confirm", changedSeq: 1, version: 1 }]);
  });

  it("a late reading of earlier words never overwrites a newer spoken correction", () => {
    let { notes } = mergeNotes([], add("colors", "Emerald green, preferred"), 1, 12, newId);
    const id = notes[0].id;
    // Reading 3 (newer words: "actually, navy") finishes first...
    notes = mergeNotes(notes, { ...NO_CHANGES, update: [{ id, text: "Navy, preferred", status: "to_confirm", details: [] }] }, 3).notes;
    // ...then reading 2 (older words) arrives late and tries to put emerald back.
    const late = mergeNotes(notes, { ...NO_CHANGES, update: [{ id, text: "Emerald green, preferred", status: "to_confirm", details: [] }] }, 2);
    expect(texts(late.notes)).toEqual(["Navy, preferred"]);
    expect(late.changed).toEqual([]);
  });

  it("a late reading never brings back a note the shopper removed, by touch or by voice", () => {
    let { notes } = mergeNotes([], add("colors", "Not black"), 1, 12, newId);
    notes = touchNote(notes, notes[0].id, "remove", 1).notes;
    expect(texts(mergeNotes(notes, add("colors", "Not black"), 2).notes)).toEqual([]);
    expect(texts(mergeNotes(notes, add("colors", "not black."), 5).notes)).toEqual([]);
  });

  it("a confirm by touch beats a reading of words heard before the tap", () => {
    let { notes } = mergeNotes([], add("style", "Elegant"), 1, 12, newId);
    const id = notes[0].id;
    notes = touchNote(notes, id, "confirm", 2).notes; // the session had reached sequence 2
    const late = mergeNotes(notes, { ...NO_CHANGES, update: [{ id, text: "Elegant, understated", status: "to_confirm", details: [] }] }, 2);
    expect(find(late.notes, "Elegant").status).toBe("confirmed");
    // Words said after the tap can still change it.
    const newer = mergeNotes(notes, { ...NO_CHANGES, update: [{ id, text: "Elegant, understated", status: "confirmed", details: [] }] }, 3);
    expect(texts(newer.notes)).toEqual(["Elegant, understated"]);
  });

  it("a reading never drops a confirmed note (Sabine, 19 Oct 2026), but the shopper can remove it by touch", () => {
    let { notes } = mergeNotes([], add("occasion", "Job interview", "confirmed"), 1, 12, newId);
    const id = notes[0].id;
    expect(texts(mergeNotes(notes, { ...NO_CHANGES, remove: [id] }, 2).notes)).toEqual(["Job interview"]);
    notes = touchNote(notes, id, "remove", 2).notes;
    expect(texts(notes)).toEqual([]);
    expect(texts(touchNote(notes, id, "restore", 2).notes)).toEqual(["Job interview"]);
  });

  it("a clear correction keeps the note's status (Sabine's answer to Q1 in 2c)", () => {
    let { notes } = mergeNotes([], plainChanges([], "my budget is $500"), 1, 12, newId);
    notes = touchNote(notes, notes[0].id, "confirm", 1).notes;
    notes = mergeNotes(notes, plainChanges(notes, "my budget is $500. Actually, make my budget $350"), 2).notes;
    expect(active(notes)).toMatchObject([{ text: "Budget: up to $350", status: "confirmed" }]);
  });

  it("the same idea twice is one note, and there's only ever one budget", () => {
    let { notes } = mergeNotes([], add("style", "Elegant"), 1, 12, newId);
    notes = mergeNotes(notes, add("style", "elegant"), 2).notes;
    notes = mergeNotes(notes, plainChanges(notes, "under 300"), 3).notes;
    notes = mergeNotes(notes, add("budget", "Budget: up to $400"), 4).notes;
    expect(texts(notes)).toEqual(["Elegant", "Budget: up to $400"]);
  });

  it("stops at the cap of 12 notes, keeping a place for the budget (Sabine's answer to Q2 in 2c)", () => {
    let notes: Note[] = [];
    for (let i = 0; i < 14; i++) notes = mergeNotes(notes, add("other", `Detail ${i}`), i + 1, 12, newId).notes;
    expect(active(notes)).toHaveLength(11);
    notes = mergeNotes(notes, plainChanges(notes, "budget around 450"), 20, 12, newId).notes;
    expect(active(notes)).toHaveLength(12);
    expect(texts(notes)).toContain("Budget: around $450");
  });

  it("a note a reading removed can come back from a newer reading, but never from an older one", () => {
    let { notes } = mergeNotes([], add("occasion", "Graduation"), 1, 12, newId);
    notes = mergeNotes(notes, { ...NO_CHANGES, remove: [notes[0].id] }, 3).notes;
    expect(texts(mergeNotes(notes, add("occasion", "Graduation"), 2).notes)).toEqual([]);
    expect(texts(mergeNotes(notes, add("occasion", "Graduation"), 4).notes)).toEqual(["Graduation"]);
  });

  it("two overlapping readings that jot the same idea in other words give one note, in the newer words", () => {
    const seen = new Set<string>(); // both readings started on an empty notebook
    const older = add("occasion", "Outdoor wedding");
    const newer = add("occasion", "Outdoor wedding, November");
    // The newer reading finishes first, then the older one: still one note, in the newer words.
    let notes = mergeNotes([], newer, 2, 12, newId, seen).notes;
    notes = mergeNotes(notes, older, 1, 12, newId, seen).notes;
    expect(texts(notes)).toEqual(["Outdoor wedding, November"]);
    // The other way round, the newer words replace the older ones.
    notes = mergeNotes([], older, 1, 12, newId, seen).notes;
    notes = mergeNotes(notes, newer, 2, 12, newId, seen).notes;
    expect(texts(notes)).toEqual(["Outdoor wedding, November"]);
    // Different ideas of the same kind stay apart, and a reading's own notes never merge.
    notes = mergeNotes(notes, add("colors", "Emerald green, preferred"), 3, 12, newId, seen).notes;
    notes = mergeNotes(notes, add("colors", "Navy, preferred"), 4, 12, newId, seen).notes;
    expect(texts(notes)).toHaveLength(3);
    const both: NoteChanges = { ...NO_CHANGES, add: [...add("owned_item", "Owns a camel coat").add, ...add("owned_item", "Owns a camel scarf").add] };
    expect(texts(mergeNotes([], both, 1, 12, newId, seen).notes)).toEqual(["Owns a camel coat", "Owns a camel scarf"]);
  });

  it("never repeats an idea already noted, and lets a fuller note replace a shorter one", () => {
    let { notes } = mergeNotes([], add("occasion", "Outdoor wedding, November"), 1, 12, newId);
    notes = mergeNotes(notes, add("timing", "November"), 2).notes;
    notes = mergeNotes(notes, add("style", "Relaxed"), 3, 12, newId).notes;
    notes = mergeNotes(notes, add("style", "Relaxed but put together"), 4).notes;
    notes = mergeNotes(notes, add("colors", "Navy"), 5, 12, newId).notes;
    notes = mergeNotes(notes, add("colors", "Not navy"), 6, 12, newId).notes; // yes and no aren't the same idea
    expect(texts(notes)).toEqual(["Outdoor wedding, November", "Relaxed but put together", "Navy", "Not navy"]);
    // A date jotted first folds into the occasion that names it.
    let dated = mergeNotes([], add("timing", "June 14th"), 1, 12, newId).notes;
    dated = mergeNotes(dated, add("occasion", "Sister's graduation, June 14th"), 2).notes;
    expect(active(dated)).toMatchObject([{ kind: "occasion", text: "Sister's graduation, June 14th" }]);
  });

  it("replays readings in any order to the same final notebook", () => {
    // Three readings of a growing sentence, arriving 3, 1, 2.
    const readings: [number, NoteChanges][] = [
      [1, add("occasion", "Wedding")],
      [2, add("style", "Elegant")],
      [3, add("colors", "Emerald green, preferred")],
    ];
    const inOrder = readings.reduce((notes, [seq, c]) => mergeNotes(notes, c, seq, 12, newId).notes, [] as Note[]);
    const shuffled = [readings[2], readings[0], readings[1]].reduce((notes, [seq, c]) => mergeNotes(notes, c, seq, 12, newId).notes, [] as Note[]);
    expect(texts(shuffled).sort()).toEqual(texts(inOrder).sort());
  });
});

describe("money and dates in plain code", () => {
  it.each([
    ["my budget is $500", "Budget: up to $500"],
    ["keep it under 350", "Budget: up to $350"],
    ["around 400 dollars", "Budget: around $400"],
    ["somewhere between 200 and 300 dollars", "Budget: $200 to $300"],
    ["$150-$250 is fine", "Budget: $150 to $250"],
    ["I was thinking around 400 but actually keep it under 200", "Budget: up to $200"],
  ])("%s gives %s", (words, text) => {
    expect(parseBudget(words)?.text).toBe(text);
  });

  it("finds no budget when none is said", () => {
    expect(parseBudget("something elegant for a wedding")).toBeNull();
  });

  it("reads the month, day and season, and adds them to the note that mentions the month", () => {
    expect(parseMonth("my sister's graduation is on June 14th")).toEqual({ month: "june", day: "14", season: "summer" });
    const { notes } = mergeNotes([], add("occasion", "Outdoor wedding, November"), 1, 12, newId);
    const changes = plainChanges(notes, "an outdoor wedding in November");
    expect(changes.update[0].details).toEqual([
      { name: "month", value: "november" },
      { name: "season", value: "fall" },
    ]);
  });
});
