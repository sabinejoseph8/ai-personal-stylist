import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeProvider } from "@/connectors/conversation/fake";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { PHOTO_BUCKET } from "@/lib/photos-service";
import { clearSessionNotes, deleteAllData, deletePreference, exportData, rememberPreferencesAllowed, setPermission } from "@/lib/privacy-service";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import type { SessionDeps } from "@/lib/sessions";
import { crc32 } from "@/lib/zip";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 6b: Profile and privacy (R63 to R66) against the database. Phase 6 automated tests: Download my data
// includes saved notes and captured stills, and no audio, transcripts or video; Delete all data removes
// rows, photos and the guest sign-in. Turning off wardrobe photos (Q2) or saving preferences (Q3)
// deletes what it covered.

/** The files in a ZIP, by path (the reader from tests/zip.test.ts, kept short). */
function unzip(file: Uint8Array) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const end = file.length - 22;
  let at = view.getUint32(end + 16, true);
  const out: Record<string, Uint8Array> = {};
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const start = local + 30 + view.getUint16(local + 26, true);
    out[new TextDecoder().decode(file.subarray(at + 46, at + 46 + nameLength))] = file.subarray(start, start + size);
    expect(crc32(out[new TextDecoder().decode(file.subarray(at + 46, at + 46 + nameLength))])).toBe(view.getUint32(at + 16, true));
    at += 46 + nameLength;
  }
  return out;
}

