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
    const log = await b.db.from("event_log").insert({ user_id: b.id, session_id: sessionId, entry_type: "note", summary: "Planted" });
    expect(log.error).not.toBeNull();
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

  it("guests can't touch the usage table", async () => {
    const write = await a.db.from("usage").insert({ user_id: a.id, video_seconds: 1 });
    expect(write.error).not.toBeNull();
  });
});
