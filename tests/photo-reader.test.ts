import { describe, expect, it } from "vitest";
import type { Ask } from "@/core/ask";
import { stylistContext } from "@/core/notes/context";
import { createFakeNotesReader } from "@/core/notes/fake-reader";
import { createNotesReader, photoChange } from "@/core/notes/reader";
import { createFakePhotoReader } from "@/core/photos/fake-reader";
import { changeItem, itemForReader, itemForStylist, type PhotoItem, savedReading, type StyleItem } from "@/core/photos/item";
import { createPhotoReader, itemsFrom } from "@/core/photos/reader";
import { photoAnnouncement } from "@/lib/notebook";

// 3b: the photo reader's rules (R28 to R30, R32): its answer shaped into items, changes by touch and
// voice, what the notes reader and the stylist are told, and what screen readers hear.

const blazer: PhotoItem = {
  name: "Navy wool blazer",
  details: {
    type: { value: "blazer", status: "confirmed" },
    colors: { value: "navy", status: "to_confirm" },
    pattern: { value: "solid", status: "confirmed" },
    style: { value: "classic", status: "to_confirm" },
  },
};
const tee: PhotoItem = { ...blazer, name: "White T-shirt", details: { ...blazer.details, type: { value: "t-shirt", status: "confirmed" } } };
const one: StyleItem = { reading: { state: "read", items: [blazer], chosen: 0 }, ownership: null };
const two: StyleItem = { reading: { state: "read", items: [blazer, tee], chosen: null }, ownership: null };
const failed: StyleItem = { reading: { state: "failed", items: [], chosen: null }, ownership: null };

describe("the photo reader's answer", () => {
  const raw = (k: string) => ({ v: "x", k });
  it("puts details Claude is sure of in ink and the rest To confirm (R28)", () => {
    const [item] = itemsFrom({
      items: [{ n: " Navy wool blazer ", t: { v: "blazer", k: "h" }, c: { v: "navy", k: "m" }, p: { v: "solid", k: "h" }, s: { v: "classic", k: "l" } }],
    });
    expect(item).toEqual({
      name: "Navy wool blazer",
      details: {
        type: { value: "blazer", status: "confirmed" },
        colors: { value: "navy", status: "to_confirm" },
        pattern: { value: "solid", status: "confirmed" },
        style: { value: "classic", status: "to_confirm" },
      },
    });
  });

  it("keeps at most 4 items, and drops ones without a name or type", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ n: `Item ${i}`, t: raw("h"), c: raw("h"), p: raw("h"), s: raw("h") }));
    expect(itemsFrom({ items })).toHaveLength(4);
    expect(itemsFrom({ items: [{ n: "", t: raw("h"), c: raw("h"), p: raw("h"), s: raw("h") }] })).toEqual([]);
  });

  it("sends Claude the photo, and gives no items but still the cost when Claude can't answer (R32)", async () => {
    const asked: Parameters<Ask>[0][] = [];
    const ask: Ask = async (request) => {
      asked.push(request);
      return { data: null, costUsd: 0.01 };
    };
    expect(await createPhotoReader(ask).read({ jpegBase64: "abc", width: 10, height: 10 })).toEqual({ items: null, costUsd: 0.01 });
    expect(asked[0].user).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "abc" } },
      { type: "text", text: "What items are in this photo?" },
    ]);
  });

  it("the fake reader for browser tests goes by the photo's shape", async () => {
    const fake = createFakePhotoReader();
    expect((await fake.read({ jpegBase64: "", width: 300, height: 400 })).items?.map((i) => i.name)).toEqual(["Navy wool blazer"]);
    expect((await fake.read({ jpegBase64: "", width: 800, height: 400 })).items?.map((i) => i.name)).toEqual(["Denim jacket", "White T-shirt"]);
    expect((await fake.read({ jpegBase64: "", width: 200, height: 500 })).items).toEqual([]);
  });
});