describe.skipIf(!canRunDatabaseTests)("profile and privacy", () => {
  const db = serverDb();
  let guest: TestGuest;
  let other: TestGuest;
  let session: string;
  const jpeg = () => sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).jpeg().toBuffer();
  const deps = (): SessionDeps => ({ db, provider: createFakeProvider(), guard: createBudgetGuard(db, { ...readBudgetLimits({}), monthlyVideoSeconds: 1e9 }) });

  /** A wardrobe item with a stored photo. */
  async function wardrobeItem(owner: TestGuest, name: string) {
    const { data } = await db.from("wardrobe_items").insert({ user_id: owner.id, name, category: "outerwear", draft: false }).select("id").single().throwOnError();
    const path = `${owner.id}/wardrobe/${data!.id}.jpg`;
    await db.storage.from(PHOTO_BUCKET).upload(path, await jpeg(), { contentType: "image/jpeg", upsert: true });
    await db.from("wardrobe_items").update({ photo_path: path }).eq("id", data!.id).throwOnError();
    return { id: data!.id as string, path };
  }
  const stored = async (path: string) => !!(await db.storage.from(PHOTO_BUCKET).download(path)).data;

  beforeAll(async () => {
    [guest, other] = await Promise.all([createTestGuest(), createTestGuest()]);
  }, 30_000);
  beforeEach(async () => {
    const { budget, preferences, ...shopping } = SAMPLE_PROFILE;
    await saveShopping(guest.db, guest.id, shopping);
    await saveBudget(guest.db, guest.id, budget);
    await savePreferences(guest.db, preferences);
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    session = (await db.from("sessions").insert({ user_id: guest.id, status: "active" }).select("id").single().throwOnError()).data!.id;
    await db
      .from("session_notes")
      .insert([
        { user_id: guest.id, session_id: session, kind: "occasion", note_text: "Outdoor wedding, November", status: "confirmed", hidden_details: [], source: "voice" },
        { user_id: guest.id, session_id: session, kind: "style", note_text: "Elegant", status: "to_confirm", hidden_details: [], source: "voice" },
      ])
      .throwOnError();
  });
  afterAll(async () => Promise.all([guest?.remove(), other?.remove()]));

  it("Download my data is a ZIP with the profile, preferences, wardrobe photo and this session's notes, and nothing of anyone else's (R65, S9)", async () => {
    const mine = await wardrobeItem(guest, "Navy wool blazer");
    const theirs = await wardrobeItem(other, "Someone else's coat");
    try {
      const files = unzip(await exportData(db, guest.id));
      const data = JSON.parse(new TextDecoder().decode(files["data.json"]));
      expect(data.savedPreferences.map((p: { words: string }) => p.words)).toEqual(SAMPLE_PROFILE.preferences.map((p) => p.words));
      expect(data.profile.sizes).toEqual(SAMPLE_PROFILE.sizes);
      expect(data.wardrobe.map((w: { name: string }) => w.name)).toEqual(["Navy wool blazer"]);
      expect(files[`photos/wardrobe/${mine.id}.jpg`]?.length).toBeGreaterThan(100);
      expect(Object.keys(files).some((f) => f.includes(theirs.id))).toBe(false);
      expect(data.thisSession.notes.map((n: { note: string }) => n.note).sort()).toEqual(["Elegant", "Outdoor wedding, November"]);
      // Nothing that's never kept: no audio, words or video.
      expect(Object.keys(files).every((f) => f === "data.json" || f.endsWith(".jpg"))).toBe(true);
      expect(JSON.stringify(data)).not.toMatch(/transcript|audio_url|video_url/);
    } finally {
      await db.from("wardrobe_items").delete().in("id", [mine.id, theirs.id]);
      await db.storage.from(PHOTO_BUCKET).remove([mine.path, theirs.path]);
    }
  }, 60_000);

  it("Clear this session's notes removes the notes and exceptions, and keeps saved preferences (R65)", async () => {
    const { data: prefs } = await db.from("saved_preferences").select("id").eq("user_id", guest.id).throwOnError();
    await db.from("session_exceptions").insert({ user_id: guest.id, session_id: session, saved_preference_id: prefs![0].id }).throwOnError();
    expect(await clearSessionNotes(db, guest.id)).toBe(true);
    const { data: notes } = await db.from("session_notes").select("removed").eq("session_id", session).throwOnError();
    expect(notes!.length).toBe(2);
    expect(notes!.every((n) => n.removed)).toBe(true);
    expect((await db.from("session_exceptions").select("id").eq("session_id", session)).data).toEqual([]);
    expect((await db.from("saved_preferences").select("id").eq("user_id", guest.id)).data).toHaveLength(prefs!.length);
    // With no session open, there's nothing to clear.
    await db.from("sessions").update({ status: "ended" }).eq("id", session).throwOnError();
    expect(await clearSessionNotes(db, guest.id)).toBe(false);
  }, 60_000);

  it("turning off wardrobe photos deletes the wardrobe and its photos; saving preferences deletes them (Q2, Q3)", async () => {
    const item = await wardrobeItem(guest, "Navy wool blazer");
    const theirs = await wardrobeItem(other, "Someone else's coat");
    try {
      await setPermission(db, guest.id, "wardrobePhotos", true);
      await setPermission(db, guest.id, "wardrobePhotos", false);
      expect((await db.from("wardrobe_items").select("id").eq("user_id", guest.id)).data).toEqual([]);
      expect(await stored(item.path)).toBe(false);
      expect(await stored(theirs.path)).toBe(true);
      const consents = async () => (await db.from("consents").select("wardrobe_photos_at, remember_preferences_at").eq("user_id", guest.id).single().throwOnError()).data!;
      expect((await consents()).wardrobe_photos_at).toBeNull();

      await setPermission(db, guest.id, "savingPreferences", false);
      expect((await db.from("saved_preferences").select("id").eq("user_id", guest.id)).data).toEqual([]);
      expect((await consents()).remember_preferences_at).toBeNull();
      // Saving preferences again records the permission, once.
      await rememberPreferencesAllowed(db, guest.id);
      const first = (await consents()).remember_preferences_at;
      expect(first).not.toBeNull();
      await rememberPreferencesAllowed(db, guest.id);
      expect((await consents()).remember_preferences_at).toBe(first);
    } finally {
      await db.from("wardrobe_items").delete().eq("id", theirs.id);
      await db.storage.from(PHOTO_BUCKET).remove([theirs.path]);
    }
  }, 60_000);

  it("deletes one saved preference, only the guest's own (R65)", async () => {
    const { data: prefs } = await db.from("saved_preferences").select("id, words").eq("user_id", guest.id).throwOnError();
    expect(await deletePreference(db, other.id, prefs![0].id)).toBe(false);
    expect(await deletePreference(db, guest.id, prefs![0].id)).toBe(true);
    expect((await db.from("saved_preferences").select("id").eq("user_id", guest.id)).data).toHaveLength(prefs!.length - 1);
  }, 30_000);

  it("Delete all my data removes the rows, the photos and the guest sign-in (R65, S19)", async () => {
    const gone = await createTestGuest({ fresh: true });
    try {
      const item = await wardrobeItem(gone, "Navy wool blazer");
      const s = (await db.from("sessions").insert({ user_id: gone.id, status: "active" }).select("id").single().throwOnError()).data!.id;
      await db.from("session_notes").insert({ user_id: gone.id, session_id: s, kind: "style", note_text: "Elegant", status: "confirmed", hidden_details: [], source: "voice" }).throwOnError();
      await deleteAllData(deps(), gone.id);
      expect((await db.auth.admin.getUserById(gone.id)).data.user).toBeNull();
      for (const table of ["profiles", "sessions", "session_notes", "wardrobe_items", "saved_preferences", "consents"]) {
        expect((await db.from(table).select("user_id").eq("user_id", gone.id)).data).toEqual([]);
      }
      expect(await stored(item.path)).toBe(false);
    } finally {
      await gone.remove().catch(() => undefined);
    }
  }, 60_000);
});
