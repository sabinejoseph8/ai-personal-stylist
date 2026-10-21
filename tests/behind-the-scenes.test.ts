import { describe, expect, it } from "vitest";
import { behindTheScenes, type CheckRecord, checkEntry, noteEntry, photoEntry, productsEntry } from "@/core/looks/behind";
import { REPEATS_SHOWN } from "@/core/looks/look";
import type { StyleItem } from "@/core/photos/item";

// 4d: Behind the scenes in plain words (R72): what was captured, with its source and certainty, and
// each check's result. A blocked look is only its one-line reason.

const at = "2026-10-21T14:00:00.000Z";
const check = (over: Omit<Partial<CheckRecord>, "look"> & { look?: Partial<CheckRecord["look"]> } = {}): CheckRecord => ({
  at,
  verdict: "pass",
  again: false,
  ...over,
  reasons: over.reasons ?? [
    { about: "Never: high heels", ok: true, why: "no shoes with heels over 5 cm" },
    { about: "Budget", ok: true, why: "$13 under your $350 limit" },
    { about: "Outdoor wedding, November", ok: true, why: "Warm enough" },
    { about: "Outfit", ok: true, why: "A complete outfit" },
  ],
  look: { name: "Garden ceremony", slot: 1, shown: true, swap: null, ...over.look },
});

describe("what the stylist captured", () => {
  it("says each note, where it came from and whether it's confirmed", () => {
    expect(noteEntry({ text: "Budget: up to $500", status: "confirmed", source: "voice", removed: false, at }).text).toBe("Captured: Budget: up to $500. From what you said. Confirmed by you.");
    expect(noteEntry({ text: "Elegant", status: "to_confirm", source: "voice", removed: false, at }).text).toBe("Captured: Elegant. From what you said. Not confirmed yet.");
    expect(noteEntry({ text: "Outdoor wedding, November", status: "confirmed", source: "touch", removed: false, at }).text).toBe("Captured: Outdoor wedding, November. From what you said. Confirmed by you with a tap.");
    expect(noteEntry({ text: "Not black", status: "to_confirm", source: "voice", removed: true, at }).text).toBe("Removed by you: Not black.");
  });

  it("says what was read from a photo, how sure each detail is and whose it is, never showing it", () => {
    const item: StyleItem = {
      ownership: "owned",
      reading: {
        state: "read",
        chosen: 0,
        items: [{ name: "Navy wool blazer", details: { type: { value: "blazer", status: "confirmed" }, colors: { value: "navy", status: "to_confirm" }, pattern: { value: "solid", status: "confirmed" }, style: { value: "classic", status: "to_confirm" } } }],
      },
    };
    expect(photoEntry({ source: "upload", item, at }).text).toBe("Read from your photo: Navy wool blazer. Sure: type and pattern. To confirm: colors and style. Yours.");
    expect(photoEntry({ source: "camera", item: { ...item, ownership: null }, at }).text).toContain("Read from your camera: Navy wool blazer.");
    expect(photoEntry({ source: "upload", item: { ownership: null, reading: { state: "failed", items: [], chosen: null } }, at }).text).toBe("Couldn't read your photo, so you were asked to describe it.");
  });
});

describe("each preference check", () => {
  it("says what a look that passed meets", () => {
    expect(checkEntry(check())?.text).toBe("Check passed: Look 1, Garden ceremony. It meets Never: high heels; your budget; Outdoor wedding, November.");
  });

  it("gives a blocked candidate as one line of reasons, never the look itself (R72)", () => {
    const blocked = checkEntry(check({ verdict: "conflict", look: { shown: false, slot: null, name: "Silver evening shimmer" }, reasons: [{ about: "Never: high heels", ok: false, why: "Black stiletto pumps: Breaks Never: high heels (no shoes with heels over 5 cm)" }, { about: "Budget", ok: true, why: "fine" }] }));
    expect(blocked).toEqual({ at, kind: "blocked", text: "Check blocked a candidate: Black stiletto pumps: Breaks Never: high heels (no shoes with heels over 5 cm)." });
    expect(blocked?.text).not.toContain("Silver evening shimmer");
  });

  it("leaves out a spare that passed but wasn't needed, and a repeat that wasn't judged", () => {
    expect(checkEntry(check({ look: { shown: false, slot: null } }))).toBeNull();
    expect(checkEntry(check({ verdict: "conflict", look: { shown: false, slot: null }, reasons: [{ about: "Outfit", ok: false, why: REPEATS_SHOWN }] }))).toBeNull();
  });

  it("says what a swap brought in, or why a replacement was blocked", () => {
    expect(checkEntry(check({ look: { swap: { from: "Nude slingback flats", to: "Tan leather loafers" } } }))?.text).toBe("Swap in Look 1: Tan leather loafers replaced Nude slingback flats, and passed the check.");
    expect(checkEntry(check({ verdict: "conflict", look: { shown: false, swap: { from: "Nude slingback flats", to: "White sneakers" } }, reasons: [{ about: "Outdoor wedding, November", ok: false, why: "Sneakers are too casual for a wedding." }] }))?.text).toBe(
      "Swap in Look 1: White sneakers was checked and blocked: Sneakers are too casual for a wedding.",
    );
  });

  it("says what a check after a change found, a swapped look's too (R44, R58)", () => {
    expect(checkEntry(check({ again: true, look: { swap: { from: "Nude slingback flats", to: "Tan leather loafers" } } }))?.kind).toBe("recheck");
    expect(checkEntry(check({ again: true }))?.text).toBe("Checked again after your change: Look 1, Garden ceremony still meets everything.");
    expect(checkEntry(check({ again: true, verdict: "conflict", reasons: [{ about: "Budget", ok: false, why: "$17 over your $250 limit" }] }))?.text).toBe(
      "Checked again after your change: Look 1, Garden ceremony no longer fits: $17 over your $250 limit. A new look takes its place.",
    );
  });
});

describe("the whole list", () => {
  it("starts with which products fit now (Q3 in 4d), then the newest first", () => {
    const list = behindTheScenes({
      now: "2026-10-21T15:00:00.000Z",
      notes: [{ text: "Outdoor wedding, November", status: "confirmed", source: "voice", removed: false, at: "2026-10-21T14:00:00.000Z" }],
      photos: [],
      checks: [check({ at: "2026-10-21T14:05:00+00:00" })],
      products: {
        kept: 41,
        total: 140,
        leftOut: [
          { productId: "a", name: "A", category: "shoes", kind: "rule", reason: "Breaks Never: high heels", rule: "Never: high heels" },
          { productId: "b", name: "B", category: "dress", kind: "budget", reason: "Over budget" },
          { productId: "c", name: "C", category: "dress", kind: "budget", reason: "Over budget" },
          { productId: "d", name: "D", category: "suit", kind: "department", reason: "Not womenswear" },
        ],
      },
    });
    expect(list.map((e) => e.kind)).toEqual(["products", "passed", "captured"]);
    expect(list[0].text).toBe("Right now 41 of 140 sample products fit everything you've asked for. Left out: 2 over your budget; 1 for Never: high heels; 1 not womenswear.");
    expect(productsEntry(at, 3, 3, []).text).toBe("Right now 3 of 3 sample products fit everything you've asked for.");
    expect(productsEntry(at, 41, 76, [], "womenswear").text).toBe("Right now 41 of 76 womenswear sample products fit everything you've asked for.");
  });
});
