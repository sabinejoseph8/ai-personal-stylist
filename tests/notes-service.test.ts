import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeNotesReader } from "@/core/notes/fake-reader";
import type { NotesReader, Reading } from "@/core/notes/reader";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { allowException } from "@/lib/exceptions-service";
import { hearWords, type NotesDeps, type NotesUpdate, touchSessionNote } from "@/lib/notes-service";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { savePreferences } from "@/lib/profile-store";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 2c: words in, notes out, against the real database with the fake notes reader: the quick money
// update then the reading, touches beating late readings (R22), the AI allowance and ownership.
const WEDDING = "I'm going to an outdoor wedding in November. I'd like something elegant, preferably emerald green, and my budget is $500";

describe.skipIf(!canRunDatabaseTests)("notes on the server", () => {
  const db = serverDb();
  let guest: TestGuest;
  let sessionId: string;
  const guard = (dailyAiUsd = 1) =>
    createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd, monthlyClaudeUsd: 1e6, monthlyOpenaiUsd: 1e6, monthlyVideoSeconds: 1e9 });
  const deps = (change: Partial<NotesDeps> = {}): NotesDeps => ({ db, guard: guard(), reader: createFakeNotesReader(), ...change });
  async function hear(words: string, d = deps()) {
    const updates: NotesUpdate[] = [];
    const found = await hearWords(d, guest.id, sessionId, { words, stylistSaid: "", final: true }, (u) => updates.push(u));
    return { found, updates, last: updates.at(-1)! };
  }
  const texts = (u: NotesUpdate) => u.notes.map((n) => n.text);

  beforeAll(async () => {
    guest = await createTestGuest();
  }, 30_000);
  beforeEach(async () => {
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    await db.from("usage").delete().eq("user_id", guest.id).throwOnError();
    sessionId = (await db.from("sessions").insert({ user_id: guest.id }).select("id").single().throwOnError()).data!.id;
  });
  afterAll(async () => guest?.remove());

  it("the wedding sentence gives the R18 notes and the dress or pantsuit question, money first", async () => {
    const { updates, last } = await hear(WEDDING);
    expect(updates).toHaveLength(2);
    expect(texts(updates[0])).toEqual(["Budget: up to $500"]); // plain code, before the reading
    expect(texts(last).sort()).toEqual(["Budget: up to $500", "Elegant", "Emerald green, preferred", "Outdoor wedding, November"]);
    expect(last.notes.every((n) => n.status === "to_confirm")).toBe(true);
    expect(last.question).toEqual({ text: "Dress or pantsuit?", options: ["Dress", "Pantsuit", "Not sure yet"] });
    expect(last.context).toContain("To confirm:");
    expect(last.context).toContain("Ask next, when it fits: Dress or pantsuit?");
    expect(last.version).toBeGreaterThan(updates[0].version);
    // The month went into the occasion note's hidden details.
    const { data } = await db.from("session_notes").select("note_text, hidden_details").eq("session_id", sessionId);
    expect(data!.find((n) => n.note_text.startsWith("Outdoor"))!.hidden_details).toEqual(
      expect.arrayContaining([{ name: "month", value: "november" }, { name: "season", value: "fall" }]),
    );
  });

  it("hears a request to swap a piece only at the end of a turn, with the looks on screen (4c, 4e review)", async () => {
    await db.from("looks").insert({ user_id: guest.id, session_id: sessionId, status: "published", input_versions: { slot: 1 } }).throwOnError();
    const seen: number[] = [];
    const spy = createFakeNotesReader();
    const reader: NotesReader = { read: (input) => (seen.push(input.looks?.length ?? 0), spy.read(input)) };
    const updates: NotesUpdate[] = [];
    await hearWords(deps({ reader }), guest.id, sessionId, { words: "Show me different", stylistSaid: "", final: false }, (u) => updates.push(u));
    await hearWords(deps({ reader }), guest.id, sessionId, { words: "Show me different shoes", stylistSaid: "", final: true }, (u) => updates.push(u));
    expect(seen).toEqual([0, 1]);
    expect(updates.at(-1)?.swap).toEqual({ look: 0, piece: "shoes" });
  });

  it("flags a request that breaks a saved Never, so the stylist asks first, until it's allowed (5c, R57)", async () => {
    await savePreferences(guest.db, SAMPLE_PROFILE.preferences);
    try {
      const heels = (await db.from("saved_preferences").select("id").eq("user_id", guest.id).eq("kind", "never").single().throwOnError()).data!;
      const { last } = await hear("I'd love some high heels");
      expect(last.exception).toEqual({ id: heels.id, kind: "never", words: "high heels" });
      await allowException(db, guest.id, sessionId, heels.id);
      expect((await hear("I'd love some high heels")).last.exception).toBeUndefined();
    } finally {
      await savePreferences(guest.db, []);
    }
  });

  it("a voice correction replaces the budget (R21)", async () => {
    await hear(WEDDING);
    const { last } = await hear("Actually, make my budget $350");
    expect(texts(last)).toContain("Budget: up to $350");
    expect(texts(last)).not.toContain("Budget: up to $500");
  });

  it("keeps this turn's question on the server when a reading leaves it out, until a later turn (Phase 2 review)", async () => {
    const silent: NotesReader = { read: async (input) => ({ ...(await createFakeNotesReader().read(input))!, question: null }) };
    const say = async (words: string, turn: string, reader?: NotesReader) => {
      const updates: NotesUpdate[] = [];
      await hearWords(deps(reader ? { reader } : {}), guest.id, sessionId, { words, stylistSaid: "", final: false, turn }, (u) => updates.push(u));
      return updates.at(-1)!;
    };
    expect((await say("It's for a wedding", "turn-a")).question).toEqual({ text: "Dress or pantsuit?", options: ["Dress", "Pantsuit", "Not sure yet"] });
    const sameTurn = await say("It's for a wedding in November", "turn-a", silent);
    expect(sameTurn.question?.text).toBe("Dress or pantsuit?");
    expect(sameTurn.context).toContain("Ask next, when it fits: Dress or pantsuit?");
    expect((await say("Something elegant", "turn-b", silent)).question).toBeNull();
  });

  it("two overlapping readings of a growing sentence jot one note", async () => {
    const updates: NotesUpdate[] = [];
    const heard = (words: string) => ({ words, stylistSaid: "", final: false, turn: "t" });
    // Two readings start on the same empty notebook and finish one after the other.
    await Promise.all([
      hearWords(deps(), guest.id, sessionId, heard("I'm going to an outdoor wedding"), (u) => updates.push(u)),
      hearWords(deps(), guest.id, sessionId, heard("I'm going to an outdoor wedding in November"), (u) => updates.push(u)),
    ]);
    const last = updates.reduce((a, b) => (b.version >= a.version ? b : a));
    expect(texts(last).filter((t) => t.toLowerCase().includes("wedding"))).toHaveLength(1);
  });

  it("a reading still running when the shopper taps End saves nothing afterwards (2e, R63)", async () => {
    let release = () => {};
    const waiting = new Promise<void>((r) => (release = r));
    const slow: NotesReader = { read: async (input) => (await waiting, createFakeNotesReader().read(input)) };
    const updates: NotesUpdate[] = [];
    const hearing = hearWords(deps({ reader: slow }), guest.id, sessionId, { words: WEDDING, stylistSaid: "", final: true }, (u) => updates.push(u));
    await expect.poll(() => updates.length).toBe(1); // money and dates, before the reading
    await db.from("sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId).throwOnError();
    await db.rpc("delete_session_data", { session: sessionId }).throwOnError();
    release();
    expect(await hearing).toBe(true);
    expect(updates).toHaveLength(1);
    expect((await db.from("session_notes").select("id").eq("session_id", sessionId)).data).toEqual([]);
  });

  it("a confirm by touch beats a slow reading of words heard before the tap (R22)", async () => {
    await hear("something elegant");
    const elegant = (await db.from("session_notes").select("id").eq("session_id", sessionId).eq("note_text", "Elegant").single()).data!.id;
    // A slow reading of words heard before the tap: it finishes after the shopper confirms.
    let release = () => {};
    const slow: NotesReader = {
      read: () =>
        new Promise<Reading>((resolve) => {
          release = () => resolve({ changes: { add: [], update: [{ id: elegant, text: "Elegant, understated", status: "to_confirm", details: [] }], remove: [] }, question: null, costUsd: 0 });
        }),
    };
    const pending = hear("something elegant, understated", deps({ reader: slow }));
    await new Promise((r) => setTimeout(r, 300));
    const touched = await touchSessionNote({ db }, guest.id, sessionId, elegant, "confirm");
    expect(touched?.notes.find((n) => n.id === elegant)?.status).toBe("confirmed");
    release();
    const { last } = await pending;
    expect(last.notes.find((n) => n.id === elegant)).toMatchObject({ text: "Elegant", status: "confirmed" });
  });

  it("Remove by touch takes a note out, and Undo brings it back (R20)", async () => {
    await hear("nothing black please");
    const id = (await db.from("session_notes").select("id").eq("session_id", sessionId).single()).data!.id;
    expect((await touchSessionNote({ db }, guest.id, sessionId, id, "remove"))?.notes).toEqual([]);
    const { last } = await hear("nothing black please");
    expect(texts(last)).toEqual([]); // never jotted again
    expect(texts((await touchSessionNote({ db }, guest.id, sessionId, id, "restore"))!)).toEqual(["Not black"]);
  });

  it("pauses notes once the AI allowance is used, keeping plain-code money notes (R25)", async () => {
    const { last } = await hear(WEDDING, deps({ guard: guard(0) }));
    expect(last.paused).toBe(true);
    expect(texts(last)).toEqual(["Budget: up to $500"]);
  });

  it("only works on the guest's own open session, and guests can't write notes themselves", async () => {
    const other = await createTestGuest();
    try {
      const updates: NotesUpdate[] = [];
      expect(await hearWords(deps(), other.id, sessionId, { words: WEDDING, stylistSaid: "", final: true }, (u) => updates.push(u))).toBe(false);
      expect(updates).toEqual([]);
      const write = await guest.db.from("session_notes").insert({ user_id: guest.id, session_id: sessionId, note_text: "Planted" });
      expect(write.error).not.toBeNull();
      const read = await guest.db.rpc("save_notes", { session: sessionId, expected_version: 0, rows: [] });
      expect(read.error).not.toBeNull();
    } finally {
      await other.remove();
    }
  });

  it("what the shopper says about the photo changes it, and the stylist is told (3b, Q3)", async () => {
    const reading = {
      state: "read",
      chosen: 0,
      items: [
        {
          name: "Navy wool blazer",
          details: {
            type: { value: "blazer", status: "confirmed" },
            colors: { value: "navy", status: "to_confirm" },
            pattern: { value: "solid", status: "confirmed" },
            style: { value: "classic", status: "to_confirm" },
          },
        },
      ],
    };
    const photo = await db
      .from("session_assets")
      .insert({ user_id: guest.id, session_id: sessionId, photo_path: "x", source: "upload", status: "ready", recognized_details: reading })
      .select("id")
      .single()
      .throwOnError();
    const { last } = await hear("Actually it's black. It's mine");
    expect(last.photo?.id).toBe(photo.data!.id);
    expect(last.photo?.item.ownership).toBe("owned");
    expect(last.photo?.item.reading.items[0]).toMatchObject({ name: "Black wool blazer", details: { colors: { value: "black", status: "confirmed" } } });
    expect(last.context).toContain("Style around this item, from the shopper's photo: Black wool blazer");
    expect(last.context).toContain("Ownership: theirs");
    const saved = await db.from("session_assets").select("ownership, recognized_details").eq("id", photo.data!.id).single().throwOnError();
    expect(saved.data!.ownership).toBe("owned");
    // Words with nothing about the photo leave it alone.
    const { last: next } = await hear("It's for a gala");
    expect(next.photo).toBeUndefined();
  });
});
