import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { dollars } from "@/core/looks/budget";
import type { SavedCopy } from "@/core/looks/saved";
import { touchNote } from "@/core/notes/merge";
import { listBag } from "@/lib/bag-service";
import { deleteGuest } from "@/lib/guest-cleanup";
import { loadNotes, saveNotes, SessionEndedError } from "@/lib/notes-store";
import { PHOTO_BUCKET } from "@/lib/photos-service";
import { loadProfile } from "@/lib/profile-store";
import { endConversation, endLeftBehindCalls, type SessionDeps } from "@/lib/sessions";
import { deleteWardrobe } from "@/lib/wardrobe-service";
import { zip } from "@/lib/zip";

// Profile and privacy (6b; R63 to R66, design 5.8). Clear this session's notes, download my data, delete
// all my data, and the two permissions the app keeps: wardrobe photos and saving preferences (R64,
// Sabine's answers to Q2 and Q3). All with the server key, for the signed-in guest's own rows only.

/** The guest's open session, or null. */
async function openSessionId(db: SupabaseClient, guestId: string): Promise<string | null> {
  const { data } = await db.from("sessions").select("id").eq("user_id", guestId).in("status", ["active", "paused"]).maybeSingle().throwOnError();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Clear this session's notes (R65): every note of the open session is removed, as Remove would (so a
 * later reading can't bring one back), with its "This session only" exceptions and the stylist's waiting
 * question. Saved preferences stay. False when no session is open.
 */
export async function clearSessionNotes(db: SupabaseClient, guestId: string): Promise<boolean> {
  const sessionId = await openSessionId(db, guestId);
  if (!sessionId) return false;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { notes, version, wordsSeq } = await loadNotes(db, sessionId);
      const changed = notes.filter((n) => !n.removed).map((n) => touchNote(notes, n.id, "remove", wordsSeq).changed[0]);
      if (!changed.length || (await saveNotes(db, sessionId, version, changed)) !== null) break;
    }
  } catch (e) {
    if (e instanceof SessionEndedError) return false;
    throw e;
  }
  await Promise.all([
    db.from("session_exceptions").delete().eq("session_id", sessionId).throwOnError(),
    db.from("sessions").update({ question: null, question_turn: null }).eq("id", sessionId).eq("user_id", guestId).throwOnError(),
  ]);
  return true;
}

export type Permission = "wardrobePhotos" | "savingPreferences";

type WardrobeRow = { id: string; name: string; category: string; details: unknown; photo_path: string | null; created_at: string };
type AssetRow = { id: string; source: string; ownership: string | null; photo_path: string | null; created_at: string };

/**
 * Turns a permission on or off (R64). Off asks first on the page, then deletes what it covered: every
 * wardrobe item and its photos (Q2), or every saved preference (Q3). On records the time.
 */
export async function setPermission(db: SupabaseClient, guestId: string, which: Permission, on: boolean) {
  const column = which === "wardrobePhotos" ? "wardrobe_photos_at" : "remember_preferences_at";
  const now = new Date().toISOString();
  if (!on) {
    if (which === "wardrobePhotos") await deleteWardrobe(db, guestId);
    else await db.from("saved_preferences").delete().eq("user_id", guestId).throwOnError();
  }
  await db.from("consents").update({ [column]: on ? now : null, updated_at: now }).eq("user_id", guestId).throwOnError();
}

/** Records the saving-preferences permission when the shopper saves preferences (Q3), as the first wardrobe save does for photos. */
export async function rememberPreferencesAllowed(db: SupabaseClient, guestId: string) {
  const now = new Date().toISOString();
  await db.from("consents").update({ remember_preferences_at: now, updated_at: now }).eq("user_id", guestId).is("remember_preferences_at", null).throwOnError();
}

/** Deletes one saved preference (R65). False when it isn't the guest's. */
export async function deletePreference(db: SupabaseClient, guestId: string, id: string): Promise<boolean> {
  const { data } = await db.from("saved_preferences").delete().eq("id", id).eq("user_id", guestId).select("id").throwOnError();
  return (data ?? []).length > 0;
}

/** Reads a stored photo, or null when it's gone. */
async function photo(db: SupabaseClient, path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data } = await db.storage.from(PHOTO_BUCKET).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/** Up to eight photos read at once, in order: one after another, a full wardrobe took seconds (6d review). */
async function photosOf<T extends { id: string; photo_path: string | null }>(db: SupabaseClient, rows: T[], folder: string) {
  const out: { row: T; file: { path: string; data: Uint8Array } | null }[] = [];
  for (let i = 0; i < rows.length; i += 8) {
    out.push(
      ...(await Promise.all(
        rows.slice(i, i + 8).map(async (row) => {
          const bytes = await photo(db, row.photo_path);
          return { row, file: bytes ? { path: `photos/${folder}/${row.id}.jpg`, data: bytes } : null };
        }),
      )),
    );
  }
  return out;
}

