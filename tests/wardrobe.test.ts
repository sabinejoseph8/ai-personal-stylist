import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { stylistContext } from "@/core/notes/context";
import type { PhotoItem } from "@/core/photos/item";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { addPhoto, deleteSessionPhotos, finishPhoto, PHOTO_BUCKET } from "@/lib/photos-service";
import { categoryOf, WardrobeEdit } from "@/lib/wardrobe";
import {
  chooseForStyling,
  deleteItem,
  editItem,
  finishUpload,
  listWardrobe,
  saveFromPhoto,
  startUpload,
  stylingItems,
  stylingPicks,
} from "@/lib/wardrobe-service";
import { canRunDatabaseTests, clearPhotos, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 3d: the wardrobe (R36, R37). Categories from the photo reader's type, the edit checks, what the
// stylist is told, and against the real database: Save to wardrobe (permission first, a copy of the
// photo that outlives the session, never twice), Add item, edit, delete, Style with these, and who can
// see what. Phase 3 automated test: wardrobe add, edit and delete all work.

describe("wardrobe rules", () => {
  it("puts the photo reader's types in the design's categories", () => {
    expect(categoryOf("blazer")).toBe("outerwear");
    expect(categoryOf("sneakers")).toBe("shoes");
    expect(categoryOf("t-shirt")).toBe("tops");
    expect(categoryOf("jeans")).toBe("bottoms");
    expect(categoryOf("t-shirt dress")).toBe("dresses");
    expect(categoryOf("tote")).toBe("bags");
    expect(categoryOf("scarf")).toBe("accessories");
    expect(categoryOf("umbrella")).toBe("other");
  });

  it("an edit needs a name, a known category and short details", () => {
    const ok = { name: " Navy blazer ", category: "outerwear", details: { type: "blazer", colors: "navy", pattern: "solid", style: "classic" } };
    expect(WardrobeEdit.parse(ok).name).toBe("Navy blazer");
    expect(WardrobeEdit.safeParse({ ...ok, name: " " }).success).toBe(false);
    expect(WardrobeEdit.safeParse({ ...ok, category: "hats" }).success).toBe(false);
    expect(WardrobeEdit.safeParse({ ...ok, details: { ...ok.details, colors: "x".repeat(61) } }).success).toBe(false);
  });

  it("tells the stylist which wardrobe items the shopper chose to style with", () => {
    const context = stylistContext([], [], null, null, [{ name: "Navy wool blazer", category: "outerwear", details: { colors: "navy", pattern: "solid", style: "classic" } }]);
    expect(context).toContain("The shopper chose these items they own, from their wardrobe, to style with: Navy wool blazer (outerwear, navy, solid, classic).");
    expect(stylistContext([], [], null)).not.toContain("wardrobe");
  });
});

describe.skipIf(!canRunDatabaseTests)("the wardrobe", () => {
  const db = serverDb();
  let a: TestGuest;
  let b: TestGuest;
  let session: string;
  const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#1f2a44" } }).jpeg().toBuffer();
  const put = (url: string, body: Buffer) => fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: new Uint8Array(body) });
  const blazer: PhotoItem = {
    name: "Navy wool blazer",
    details: {
      type: { value: "blazer", status: "confirmed" },
      colors: { value: "navy", status: "to_confirm" },
      pattern: { value: "solid", status: "confirmed" },
      style: { value: "classic", status: "to_confirm" },
    },
  };
  const reading = { state: "read", items: [blazer], chosen: 0 };
  const guard = () => createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd: 1, monthlyClaudeUsd: 1e6, monthlyOpenaiUsd: 1e6, monthlyVideoSeconds: 1e9 });
  const files = async (folder: string) => ((await db.storage.from(PHOTO_BUCKET).list(folder)).data ?? []).filter((f) => f.id).map((f) => f.name);

  /** A kept session photo, read as a navy wool blazer and marked as the guest's own. */
  async function ownedPhoto(ownership: "owned" | "inspiration" = "owned") {
    const added = await addPhoto(db, a.id, session, "upload");
    if (!added.ok) throw new Error(added.reason);
    await put(added.uploadUrl, await jpeg());
    const kept = await finishPhoto(db, a.id, session, added.id, added.version);
    if (!kept?.ok) throw new Error("not kept");
    await db.from("session_assets").update({ recognized_details: reading, ownership }).eq("id", added.id).throwOnError();
    return added.id;
  }

  beforeAll(async () => {
    [a, b] = await Promise.all([createTestGuest(), createTestGuest()]);
  }, 30_000);
  beforeEach(async () => {
    await db.from("sessions").delete().eq("user_id", a.id).throwOnError();
    await db.from("wardrobe_items").delete().eq("user_id", a.id).throwOnError();
    await clearPhotos(a.id);
    await db.from("consents").update({ wardrobe_photos_at: null }).eq("user_id", a.id).throwOnError();
    session = (await db.from("sessions").insert({ user_id: a.id, status: "active" }).select("id").single().throwOnError()).data!.id;
  });
  afterAll(async () => {
    await Promise.all([a?.remove(), b?.remove()]);
  });

  it("Save to wardrobe asks for permission first, records it, and keeps a copy that outlives the session (R36, R31)", async () => {
    const photo = await ownedPhoto();
    expect(await saveFromPhoto(db, a.id, photo, false)).toEqual({ ok: false, reason: "permission" });
    const saved = await saveFromPhoto(db, a.id, photo, true);
    if (!saved.ok) throw new Error(saved.reason);
    expect(saved.item).toMatchObject({ name: "Navy wool blazer", category: "outerwear", details: { type: "blazer", colors: "navy", pattern: "solid", style: "classic" } });
    expect((await db.from("consents").select("wardrobe_photos_at").eq("user_id", a.id).single()).data?.wardrobe_photos_at).not.toBeNull();
    expect((await files(`${a.id}/wardrobe`)).sort()).toEqual([`${saved.item.id}-thumb.jpg`, `${saved.item.id}.jpg`]);

    // Saving again gives the same item; and the session ending doesn't take it away.
    const again = await saveFromPhoto(db, a.id, photo, false);
    expect(again).toMatchObject({ ok: true, item: { id: saved.item.id } });
    await deleteSessionPhotos(db, session);
    const [kept] = await listWardrobe(db, a.id);
    expect(kept.id).toBe(saved.item.id);
    expect((await fetch(kept.photoUrl!)).status).toBe(200);
  });

  it("only saves an item marked as the guest's own", async () => {
    const photo = await ownedPhoto("inspiration");
    expect(await saveFromPhoto(db, a.id, photo, true)).toEqual({ ok: false, reason: "not_owned" });
    expect(await saveFromPhoto(db, b.id, photo, true)).toEqual({ ok: false, reason: "photo" });
  });

  it("Add item: permission first, then the photo is cleaned, read and kept as a draft until its details are saved (R37, Q1)", async () => {
    expect(await startUpload(db, a.id, false)).toEqual({ ok: false, reason: "permission" });
    const started = await startUpload(db, a.id, true);
    if (!started.ok) throw new Error(started.reason);
    expect((await put(started.uploadUrl, await jpeg())).ok).toBe(true);
    const reader = { read: async () => ({ items: [blazer], costUsd: 0.0125 }) };
    const done = await finishUpload({ db, guard: guard(), reader }, a.id, started.id);
    if (!done.ok) throw new Error(done.reason);
    expect(done.item).toMatchObject({ name: "Navy wool blazer", category: "outerwear" });
    // A draft isn't in the wardrobe until it's saved.
    expect(await listWardrobe(db, a.id)).toEqual([]);
    const saved = await editItem(db, a.id, started.id, { name: "My navy blazer", category: "outerwear", details: { ...done.item.details, colors: "dark navy" } });
    expect(saved).toMatchObject({ name: "My navy blazer", details: { colors: "dark navy" } });
    expect((await listWardrobe(db, a.id)).map((i) => i.name)).toEqual(["My navy blazer"]);

    // An upload is added only once: a second file on the same link can't replace the item's photo (Phase 3 code review).
    const before = await db.storage.from(PHOTO_BUCKET).download(`${a.id}/wardrobe/${started.id}.jpg`);
    await put(started.uploadUrl, await sharp({ create: { width: 64, height: 48, channels: 3, background: "#a33a2c" } }).jpeg().toBuffer());
    expect(await finishUpload({ db, guard: guard(), reader }, a.id, started.id)).toEqual({ ok: false, reason: "missing" });
    const after = await db.storage.from(PHOTO_BUCKET).download(`${a.id}/wardrobe/${started.id}.jpg`);
    expect(Buffer.from(await after.data!.arrayBuffer()).equals(Buffer.from(await before.data!.arrayBuffer()))).toBe(true);
    expect(await files(`${a.id}/incoming`)).toEqual([]);
  });

  it("Add item turns away a file that isn't a photo, and a draft left for an hour is deleted with its photo", async () => {
    const started = await startUpload(db, a.id, true);
    if (!started.ok) throw new Error(started.reason);
    await put(started.uploadUrl, Buffer.from("Shopping list"));
    expect(await finishUpload({ db, guard: guard(), reader: { read: async () => ({ items: null, costUsd: 0 }) } }, a.id, started.id)).toEqual({ ok: false, reason: "type" });

    const second = await startUpload(db, a.id, false);
    if (!second.ok) throw new Error(second.reason);
    await put(second.uploadUrl, await jpeg());
    const done = await finishUpload({ db, guard: guard(), reader: { read: async () => ({ items: null, costUsd: 0 }) } }, a.id, second.id);
    expect(done).toMatchObject({ ok: true, read: false, item: { name: "New item", category: "other" } });
    await db.from("wardrobe_items").update({ created_at: new Date(Date.now() - 2 * 3600_000).toISOString() }).eq("id", second.id).throwOnError();
    expect(await listWardrobe(db, a.id)).toEqual([]);
    expect((await db.from("wardrobe_items").select("id").eq("id", second.id)).data).toEqual([]);
    expect(await files(`${a.id}/wardrobe`)).toEqual([]);
  });

  it("Delete removes the item and its photo; guest B can't see, change or delete it (R37)", async () => {
    const saved = await saveFromPhoto(db, a.id, await ownedPhoto(), true);
    if (!saved.ok) throw new Error(saved.reason);
    const id = saved.item.id;
    expect(await listWardrobe(db, b.id)).toEqual([]);
    expect(await editItem(db, b.id, id, { name: "Mine now", category: "other", details: saved.item.details })).toBeNull();
    expect(await deleteItem(db, b.id, id)).toBe(false);
    expect((await b.db.storage.from(PHOTO_BUCKET).download(`${a.id}/wardrobe/${id}.jpg`)).data).toBeNull();

    expect(await deleteItem(db, a.id, id)).toBe(true);
    expect(await listWardrobe(db, a.id)).toEqual([]);
    expect(await files(`${a.id}/wardrobe`)).toEqual([]);
  });

  it("Style with these chooses exactly those items, for the notebook and the stylist (R37, Q2)", async () => {
    const one = await saveFromPhoto(db, a.id, await ownedPhoto(), true);
    const two = await saveFromPhoto(db, a.id, await ownedPhoto(), true);
    if (!one.ok || !two.ok) throw new Error("not saved");
    await chooseForStyling(db, a.id, [one.item.id, two.item.id]);
    expect((await stylingItems(db, a.id)).map((i) => i.id)).toEqual([one.item.id, two.item.id]);
    await chooseForStyling(db, a.id, [two.item.id]);
    expect((await stylingItems(db, a.id)).map((i) => i.id)).toEqual([two.item.id]);
    expect(await stylingPicks(db, a.id)).toEqual([{ name: "Navy wool blazer", category: "outerwear", details: { type: "blazer", colors: "navy", pattern: "solid", style: "classic" } }]);
    // Another guest's ids choose nothing.
    await chooseForStyling(db, b.id, [one.item.id]);
    expect((await stylingItems(db, a.id)).map((i) => i.id)).toEqual([two.item.id]);
  }, 30_000);
});
