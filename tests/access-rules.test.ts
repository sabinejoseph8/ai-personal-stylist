import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Phase 1 automated test: guest A cannot read or change any of guest B's rows or photos.
// Runs against the shared database when SUPABASE_SECRET_KEY is set (in .env.local, or GitHub's secrets).
describe.skipIf(!canRunDatabaseTests)("access rules", () => {
  let a: TestGuest;
  let b: TestGuest;
  let sessionId: string;
  let noteId: string;
  const photo = () => `${a.id}/jacket.jpg`;

  beforeAll(async () => {
    a = await createTestGuest();
    b = await createTestGuest();
    await a.db.from("profiles").update({ style_words: ["classic"] }).eq("user_id", a.id).throwOnError();
    // Sessions are the app's own record: only the server creates them (decision A).
    const s = await serverDb().from("sessions").insert({ user_id: a.id }).select("id").single().throwOnError();
    sessionId = s.data!.id;
    // Notes are the app's own record too (2c): only the server writes them.
    const n = await serverDb()
      .from("session_notes")
      .insert({ user_id: a.id, session_id: sessionId, note_text: "Budget: up to $500", kind: "budget" })
      .select("id")
      .single()
      .throwOnError();
    noteId = n.data!.id;
    // Wardrobe items are the app's own record too (3d): only the server writes them.
    await serverDb().from("wardrobe_items").insert({ user_id: a.id, name: "Navy blazer" }).throwOnError();
    // Photos are the app's own record too (3a): only the server adds them.
    const upload = await serverDb()
      .storage.from("guest-photos")
      .upload(photo(), new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }), { upsert: true });
    if (upload.error) throw upload.error;
  }, 30_000);

  // The test shares the live database until launch, so it removes its test guests and their data.
  afterAll(async () => {
    await Promise.all([a?.remove(), b?.remove()]);
  });

  it("guest A sees their own rows", async () => {
    const { data } = await a.db.from("session_notes").select("id").eq("id", noteId);
    expect(data).toHaveLength(1);
  });

  it.each(["profiles", "sessions", "session_notes", "session_assets", "wardrobe_items"])("guest B can't read guest A's %s", async (table) => {
    const { data } = await b.db.from(table).select("*").eq("user_id", a.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("guest B can't change or delete guest A's note", async () => {
    await b.db.from("session_notes").update({ note_text: "Budget: up to $5" }).eq("id", noteId);
    await b.db.from("session_notes").delete().eq("id", noteId);
    const { data } = await a.db.from("session_notes").select("note_text").eq("id", noteId).single();
    expect(data?.note_text).toBe("Budget: up to $500");
  });

  it("guest B can't add a row owned by guest A", async () => {
    const { error } = await b.db.from("session_notes").insert({ user_id: a.id, session_id: sessionId, note_text: "Sneaky" });
    expect(error).not.toBeNull();
  });

  it("guest B can't attach their own rows to guest A's session (Phase 1 code review)", async () => {
    const note = await b.db.from("session_notes").insert({ user_id: b.id, session_id: sessionId, note_text: "Planted" });
    expect(note.error).not.toBeNull();
    const look = await b.db.from("looks").insert({ user_id: b.id, session_id: sessionId });
    expect(look.error).not.toBeNull();
  });

  it("guest B can't open, list, overwrite or delete guest A's photo", async () => {
    const download = await b.db.storage.from("guest-photos").download(photo());
    expect(download.data).toBeNull();
    const list = await b.db.storage.from("guest-photos").list(a.id);
    expect(list.data ?? []).toHaveLength(0);
    const overwrite = await b.db.storage.from("guest-photos").upload(photo(), new Blob(["x"], { type: "image/jpeg" }), { upsert: true });
    expect(overwrite.error).not.toBeNull();
    await b.db.storage.from("guest-photos").remove([photo()]);
    const stillThere = await a.db.storage.from("guest-photos").download(photo());
    expect(stillThere.data).not.toBeNull();
  });

  it("guest B can't put a photo in guest A's folder, or even their own (3a: only the app adds photos)", async () => {
    const theirs = await b.db.storage.from("guest-photos").upload(`${a.id}/planted.jpg`, new Blob(["x"], { type: "image/jpeg" }));
    expect(theirs.error).not.toBeNull();
    const own = await b.db.storage.from("guest-photos").upload(`${b.id}/planted.jpg`, new Blob(["x"], { type: "image/jpeg" }));
    expect(own.error).not.toBeNull();
  });

  it("everyone can read the sample catalog, and nobody can change it", async () => {
    const read = await b.db.from("catalog_products").select("id").limit(1);
    expect(read.error).toBeNull();
    const write = await b.db.from("catalog_products").insert({ department: "womenswear", category: "dress", name: "Fake", price_cents: 100 });
    expect(write.error).not.toBeNull();
  });

  it("guests can't add, change or delete wardrobe items themselves (3d: only the app writes them)", async () => {
    expect((await a.db.from("wardrobe_items").insert({ user_id: a.id, name: "Planted" })).error).not.toBeNull();
    await a.db.from("wardrobe_items").update({ name: "Changed" }).eq("user_id", a.id);
    await a.db.from("wardrobe_items").delete().eq("user_id", a.id);
    const { data } = await a.db.from("wardrobe_items").select("name").eq("user_id", a.id);
    expect(data).toEqual([{ name: "Navy blazer" }]);
  });

  it("guests can't write the bag, saved looks or feedback themselves (review batch 5, E2)", async () => {
    expect((await a.db.from("saved_looks").insert({ user_id: a.id, look: {} })).error?.code).toBe("42501");
    expect((await a.db.from("session_feedback").insert({ user_id: a.id, session_id: sessionId, feedback_kind: "like" })).error?.code).toBe("42501");
    const product = (await serverDb().from("catalog_products").select("id").limit(1).single().throwOnError()).data!;
    expect((await a.db.from("bag_items").insert({ user_id: a.id, product_id: product.id })).error?.code).toBe("42501");
  });

  it("a guest can't make themselves permanent by editing their last-active date, while the app's touch still works (review batch 5, E3)", async () => {
    const lastActive = async () => (await serverDb().from("profiles").select("last_active_at").eq("user_id", a.id).single().throwOnError()).data!.last_active_at as string;
    const before = await lastActive();
    await a.db.from("profiles").update({ last_active_at: "2999-01-01T00:00:00Z" }).eq("user_id", a.id);
    expect(await lastActive()).toBe(before);
    await serverDb().from("profiles").update({ last_active_at: new Date(Date.now() - 2 * 3_600_000).toISOString() }).eq("user_id", a.id).throwOnError();
    await a.db.rpc("touch_last_active").throwOnError();
    expect(Date.parse(await lastActive())).toBeGreaterThan(Date.now() - 60_000);
  });

  it("the rate-limit step refuses junk bucket names and windows (review batch 5, E7)", async () => {
    expect((await a.db.rpc("take_rate_limit", { bucket: "x".repeat(65), max_hits: 5, window_seconds: 60 })).data).toBe(false);
    expect((await a.db.rpc("take_rate_limit", { bucket: "junk", max_hits: 5, window_seconds: 90_000 })).data).toBe(false);
  });

  it("guests can't touch the usage table", async () => {
    const write = await a.db.from("usage").insert({ user_id: a.id, video_seconds: 1 });
    expect(write.error).not.toBeNull();
  });
});
