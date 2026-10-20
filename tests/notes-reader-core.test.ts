import { describe, expect, it } from "vitest";
import { cleanQuestion, createNotesReader, type Ask } from "@/core/notes/reader";
import type { Note } from "@/core/notes/types";

// 2c: the notes reader's own rules, with Claude replaced by a stand-in.
const note = (id: string, text: string, kind: Note["kind"] = "style", status: Note["status"] = "to_confirm", removed = false): Note => ({
  id,
  kind,
  text,
  status,
  details: [],
  source: "voice",
  changedSeq: 1,
  version: 1,
  removed,
});

function standIn(answer: unknown) {
  const prompts: string[] = [];
  const ask: Ask = async ({ user }) => {
    prompts.push(user);
    return { data: answer, costUsd: 0.0001 };
  };
  return { ask, prompts };
}

describe("notes reader", () => {
  it("shows Claude the notebook with short ids and the removed notes, and maps its changes back to the real notes", async () => {
    const claude = standIn({
      add: [{ k: "colors", t: "Not black", d: ["avoid=black", "nonsense"] }],
      update: [{ i: "n1", t: "Elegant, understated", s: "p", d: [] }],
      remove: ["n2", "n9"],
      q: { t: "", o: [] },
    });
    const notes = [note("uuid-a", "Elegant"), note("uuid-b", "Emerald green, preferred", "colors"), note("uuid-c", "Sequins", "style", "to_confirm", true)];
    const reading = await createNotesReader(claude.ask).read({ stylistSaid: "What's the occasion?", words: "a wedding, nothing black", notes });
    expect(claude.prompts[0]).toContain("- n1 [style, to confirm]: Elegant");
    expect(claude.prompts[0]).toContain("Removed by the shopper, never jot again:\n- Sequins");
    expect(claude.prompts[0]).toContain('You last said: "What\'s the occasion?"');
    expect(reading?.changes).toEqual({
      add: [{ kind: "colors", text: "Not black", status: "to_confirm", details: [{ name: "avoid", value: "black" }] }],
      update: [{ id: "uuid-a", text: "Elegant, understated", status: "to_confirm", details: [] }],
      remove: ["uuid-b"],
    });
    expect(reading?.question).toBeNull();
  });

  it("leaves money to plain code, even if Claude jots a budget", async () => {
    const claude = standIn({
      add: [{ k: "budget", t: "Budget: $500", d: [] }],
      update: [{ i: "n1", t: "Budget: $600", s: "p", d: [] }],
      remove: [],
      q: { t: "", o: [] },
    });
    const reading = await createNotesReader(claude.ask).read({ stylistSaid: "", words: "budget 500", notes: [note("b", "Budget: up to $500", "budget")] });
    expect(reading?.changes.add).toEqual([]);
    expect(reading?.changes.update).toEqual([]);
  });

  it("pauses notes when Claude refuses, is cut off or answers something unreadable (R25)", async () => {
    const reading = await createNotesReader(async () => ({ data: null, costUsd: 0 })).read({ stylistSaid: "", words: "hello", notes: [] });
    expect(reading).toBeNull();
  });

  it("turns a confirmation into ink and asks the next question", async () => {
    const claude = standIn({ add: [], update: [{ i: "n1", t: "Garden party, May", s: "c", d: ["month=may"] }], remove: [], q: { t: "Dress or pantsuit?", o: ["Dress", "Pantsuit"] } });
    const reading = await createNotesReader(claude.ask).read({ stylistSaid: "A garden party in May, right?", words: "yes", notes: [note("g", "Garden party, May", "occasion")] });
    expect(reading?.changes.update).toEqual([{ id: "g", text: "Garden party, May", status: "confirmed", details: [{ name: "month", value: "may" }] }]);
    expect(reading?.question).toEqual({ text: "Dress or pantsuit?", options: ["Dress", "Pantsuit"] });
  });

  it("inks a note by voice only when it answers something the stylist said (R16)", async () => {
    const claude = standIn({ add: [], update: [{ i: "n1", t: "Jeans", s: "c", d: [] }], remove: [], q: { t: "", o: [] } });
    const reading = await createNotesReader(claude.ask).read({ stylistSaid: "", words: "jeans are fine", notes: [note("j", "Jeans", "outfit")] });
    expect(reading?.changes.update[0].status).toBe("to_confirm");
  });

  it("asks one short question, with at most three short options", () => {
    expect(cleanQuestion({ text: "Dress or pantsuit?", options: ["Dress", "Pantsuit", "Not sure yet", "Skirt"] })).toEqual({
      text: "Dress or pantsuit?",
      options: ["Dress", "Pantsuit", "Not sure yet"],
    });
    expect(cleanQuestion({ text: "", options: ["Yes"] })).toBeNull();
    expect(cleanQuestion({ text: "x".repeat(200), options: [] })).toBeNull();
  });
});
