import { describe, expect, it } from "vitest";
import { differences } from "@/core/looks/compare";
import { asksAboutIt, conflictQuestion, exceptionsForStylist, exceptionText, type FirmPreference, spokenQuestion, takeOffQuestion, wantedNote } from "@/core/looks/exceptions";
import type { ShownItem } from "@/core/looks/shown";
import { stylistContext } from "@/core/notes/context";
import { createNotesReader, type Ask } from "@/core/notes/reader";

// 5c: "This session only" exceptions (R57, S14) in words, the notes reader flagging a request that breaks
// a saved preference (Sabine's answer to Q1), and Compare's differences (R51).

const heels: FirmPreference = { id: "pref-heels", kind: "never", words: "high heels" };
const sleeves: FirmPreference = { id: "pref-sleeves", kind: "must_have", words: "sleeves" };

describe("exceptions in words", () => {
  it("say what's allowed, and that the profile still says otherwise (R57)", () => {
    expect(exceptionText(heels)).toBe("High heels allowed for this session. Your profile still says Never: high heels.");
    expect(exceptionText(sleeves)).toBe("Sleeves not needed for this session. Your profile still says Must have: sleeves.");
    expect(conflictQuestion(heels)).toBe("Your profile says Never: high heels. Allow high heels for this session?");
    expect(conflictQuestion(sleeves)).toBe("Your profile says Must have: sleeves. Go without sleeves for this session?");
    expect(takeOffQuestion(heels)).toBe('Take "Never: high heels" off your profile? Later sessions will allow it too.');
    // Said word for word by the stylist (found on Sabine's iPhone in 5c, A.3).
    expect(spokenQuestion(heels)).toBe("Your profile says never high heels. Shall I allow high heels for this session only, or keep your preference?");
    expect(spokenQuestion(sleeves)).toBe("Your profile says you must have sleeves. Shall I go without sleeves for this session only, or keep your preference?");
  });

  it("tell the stylist from the start to ask first, so her first answer already asks (found on Sabine's iPhone in 5c, A.3)", () => {
    const told = stylistContext([], [{ kind: "never", words: "high heels" }, { kind: "likes", words: "earth tones" }], null);
    // With the exact question, so her own reply asks it, once (fix plan 3).
    expect(told).toContain(`- For high heels: "${spokenQuestion(heels)}"`);
    expect(told).toContain("don't say yes or no");
    expect(stylistContext([], [{ kind: "likes", words: "earth tones" }], null)).not.toContain("word for word");
    // Whether her reply already asked, and what's jotted once it's allowed.
    expect(asksAboutIt(spokenQuestion(heels))).toBe(true);
    expect(asksAboutIt("Certainly, do you want to allow high heels for this session?")).toBe(true);
    expect(asksAboutIt("Let me check that against your saved preferences.")).toBe(false);
    // Only a question counts: this statement left the question unasked (found on Sabine's iPhone in 5c, A.9).
    expect(asksAboutIt("High heels are allowed for this session.")).toBe(false);
    expect(wantedNote(heels)).toBe("High heels");
    expect(wantedNote(sleeves)).toBe("Without sleeves");
  });

  it("tell the stylist what's allowed, and to ask first about a new request", () => {
    const told = exceptionsForStylist([sleeves], heels);
    expect(told).toContain("This session only: the shopper allowed breaking their saved preference Must have: sleeves.");
    expect(told).toContain(`You've just asked the shopper: "${spokenQuestion(heels)}" Wait for their answer`);
    expect(told).toContain('repeat the question exactly as it is, without starting with "certainly", "absolutely"');
    expect(exceptionsForStylist([], null)).toBe("");
  });

  it("tell the stylist outright when a permission is taken back, until it's allowed again (fix plan 7)", () => {
    const back = exceptionsForStylist([], null, [heels, sleeves]);
    expect(back).toContain("Taken back: the shopper took back allowing high heels. Their saved preference Never: high heels applies again, whatever was said earlier, so if they ask for it, ask the question again, word for word.");
    expect(back).toContain("took back allowing going without sleeves. Their saved preference Must have: sleeves applies again");
    const again = exceptionsForStylist([heels], null, [heels]);
    expect(again).toContain("This session only: the shopper allowed breaking their saved preference Never: high heels.");
    expect(again).not.toContain("Taken back");
  });
});

