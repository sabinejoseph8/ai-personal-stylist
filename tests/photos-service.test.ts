import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PhotoItem } from "@/core/photos/item";
import type { PhotoReader } from "@/core/photos/reader";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { whileStoreBusy } from "@/lib/photos";
import { busyAnswer } from "./support/test-guests";
import {
  addPhoto,
  changePhoto,
  choosePhoto,
  deleteEndedSessionPhotos,
  deleteSessionPhotos,
  finishPhoto,
  listPhotos,
  PHOTO_BUCKET,
  readPhoto,
  removePhoto,
} from "@/lib/photos-service";
import { sessionContext } from "@/lib/session-context";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 3a: photos to style around against the real database and photo store (R26, R27, R31, FR-27).
// Phase 3 automated tests: a late result for a replaced photo is ignored, and guest B can't open
// guest A's photo. Also: the 5-photo limit, the active photo, and photos deleted when a session ends.
describe.skipIf(!canRunDatabaseTests)("photos to style around", () => {
  const db = serverDb();
  let a: TestGuest;
  let b: TestGuest;
  let session: string;

  const jpeg = (color: string) => sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).jpeg().toBuffer();
  // Like the browser, tried again while the photo store is busy for a moment (decision C).
  const put = (url: string, body: Buffer, type = "image/jpeg") =>
    whileStoreBusy(
      () => fetch(url, { method: "PUT", headers: { "content-type": type }, body: new Uint8Array(body) }),
      busyAnswer,
    );

  /** Add a photo the way the page does: ask, send, then finish. */
  async function upload(guest: TestGuest, body: Buffer, replaces: string | null = null) {
    const added = await addPhoto(db, guest.id, session, "upload", replaces);
    if (!added.ok) throw new Error(added.reason);
    expect((await put(added.uploadUrl, body)).ok).toBe(true);
    return { ...added, finished: await finishPhoto(db, guest.id, session, added.id, added.version) };
  }
  const rows = async () => (await db.from("session_assets").select("*").eq("session_id", session).order("created_at").throwOnError()).data!;
  const files = async (folder: string) => ((await db.storage.from(PHOTO_BUCKET).list(folder)).data ?? []).filter((f) => f.id).map((f) => f.name);

  beforeAll(async () => {
    [a, b] = await Promise.all([createTestGuest(), createTestGuest()]);
  }, 30_000);
  beforeEach(async () => {
    await db.from("sessions").delete().eq("user_id", a.id).throwOnError();
    const s = await db.from("sessions").insert({ user_id: a.id, status: "active" }).select("id").single().throwOnError();
    session = s.data!.id;
  });
  afterAll(async () => {
    await Promise.all([a?.remove(), b?.remove()]);
  });

  it("checks, cleans and keeps a photo, with links that work and no original left behind", async () => {
    const { id, version, finished } = await upload(a, await jpeg("#0b6b4f"));
    expect(finished).toMatchObject({ ok: true, photo: { id, version, source: "upload", active: true } });
    if (!finished?.ok) throw new Error("not kept");
    expect((await fetch(finished.photo.photoUrl)).status).toBe(200);
    expect((await fetch(finished.photo.thumbnailUrl)).headers.get("content-type")).toBe("image/jpeg");
    expect(await rows()).toMatchObject([{ id, status: "ready", version: 1, active: true }]);
    expect(await files(`${a.id}/incoming`)).toEqual([]);
    expect((await files(`${a.id}/${session}`)).sort()).toEqual([`${id}-v1-thumb.jpg`, `${id}-v1.jpg`]);
  });

  it("turns away a renamed text file, and removes it", async () => {
    const { finished } = await upload(a, Buffer.from("Shopping list: blazer, shoes"));
    expect(finished).toEqual({ ok: false, reason: "type" });
    expect(await rows()).toEqual([]);
    expect(await files(`${a.id}/incoming`)).toEqual([]);
  });

  it("the photo store refuses a file over 10 MB and anything not sent as a photo", async () => {
    const added = await addPhoto(db, a.id, session, "upload");
    if (!added.ok) throw new Error(added.reason);
    const big = await put(added.uploadUrl, Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(big.ok).toBe(false);
    expect(await big.text()).toMatch(/413|too large/i);
    expect((await put(added.uploadUrl, Buffer.from("hello"), "text/plain")).ok).toBe(false);
    // Nothing arrived, so there's nothing to keep.
    expect(await finishPhoto(db, a.id, session, added.id, added.version)).toEqual({ ok: false, reason: "missing" });
  });

  it("a late result for a replaced photo is ignored, and the new photo keeps its own (R31)", async () => {
    const first = await upload(a, await jpeg("#1f2a44"));
    const second = await addPhoto(db, a.id, session, "upload", first.id);
    if (!second.ok) throw new Error(second.reason);
    expect(second).toMatchObject({ id: first.id, version: 2 });
    // The original stays, files and all, until the new version is kept (review batch 1).
    expect(await files(`${a.id}/${session}`)).toHaveLength(2);
    expect(await rows()).toMatchObject([{ version: 1, pending_version: 2, status: "ready", active: true }]);

    expect((await put(second.uploadUrl, await jpeg("#b42318"))).ok).toBe(true);
    // A slow finish for the old version doesn't bring it back.
    expect(await finishPhoto(db, a.id, session, first.id, 1)).toBeNull();
    const kept = await finishPhoto(db, a.id, session, second.id, 2);
    expect(kept).toMatchObject({ ok: true, photo: { version: 2, active: true } });
    // The photo reader's answer for version 1 arrives late (3b): refused.
    const late = await db.rpc("save_asset_details", { asset: first.id, expected_version: 1, details: { name: "Navy blazer" } });
    expect(late.data).toBe(false);
    const now = await db.rpc("save_asset_details", { asset: first.id, expected_version: 2, details: { name: "Red dress" } });
    expect(now.data).toBe(true);
    expect(await rows()).toMatchObject([{ version: 2, pending_version: null, status: "ready", recognized_details: { name: "Red dress" } }]);
    // Only the new version's files are left.
    expect((await files(`${a.id}/${session}`)).every((f) => f.startsWith(`${first.id}-v2`))).toBe(true);
    expect(await files(`${a.id}/${session}`)).toHaveLength(2);
  });

  it("a photo becomes the item to style around only once it's kept, so a failed upload leaves the earlier one in use (review batch 1, D1)", async () => {
    const first = await upload(a, await jpeg("#1f2a44"));
    const second = await addPhoto(db, a.id, session, "upload");
    if (!second.ok) throw new Error(second.reason);
    // Nothing uploaded yet: the first photo is still the active one, for the looks and the stylist.
    expect((await rows()).map((r) => [r.id === first.id, r.status, r.active])).toEqual([[true, "ready", true], [false, "uploading", false]]);
    expect((await listPhotos(db, a.id, session)).map((p) => p.id)).toEqual([first.id]);
    expect(await choosePhoto(db, a.id, session, second.id)).toBe(false);
    // The upload never arrives: still the first.
    expect(await finishPhoto(db, a.id, session, second.id, second.version)).toEqual({ ok: false, reason: "missing" });
    expect((await rows()).filter((r) => r.active).map((r) => r.id)).toEqual([first.id]);
    // Once it arrives and is kept, it takes over.
    expect((await put(second.uploadUrl, await jpeg("#b42318"))).ok).toBe(true);
    expect(await finishPhoto(db, a.id, session, second.id, second.version)).toMatchObject({ ok: true, photo: { active: true } });
    expect((await rows()).filter((r) => r.active).map((r) => r.id)).toEqual([second.id]);
    // Removing it hands active back to a kept photo, never to one still uploading.
    const third = await addPhoto(db, a.id, session, "upload");
    if (!third.ok) throw new Error(third.reason);
    expect(await removePhoto(db, a.id, session, second.id)).toBe(true);
    expect((await rows()).filter((r) => r.active).map((r) => r.id)).toEqual([first.id]);
  });

  it("a replacement turned away leaves the original as it was, reading and all (review batch 1, D2)", async () => {
    const first = await upload(a, await jpeg("#1f2a44"));
    expect((await db.rpc("save_asset_details", { asset: first.id, expected_version: 1, details: { name: "Navy blazer" } })).data).toBe(true);
    const replacing = await addPhoto(db, a.id, session, "upload", first.id);
    if (!replacing.ok) throw new Error(replacing.reason);
    // A text file renamed as a photo: the store takes it, the check turns it away.
    expect((await put(replacing.uploadUrl, Buffer.from("not a photo"))).ok).toBe(true);
    expect(await finishPhoto(db, a.id, session, first.id, replacing.version)).toEqual({ ok: false, reason: "type" });
    expect(await rows()).toMatchObject([{ version: 1, pending_version: null, status: "ready", active: true, recognized_details: { name: "Navy blazer" } }]);
    expect(await files(`${a.id}/${session}`)).toHaveLength(2);
    expect(await files(`${a.id}/incoming`)).toEqual([]);
    expect((await listPhotos(db, a.id, session)).map((p) => p.id)).toEqual([first.id]);
  });

  it("guest B can't open, list, finish or change guest A's photo", async () => {
    const { id, finished } = await upload(a, await jpeg("#0b6b4f"));
    if (!finished?.ok) throw new Error("not kept");
    const path = `${a.id}/${session}/${id}-v1.jpg`;
    expect((await b.db.storage.from(PHOTO_BUCKET).download(path)).data).toBeNull();
    expect((await b.db.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60)).data).toBeNull();
    expect((await b.db.from("session_assets").select("id").eq("id", id)).data ?? []).toEqual([]);
    expect(await listPhotos(db, b.id, session)).toEqual([]);
    expect(await finishPhoto(db, b.id, session, id, 1)).toBeNull();
    expect(await addPhoto(db, b.id, session, "upload")).toEqual({ ok: false, reason: "session" });
    expect(await choosePhoto(db, b.id, session, id)).toBe(false);
    expect(await removePhoto(db, b.id, session, id)).toBe(false);
    expect(await rows()).toHaveLength(1);
    // Guest A can open their own.
    expect((await a.db.storage.from(PHOTO_BUCKET).download(path)).data).not.toBeNull();
  });

  it("only the app adds or changes photos: guests can't write photo records or files themselves", async () => {
    const insert = await a.db.from("session_assets").insert({ user_id: a.id, session_id: session, photo_path: "x", source: "upload" });
    expect(insert.error).not.toBeNull();
    const file = await a.db.storage.from(PHOTO_BUCKET).upload(`${a.id}/planted.jpg`, await jpeg("#000000"), { contentType: "image/jpeg" });
    expect(file.error).not.toBeNull();
  });

  it("holds up to 5 photos, with the newest active, and switching or removing moves Active (R31, Q3)", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await upload(a, await jpeg("#575e6a"))).id);
    expect(await addPhoto(db, a.id, session, "upload")).toEqual({ ok: false, reason: "full" });
    expect((await rows()).filter((r) => r.active).map((r) => r.id)).toEqual([ids[4]]);

    expect(await choosePhoto(db, a.id, session, ids[1])).toBe(true);
    expect((await rows()).filter((r) => r.active).map((r) => r.id)).toEqual([ids[1]]);
    // Removing the active photo makes the newest one left active.
    expect(await removePhoto(db, a.id, session, ids[1])).toBe(true);
    expect((await rows()).filter((r) => r.active).map((r) => r.id)).toEqual([ids[4]]);
    expect((await files(`${a.id}/${session}`)).some((f) => f.startsWith(ids[1]))).toBe(false);
    expect((await listPhotos(db, a.id, session)).map((p) => p.id)).toEqual([ids[0], ids[2], ids[3], ids[4]]);
  }, 60_000);

  it("adding, choosing and removing at the same moment wait their turn, keeping one active photo (Phase 3 code review)", async () => {
    const first = (await upload(a, await jpeg("#575e6a"))).id;
    for (let i = 0; i < 3; i++) {
      const [added, chose] = await Promise.all([addPhoto(db, a.id, session, "upload"), choosePhoto(db, a.id, session, first)]);
      expect(added.ok).toBe(true);
      expect(chose).toBe(true);
    }
    const [, removed] = await Promise.all([addPhoto(db, a.id, session, "upload"), removePhoto(db, a.id, session, first)]);
    expect(removed).toBe(true);
    // The only kept photo is gone; the ones still uploading can't be active (review batch 1).
    expect((await rows()).filter((r) => r.active)).toHaveLength(0);
  }, 30_000);

  it("the stylist's context for a session deleted meanwhile is nothing, quietly (Phase 3 code review)", async () => {
    await db.from("sessions").delete().eq("id", session).throwOnError();
    expect(await sessionContext(db, a.id, session)).toBeNull();
  });

  it("a photo is checked and kept only once: asking again does nothing (Phase 3 code review)", async () => {
    const { id, version, uploadUrl } = await upload(a, await jpeg("#0b6b4f"));
    // The one-time link still takes a second file, but the photo is already kept.
    await put(uploadUrl, await jpeg("#a33a2c"));
    expect(await finishPhoto(db, a.id, session, id, version)).toBeNull();
    expect(await files(`${a.id}/incoming`)).toEqual([]);
    expect(await rows()).toMatchObject([{ id, status: "ready", version: 1 }]);
  });

  it("a session's photos are deleted when it ends, and an idle session's on the next clean-up (R63, Q4)", async () => {
    await upload(a, await jpeg("#0b6b4f"));
    expect(await deleteSessionPhotos(db, session)).toBe(1);
    expect(await rows()).toEqual([]);
    expect(await files(`${a.id}/${session}`)).toEqual([]);

    await upload(a, await jpeg("#0b6b4f"));
    // The database timer ends an idle session, but can't delete files.
    await db.from("sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", session).throwOnError();
    expect(await addPhoto(db, a.id, session, "upload")).toEqual({ ok: false, reason: "session" });
    expect(await deleteEndedSessionPhotos(db, a.id)).toBe(1);
    expect(await rows()).toEqual([]);
    expect(await files(`${a.id}/${session}`)).toEqual([]);
  });

  // 3b: the photo reader (R28 to R32), with a stand-in for Claude.
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
  const standIn = (items: PhotoItem[] | null, costUsd = 0.0125): PhotoReader => ({ read: async () => ({ items, costUsd }) });
  const guard = (dailyAiUsd = 1) =>
    createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd, monthlyClaudeUsd: 1e6, monthlyOpenaiUsd: 1e6, monthlyVideoSeconds: 1e9 });
  const spent = async () => (await db.from("usage").select("claude_microdollars").eq("user_id", a.id).maybeSingle()).data?.claude_microdollars ?? 0;

  /** A kept photo, as the browser and the ready step make one. */
  async function kept(color = "#1f2a44", replaces: string | null = null) {
    const { id, version, finished } = await upload(a, await jpeg(color), replaces);
    if (!finished?.ok) throw new Error("not kept");
    return { id, version, finished };
  }

  it("a kept photo shows Analyzing, then the photo reader's answer is saved and charged to the AI allowance (R28)", async () => {
    await db.from("usage").delete().eq("user_id", a.id).throwOnError();
    const { id, version, finished } = await kept();
    expect(finished.photo.item.reading.state).toBe("analyzing");
    expect((await listPhotos(db, a.id, session))[0].item.reading.state).toBe("analyzing");

    const item = await readPhoto({ db, guard: guard(), reader: standIn([blazer]) }, a.id, id, version, finished.jpeg);
    expect(item).toEqual({ reading: { state: "read", items: [blazer], chosen: 0 }, ownership: null });
    expect((await listPhotos(db, a.id, session))[0].item).toEqual(item);
    expect(await spent()).toBe(12500);
    // The stylist is told the item, and what to ask (Q1 in 3b).
    expect(await sessionContext(db, a.id, session)).toContain("Navy wool blazer");
  });

  it("a reading for a photo replaced meanwhile is dropped, so it never lands on the new photo (R31)", async () => {
    const first = await kept();
    const second = await addPhoto(db, a.id, session, "upload", first.id);
    if (!second.ok) throw new Error(second.reason);
    // Until the replacement is kept, the original is still the photo in use, so its reading lands (review batch 1).
    expect(await readPhoto({ db, guard: guard(), reader: standIn([blazer]) }, a.id, first.id, first.version, first.finished.jpeg)).not.toBeNull();
    expect((await rows())[0]).toMatchObject({ version: 1, pending_version: 2 });
    expect((await rows())[0].recognized_details).not.toEqual({});
    // Once the new version is kept, the old version's reading is dropped and the new one starts clean.
    expect((await put(second.uploadUrl, await jpeg("#b42318"))).ok).toBe(true);
    expect(await finishPhoto(db, a.id, session, first.id, second.version)).toMatchObject({ ok: true, photo: { version: 2 } });
    expect(await readPhoto({ db, guard: guard(), reader: standIn([blazer]) }, a.id, first.id, first.version, first.finished.jpeg)).toBeNull();
    expect((await rows())[0]).toMatchObject({ version: 2, pending_version: null, recognized_details: {} });
  });

  it("a failed reading, or the day's AI used up, leaves the photo with Describe it instead (R32)", async () => {
    await db.from("usage").delete().eq("user_id", a.id).throwOnError();
    const one = await kept();
    expect((await readPhoto({ db, guard: guard(), reader: standIn(null) }, a.id, one.id, one.version, one.finished.jpeg))?.reading.state).toBe("failed");
    // A cut-off answer is still paid for, so it counts toward the allowance (3e).
    expect(await spent()).toBe(12500);
    const nothing = await readPhoto({ db, guard: guard(), reader: standIn([]) }, a.id, one.id, one.version, one.finished.jpeg);
    expect(nothing?.reading.state).toBe("failed");
    let asked = false;
    const watching: PhotoReader = { read: async () => ((asked = true), { items: [blazer], costUsd: 0 }) };
    const broke = await readPhoto({ db, guard: guard(0), reader: watching }, a.id, one.id, one.version, one.finished.jpeg);
    expect(broke?.reading.state).toBe("failed");
    expect(asked).toBe(false);
    expect(await sessionContext(db, a.id, session)).toContain("Ask them to describe it");
  });

  it("taps confirm a detail, pick one of several items and say whose it is; changes at the same moment both land (R28 to R30)", async () => {
    const { id, version, finished } = await kept();
    await readPhoto({ db, guard: guard(), reader: standIn([blazer, tee]) }, a.id, id, version, finished.jpeg);
    expect(await sessionContext(db, a.id, session)).toContain("Ask which one to style around");
    expect((await changePhoto(db, a.id, session, id, { choose: 1 }))?.reading.chosen).toBe(1);
    // A tap and a spoken "it's mine" together: one is tried again on the other's result.
    await Promise.all([changePhoto(db, a.id, session, id, { confirm: ["style"] }), changePhoto(db, a.id, session, id, { ownership: "owned" })]);
    const [photo] = await listPhotos(db, a.id, session);
    expect(photo.item.ownership).toBe("owned");
    expect(photo.item.reading.items[1].details.style.status).toBe("confirmed");
    expect(await sessionContext(db, a.id, session)).toContain("White T-shirt");
    // Guest B can't change it.
    expect(await changePhoto(db, b.id, session, id, { ownership: "inspiration" })).toBeNull();
    // A change for an old version of the photo is dropped.
    expect(await changePhoto(db, a.id, session, id, { ownership: "inspiration" }, version + 1)).toBeNull();
  });
});
