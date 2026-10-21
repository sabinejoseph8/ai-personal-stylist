import { describe, expect, it } from "vitest";
import { cleanQuestion, createNotesReader, type Ask, type LookForReader } from "@/core/notes/reader";
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
    prompts.push(typeof user === "string" ? user : JSON.stringify(user));
    return { data: answer, costUsd: 0.0001 };
  };
  return { ask, prompts };
}

// Three looks on screen, in places 1, 2 and 3 (5a), with their items.
const LOOKS: LookForReader[] = [1, 2, 3].map((n) => ({
  number: n,
  slot: n,
  name: `Look name ${n}`,
  items: [
    { id: `dress-${n}`, name: `Dress ${n}`, group: "dress", owned: false },
    { id: `shoes-${n}`, name: `Shoes ${n}`, group: "shoes", owned: false },
    { id: `bag-${n}`, name: `Bag ${n}`, group: "bag", owned: false },
  ],
}));

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

  it("inks a note by voice only when it answers the stylist's question about that note (R16, Phase 2 review)", async () => {
    const claude = standIn({ add: [], update: [{ i: "n1", t: "Jeans", s: "c", d: [] }], remove: [], q: { t: "", o: [] } });
    const reader = createNotesReader(claude.ask);
    const jeans = [note("j", "Jeans", "outfit")];
    for (const stylistSaid of ["", "What are you dressing for?", "Jeans sound great."]) {
      expect((await reader.read({ stylistSaid, words: "jeans are fine", notes: jeans }))?.changes.update[0].status).toBe("to_confirm");
    }
    expect((await reader.read({ stylistSaid: "So jeans are fine, right?", words: "yes", notes: jeans }))?.changes.update[0].status).toBe("confirmed");
  });

  it("hears a request to swap a piece only while looks are on screen, never as a note (4c, R43)", async () => {
    const asked: { system: string; schema: unknown }[] = [];
    const answer = (l: number) => ({ add: [], update: [], remove: [], q: { t: "", o: [] }, w: { l, p: "shoes" } });
    const looks = [2, 5, 0];
    const ask: Ask = async ({ system, schema }) => (asked.push({ system, schema }), { data: answer(looks[asked.length - 1]), costUsd: 0 });
    const reader = createNotesReader(ask);
    const withLooks = await reader.read({ stylistSaid: "", words: "Show me different shoes for look 2", notes: [], looks: LOOKS });
    expect(withLooks?.swap).toEqual({ look: 2, piece: "shoes" });
    expect(asked[0].system).toContain("The looks on the shopper's screen");
    expect(JSON.stringify(asked[0].schema)).toContain('"w"');
    // A look number that isn't on screen means "the one you're looking at".
    expect((await reader.read({ stylistSaid: "", words: "Different shoes for look 5", notes: [], looks: LOOKS }))?.swap).toEqual({ look: 0, piece: "shoes" });
    // Without looks, the instructions and answer are as before.
    const without = await reader.read({ stylistSaid: "", words: "Show me different shoes", notes: [] });
    expect(without).not.toHaveProperty("swap");
    expect(asked[2].system).not.toContain("The looks on the shopper's screen");
    expect(JSON.stringify(asked[2].schema)).not.toContain('"w"');
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