/**
 * Download my data (R65, S9; Sabine's answer to Q1): a ZIP with data.json and a photos folder. What the
 * app keeps about the guest: the profile, saved preferences, permissions, wardrobe items and photos, saved
 * looks, the demo bag, and the open session's notes and photos. Never audio, words or video: none is kept (R63).
 */
export async function exportData(db: SupabaseClient, guestId: string): Promise<Uint8Array> {
  const sessionId = await openSessionId(db, guestId);
  const [profile, consents, wardrobe, saved, bag, notes, photos] = await Promise.all([
    loadProfile(db, guestId),
    db.from("consents").select("wardrobe_photos_at, remember_preferences_at").eq("user_id", guestId).maybeSingle().throwOnError(),
    db.from("wardrobe_items").select("id, name, category, details, photo_path, created_at").eq("user_id", guestId).eq("draft", false).order("created_at").returns<WardrobeRow[]>().throwOnError(),
    db.from("saved_looks").select("look, saved_at").eq("user_id", guestId).order("saved_at").throwOnError(),
    listBag({ db, catalog: createSampleCatalog(db) }, guestId),
    sessionId ? loadNotes(db, sessionId).catch(() => null) : Promise.resolve(null),
    sessionId
      ? db.from("session_assets").select("id, source, ownership, photo_path, created_at").eq("session_id", sessionId).eq("user_id", guestId).eq("status", "ready").order("created_at").returns<AssetRow[]>().throwOnError()
      : Promise.resolve({ data: [] as AssetRow[] }),
  ]);
  const wardrobePhotos = await photosOf(db, wardrobe.data ?? [], "wardrobe");
  const sessionPhotos = await photosOf(db, photos.data ?? [], "session");
  const files = [...wardrobePhotos, ...sessionPhotos].flatMap((p) => (p.file ? [p.file] : []));
  const wardrobeOut = wardrobePhotos.map(({ row: w, file }) => ({ name: w.name, category: w.category, details: w.details, added: w.created_at, photo: file?.path ?? null }));
  const photosOut = sessionPhotos.map(({ row: p, file }) => ({ from: p.source, whose: p.ownership, added: p.created_at, photo: file?.path ?? null }));
  const data = {
    about: "Your data from the AI Personal Stylist demo. Audio, the words you said and camera video are never kept, so they aren't here.",
    exported: new Date().toISOString(),
    profile: { shopping: profile.departments, style: profile.styleWords, sizes: profile.sizes, budget: profile.budget },
    savedPreferences: profile.preferences.map((p) => ({ kind: p.kind, words: p.words })),
    permissions: {
      wardrobePhotos: consents.data?.wardrobe_photos_at ?? null,
      savingPreferences: consents.data?.remember_preferences_at ?? null,
    },
    wardrobe: wardrobeOut,
    savedLooks: (saved.data ?? []).map((s) => {
      const look = s.look as SavedCopy;
      return { name: look.name, reason: look.reason, saved: s.saved_at, pieces: look.items.map((i) => i.name), total: dollars(look.totalCents) };
    }),
    demoBag: bag.map((b) => ({ name: b.name, size: b.size, price: dollars(b.priceCents), note: "Sample product: can't be bought" })),
    thisSession: sessionId
      ? { notes: (notes?.notes ?? []).filter((n) => !n.removed).map((n) => ({ note: n.text, kind: n.kind, status: n.status })), photos: photosOut }
      : null,
  };
  files.unshift({ path: "data.json", data: new TextEncoder().encode(JSON.stringify(data, null, 2)) });
  return zip(files);
}

/**
 * Delete all my data (R65, S19): ends the open conversation and any call left behind, then deletes the
 * guest's photos and the guest, which takes every row with it.
 */
export async function deleteAllData(deps: SessionDeps, guestId: string) {
  const sessionId = await openSessionId(deps.db, guestId);
  if (sessionId) await endConversation(deps, guestId, sessionId).catch((e) => console.error(`delete all: ending the session failed: ${e instanceof Error ? e.message : e}`));
  await endLeftBehindCalls(deps, guestId).catch(() => 0);
  await deleteGuest(deps.db, guestId);
}
