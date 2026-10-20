import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Phase 1 automated test: guest A cannot read or change any of guest B's rows or photos.
// Runs against the database (shared by development and the live site until launch) when its address and public key are set
// (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local or the environment).
function setting(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() || undefined;
}

const url = setting("NEXT_PUBLIC_SUPABASE_URL");
const key = setting("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

async function guest(): Promise<{ db: SupabaseClient; id: string }> {
  const db = createClient(url!, key!, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`anonymous sign-in failed: ${error?.message}`);
  return { db, id: data.user.id };
}

describe.skipIf(!url || !key)("access rules", () => {
  let a: { db: SupabaseClient; id: string };
  let b: { db: SupabaseClient; id: string };
  let sessionId: string;
  let noteId: string;
  const photo = () => `${a.id}/jacket.jpg`;

  beforeAll(async () => {
    a = await guest();
    b = await guest();
    await a.db.from("profiles").insert({ style_words: ["classic"] }).throwOnError();
    const s = await a.db.from("sessions").insert({}).select("id").single().throwOnError();
    sessionId = s.data!.id;
    const n = await a.db
      .from("session_notes")
      .insert({ session_id: sessionId, note_text: "Budget: up to $500", kind: "budget" })
      .select("id")
      .single()
      .throwOnError();
    noteId = n.data!.id;
    await a.db.from("wardrobe_items").insert({ name: "Navy blazer" }).throwOnError();
    const upload = await a.db.storage.from("guest-photos").upload(photo(), new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }));
    if (upload.error) throw upload.error;
  }, 30_000);

  // The test shares the live database until launch, so it removes what it made. The two
  // anonymous test guests themselves are removed by the daily clean-up job (1f).
  afterAll(async () => {
    await a.db.storage.from("guest-photos").remove([photo()]);
    await a.db.from("sessions").delete().eq("id", sessionId);
    await a.db.from("wardrobe_items").delete().eq("user_id", a.id);
    await a.db.from("profiles").delete().eq("user_id", a.id);
    await Promise.all([a.db.auth.signOut(), b.db.auth.signOut()]);
  });

  it("guest A sees their own rows", async () => {
    const { data } = await a.db.from("session_notes").select("id").eq("id", noteId);
    expect(data).toHaveLength(1);
  });

  it.each(["profiles", "sessions", "session_notes", "wardrobe_items"])("guest B can't read guest A's %s", async (table) => {
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

  it("guest B can't put a photo in guest A's folder", async () => {
    const { error } = await b.db.storage.from("guest-photos").upload(`${a.id}/planted.jpg`, new Blob(["x"], { type: "image/jpeg" }));
    expect(error).not.toBeNull();
  });

  it("everyone can read the sample catalog, and nobody can change it", async () => {
    const read = await b.db.from("catalog_products").select("id").limit(1);
    expect(read.error).toBeNull();
    const write = await b.db.from("catalog_products").insert({ department: "womenswear", category: "dress", name: "Fake", price_cents: 100 });
    expect(write.error).not.toBeNull();
  });

  it("guests can't touch the usage table", async () => {
    const write = await a.db.from("usage").insert({ user_id: a.id, video_seconds: 1 });
    expect(write.error).not.toBeNull();
  });
});