describe("the notes reader and saved preferences (Q1 in 5c)", () => {
  const reading = (x: string) => {
    const systems: string[] = [];
    const schemas: unknown[] = [];
    const ask: Ask = async ({ system, schema }) => (systems.push(system), schemas.push(schema), { data: { add: [], update: [], remove: [], q: { t: "", o: [] }, x }, costUsd: 0 });
    return { reader: createNotesReader(ask), systems, schemas };
  };

  it("is told the saved Must have and Never by code, and flags a request that breaks one, by its id", async () => {
    const { reader, systems } = reading("s2");
    const r = await reader.read({ stylistSaid: "", words: "I'd love some high heels", notes: [], saved: [sleeves, heels] });
    expect(systems[0]).toContain("- s1: Must have: sleeves\n- s2: Never: high heels");
    expect(r?.exception).toBe("pref-heels");
  });

  it("hears a spoken answer to the stylist's question, only while one is waiting (A.3 fix, Q1)", async () => {
    const answering = (y: string) => {
      const systems: string[] = [];
      const ask: Ask = async ({ system }) => (systems.push(system), { data: { add: [], update: [], remove: [], q: { t: "", o: [] }, x: "", y }, costUsd: 0 });
      return { reader: createNotesReader(ask), systems };
    };
    const yes = answering("allow");
    expect((await yes.reader.read({ stylistSaid: "", words: "Yes, allow it", notes: [], saved: [heels], asking: heels }))?.answer).toBe("allow");
    expect(yes.systems[0]).toContain("whether to allow high heels for this session only, or keep their saved preference Never: high heels");
    expect((await answering("keep").reader.read({ stylistSaid: "", words: "No, keep it", notes: [], saved: [heels], asking: heels }))?.answer).toBe("keep");
    const none = answering("allow");
    expect((await none.reader.read({ stylistSaid: "", words: "Yes please", notes: [], saved: [heels] }))?.answer).toBeUndefined();
    expect(none.systems[0]).not.toContain("You (the stylist) just asked");
  });

  it("leaves out a note about the very thing flagged, keeping the rest", async () => {
    const ask: Ask = async () => ({ data: { add: [{ k: "style", t: "Sleeveless", d: [] }, { k: "occasion", t: "Gala", d: [] }], update: [], remove: [], q: { t: "", o: [] }, x: "s1" }, costUsd: 0 });
    const r = await createNotesReader(ask).read({ stylistSaid: "", words: "A sleeveless dress for the gala", notes: [], saved: [sleeves, heels] });
    expect(r?.exception).toBe("pref-sleeves");
    expect(r?.changes.add.map((a) => a.text)).toEqual(["Gala"]);
  });

  it("is told what's allowed for this session by its own code, and hears asking for it again as that (fix plan 5, Q1)", async () => {
    const systemsSeen: string[] = [];
    const ask: Ask = async ({ system }) => (systemsSeen.push(system), { data: { add: [{ k: "style", t: "High heels", d: [] }, { k: "occasion", t: "Gala", d: [] }], update: [], remove: [], q: { t: "", o: [] }, x: "a1" }, costUsd: 0 });
    const r = await createNotesReader(ask).read({ stylistSaid: "", words: "I'd love some high heels for the gala", notes: [], saved: [sleeves], allowed: [heels] });
    expect(systemsSeen[0]).toContain("- s1: Must have: sleeves");
    expect(systemsSeen[0]).toContain("allowed these for this session only, though their saved preferences rule them out:\n- a1: Never: high heels");
    expect(r?.wanted).toBe("pref-heels");
    expect(r?.exception).toBeUndefined();
    // The app jots it in ink, so Claude's own note of it is left out.
    expect(r?.changes.add.map((a) => a.text)).toEqual(["Gala"]);
    // Only allowed ones: the saved part is still there, without the "s" list.
    const onlyAllowed = reading("a1");
    expect((await onlyAllowed.reader.read({ stylistSaid: "", words: "Some high heels", notes: [], allowed: [heels] }))?.wanted).toBe("pref-heels");
    expect(onlyAllowed.systems[0]).not.toContain("Their saved preferences rule some things out");
  });

  it("doesn't take a request for one already allowed as breaking another (fix plan 5, found on Sabine's iPhone in 5c, A.7)", async () => {
    // Told "s1" for "high heels" with heels allowed: no card, it's a request for heels.
    const wrong = await reading("s1").reader.read({ stylistSaid: "", words: "I'd love some high heels", notes: [], saved: [sleeves], allowed: [heels] });
    expect(wrong?.exception).toBeUndefined();
    expect(wrong?.wanted).toBe("pref-heels");
    // Or a made-up code: the notes eval caught "s2" for high heels once allowed.
    expect((await reading("s2").reader.read({ stylistSaid: "", words: "I'd love to wear some high heels", notes: [], saved: [sleeves], allowed: [heels] }))?.wanted).toBe("pref-heels");
    // No code at all is no request: "I usually avoid heels" stays as it is.
    expect((await reading("").reader.read({ stylistSaid: "", words: "I usually avoid heels", notes: [], saved: [sleeves], allowed: [heels] }))?.wanted).toBeUndefined();
    // A request that names the flagged one still asks, and so does one with no allowed one named.
    expect((await reading("s1").reader.read({ stylistSaid: "", words: "A sleeveless dress, please", notes: [], saved: [sleeves], allowed: [heels] }))?.exception).toBe("pref-sleeves");
    expect((await reading("s1").reader.read({ stylistSaid: "", words: "A strapless gown, please", notes: [], saved: [sleeves], allowed: [heels] }))?.exception).toBe("pref-sleeves");
  });

  it("flags nothing for an empty or unknown code, and isn't asked without saved preferences", async () => {
    expect((await reading("").reader.read({ stylistSaid: "", words: "Something elegant", notes: [], saved: [heels] }))?.exception).toBeUndefined();
    expect((await reading("s9").reader.read({ stylistSaid: "", words: "Something elegant", notes: [], saved: [heels] }))?.exception).toBeUndefined();
    const none = reading("s1");
    expect((await none.reader.read({ stylistSaid: "", words: "Something elegant", notes: [] }))?.exception).toBeUndefined();
    expect(none.systems[0]).not.toContain("Their saved preferences");
    expect(JSON.stringify(none.schemas[0])).not.toContain('"x"');
  });
});

describe("Compare's differences (R51)", () => {
  const item = (id: string, group: ShownItem["group"]): ShownItem => ({ kind: "product", id, group, name: id, category: group, owned: false, priceCents: 100, imageUrl: null, imageAlt: id });
  const now = [item("dress", "dress"), item("flats", "shoes"), item("clutch", "bag")];

  it("label what's different about the earlier look, piece by piece", () => {
    expect(differences(now, [item("dress", "dress"), item("heels", "shoes"), item("clutch", "bag")])).toEqual(["Different shoes"]);
    expect(differences(now, [item("dress", "dress"), item("flats", "shoes"), item("blazer", "outer")])).toEqual(["With a jacket", "Without the bag"]);
    expect(differences(now, now)).toEqual(["The same pieces"]);
  });
});