describe("the item to style around", () => {
  it("a photo still being read shows Analyzing, and one cut off long ago counts as failed", () => {
    expect(savedReading({})).toEqual({ state: "analyzing", items: [], chosen: null });
    const since = new Date(Date.now() - 10_000).toISOString();
    expect(savedReading({ state: "analyzing", items: [], chosen: null, since }).state).toBe("analyzing");
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(savedReading({ state: "analyzing", items: [], chosen: null, since: old }).state).toBe("failed");
  });

  it("a tap confirms a detail; a correction puts the new value in ink and renames the item (R28)", () => {
    expect(changeItem(one, { confirm: ["colors"] }).reading.items[0].details.colors).toEqual({ value: "navy", status: "confirmed" });
    const black = changeItem(one, { set: [{ name: "colors", value: "black" }] });
    expect(black.reading.items[0].name).toBe("Black wool blazer");
    expect(black.reading.items[0].details.colors).toEqual({ value: "black", status: "confirmed" });
  });

  it("picking one of several items, and saying whose it is (R29, R30)", () => {
    const picked = changeItem(two, { choose: 1, ownership: "owned" });
    expect(picked.reading.chosen).toBe(1);
    expect(picked.ownership).toBe("owned");
    expect(changeItem(two, { choose: 7 }).reading.chosen).toBeNull();
    // Corrections wait until an item is chosen.
    expect(changeItem(two, { set: [{ name: "colors", value: "black" }] })).toEqual(two);
  });

  it("describing an item the photo reader couldn't read fills it in, once the shopper says what it is (R32)", () => {
    expect(changeItem(failed, { set: [{ name: "colors", value: "cream" }] }).reading.state).toBe("failed");
    const said = changeItem(failed, {
      set: [
        { name: "type", value: "sweater" },
        { name: "colors", value: "cream" },
      ],
    });
    expect(said.reading).toMatchObject({ state: "read", chosen: 0, items: [{ name: "Cream sweater" }] });
    expect(said.reading.items[0].details.type).toEqual({ value: "sweater", status: "confirmed" });
  });

  it("tells the notes reader the items by number, and the stylist what to ask", () => {
    expect(itemForReader(two)).toContain("1. Navy wool blazer: type=blazer, colors=navy (to confirm)");
    expect(itemForReader(two)).toContain("none chosen yet");
    expect(itemForStylist(two)).toBe("The shopper's photo shows several items: 1. Navy wool blazer; 2. White T-shirt. Ask which one to style around.");
    expect(itemForStylist(one)).toContain("Ask whether it's theirs or an inspiration.");
    expect(itemForStylist({ ...one, ownership: "owned" })).toContain("Ownership: theirs.");
    expect(itemForStylist(failed)).toContain("Ask them to describe it.");
    expect(stylistContext([], [], null, one)).toContain("Style around this item, from the shopper's photo: Navy wool blazer");
  });
});

describe("what the shopper says about the photo", () => {
  it("is read as a change to the item: a choice, whose it is, corrections and confirmations", () => {
    expect(photoChange({ c: 2, o: "m", d: ["colors=black", "nonsense=x", "pattern"], k: ["style", "made-up"] })).toEqual({
      choose: 1,
      ownership: "owned",
      set: [{ name: "colors", value: "black" }],
      confirm: ["style"],
    });
    expect(photoChange({ c: 0, o: "", d: [], k: [] })).toBeUndefined();
  });

  it("the notes reader only asks about the photo when there is one, and drops a note repeating it", async () => {
    const asked: Parameters<Ask>[0][] = [];
    const asksAboutPhoto = (schema: object) => "p" in (schema as { properties: object }).properties;
    const answer = { add: [{ k: "owned_item", t: "Owns a navy wool blazer", d: [] }, { k: "occasion", t: "Office", d: [] }], update: [], remove: [], q: { t: "", o: [] } };
    const ask: Ask = async (request) => {
      asked.push(request);
      return { data: { ...answer, ...(asksAboutPhoto(request.schema) ? { p: { c: 0, o: "m", d: [], k: [] } } : {}) }, costUsd: 0 };
    };
    const reader = createNotesReader(ask);
    const without = await reader.read({ stylistSaid: "", words: "It's mine", notes: [] });
    expect(asksAboutPhoto(asked[0].schema)).toBe(false);
    expect(without?.photo).toBeUndefined();
    const withPhoto = await reader.read({ stylistSaid: "", words: "It's mine", notes: [], item: one });
    expect(asksAboutPhoto(asked[1].schema)).toBe(true);
    expect(asked[1].system).toContain("The shopper has added a photo");
    expect(String(asked[1].user)).toContain("1. Navy wool blazer");
    expect(withPhoto?.photo).toEqual({ ownership: "owned" });
    expect(withPhoto?.changes.add.map((a) => a.text)).toEqual(["Office"]);
  });

  it("the fake notes reader for browser tests knows the photo phrases", async () => {
    const fake = createFakeNotesReader();
    const read = (words: string) => fake.read({ stylistSaid: "", words, notes: [], item: one });
    expect((await read("It's mine"))?.photo).toEqual({ ownership: "owned" });
    expect((await read("The second one"))?.photo).toEqual({ choose: 1 });
    expect((await read("Actually it's black"))?.photo).toEqual({ set: [{ name: "colors", value: "black" }] });
  });
});

describe("what screen readers hear about the photo reader (R68)", () => {
  const p = (reading: "analyzing" | "read" | "failed", extra = {}) => ({ key: "a", state: "ready" as const, active: true, reading, items: 1, ownership: null, ...extra });

  it("says what was recognized, or that it couldn't be", () => {
    expect(photoAnnouncement([p("analyzing")], [p("read", { name: "Navy wool blazer" })])).toBe("Recognized: Navy wool blazer.");
    expect(photoAnnouncement([p("analyzing")], [p("read", { items: 2 })])).toBe("Found 2 items. Which one should we style around?");
    expect(photoAnnouncement([p("analyzing")], [p("failed")])).toBe("Couldn't recognize this item. Describe it instead.");
  });

  it("says which item was chosen and whose it is", () => {
    expect(photoAnnouncement([p("read", { items: 2 })], [p("read", { items: 2, name: "White T-shirt" })])).toBe("Styling around: White T-shirt.");
    expect(photoAnnouncement([p("read", { name: "Navy wool blazer" })], [p("read", { name: "Navy wool blazer", ownership: "owned" })])).toBe("Marked as yours.");
    expect(photoAnnouncement([p("read", { name: "N" })], [p("read", { name: "N", ownership: "inspiration" })])).toBe("Marked as an inspiration.");
  });
});
