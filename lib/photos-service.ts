import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanPhoto, type PhotoRefusal } from "@/lib/photo-cleaner";
import { MAX_PHOTO_BYTES, type PhotoSource, type ShownPhoto } from "@/lib/photos";

// The item to style around (3a; R26, R27, R31, FR-27). Photos are the app's own record (decision A),
// so this runs with the server key and checks every photo belongs to the guest's session. Adding one
// takes two steps, because Vercel refuses anything over 4.5 MB (Sabine's answer to Q1 in 3a): the app
// gives the browser a one-time upload link into the guest's private folder, then checks and cleans
// what arrived, keeps the clean copy and deletes the original. Every photo has a version, and a new
// version gets new files, so nothing late can bring back a replaced photo.

export const PHOTO_BUCKET = "guest-photos";
/** Links to photos stop working after 30 minutes. The page asks for fresh ones when it needs them. */
const LINK_SECONDS = 30 * 60;

type Row = { id: string; user_id: string; version: number; source: PhotoSource; active: boolean; photo_path: string; thumbnail_path: string };
const COLUMNS = "id, user_id, version, source, active, photo_path, thumbnail_path";

/** Where the browser sends a photo before it's checked. */
const incomingPath = (owner: string, id: string, version: number) => `${owner}/incoming/${id}-v${version}`;
const allPaths = (r: Row) => [r.photo_path, r.thumbnail_path, incomingPath(r.user_id, r.id, r.version)];

async function removeFiles(db: SupabaseClient, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`deleting photos failed: ${error.message}`);
  }
}

const logFailure = (what: string) => (e: unknown) => console.error(`${what} failed: ${e instanceof Error ? e.message : e}`);

/** Links for photo rows, in the same order. Works with the guest's own sign-in or the server key. */
export async function shownPhotos(db: SupabaseClient, rows: Row[]): Promise<ShownPhoto[]> {
  if (!rows.length) return [];
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(
    rows.flatMap((r) => [r.photo_path, r.thumbnail_path]),
    LINK_SECONDS,
  );
  if (error) throw new Error(`making photo links failed: ${error.message}`);
  const links = new Map(data.map((d) => [d.path, d.signedUrl]));
  return rows.flatMap((r) => {
    const photoUrl = links.get(r.photo_path);
    const thumbnailUrl = links.get(r.thumbnail_path);
    return photoUrl && thumbnailUrl ? [{ id: r.id, version: r.version, source: r.source, active: r.active, photoUrl, thumbnailUrl }] : [];
  });
}

/** The session's checked photos, oldest first, with fresh links. Empty when the session isn't the guest's. */
export async function listPhotos(db: SupabaseClient, guestId: string, sessionId: string) {
  const { data } = await db
    .from("session_assets")
    .select(COLUMNS)
    .eq("session_id", sessionId)
    .eq("user_id", guestId)
    .eq("status", "ready")
    .order("created_at")
    .returns<Row[]>()
    .throwOnError();
  return shownPhotos(db, data ?? []);
}

export type AddRefusal = "session" | "full" | "photo";
type Added = { id: string; version: number; replaced_paths: string[] } | { refused: AddRefusal };

/**
 * Add a photo, or Replace one with a new version of it (R26, R31). Returns the photo's id and
 * version and a one-time upload link, or why not: the session isn't the guest's open one, it already
 * has 5 photos (Sabine's answer to Q3 in 3a), or there's no such photo to replace.
 */
export async function addPhoto(db: SupabaseClient, guestId: string, sessionId: string, source: PhotoSource, replaces: string | null = null) {
  const { data } = await db
    .rpc("add_session_asset", { owner: guestId, session: sessionId, asset_source: source, replaced: replaces })
    .throwOnError();
  const added = data as Added;
  if ("refused" in added) return { ok: false as const, reason: added.refused };
  // The replaced version's files go straight away.
  if (replaces) await removeFiles(db, [...added.replaced_paths, incomingPath(guestId, added.id, added.version - 1)]).catch(logFailure("deleting a replaced photo"));
  const link = await db.storage.from(PHOTO_BUCKET).createSignedUploadUrl(incomingPath(guestId, added.id, added.version));
  if (link.error) throw new Error(`making an upload link failed: ${link.error.message}`);
  return { ok: true as const, id: added.id, version: added.version, uploadUrl: link.data.signedUrl };
}

export type FinishRefusal = PhotoRefusal | "missing";

/**
 * The browser has sent the photo: check it, clean it, and keep the clean copy (FR-27). The original
 * is deleted either way. A photo turned away is removed. Returns null when the photo has been
 * replaced or removed since, or its session has ended.
 */
export async function finishPhoto(db: SupabaseClient, guestId: string, sessionId: string, photoId: string, version: number) {
  const { data: row } = await db
    .from("session_assets")
    .select(COLUMNS)
    .eq("id", photoId)
    .eq("session_id", sessionId)
    .eq("user_id", guestId)
    .maybeSingle<Row>()
    .throwOnError();
  const original = incomingPath(guestId, photoId, version);
  if (!row || row.version !== version) {
    await removeFiles(db, [original]).catch(logFailure("deleting an outdated upload"));
    return null;
  }

  const sent = await db.storage.from(PHOTO_BUCKET).download(original);
  if (sent.error || !sent.data) return { ok: false as const, reason: "missing" as FinishRefusal };
  const cleaned = sent.data.size > MAX_PHOTO_BYTES ? { refused: "size" as const } : await cleanPhoto(Buffer.from(await sent.data.arrayBuffer()));
  await removeFiles(db, [original]);
  if ("refused" in cleaned) {
    await removePhoto(db, guestId, sessionId, photoId);
    return { ok: false as const, reason: cleaned.refused as FinishRefusal };
  }

  const store = db.storage.from(PHOTO_BUCKET);
  for (const [path, file] of [
    [row.photo_path, cleaned.photo],
    [row.thumbnail_path, cleaned.thumbnail],
  ] as const) {
    const { error } = await store.upload(path, file, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`keeping a photo failed: ${error.message}`);
  }
  const { data: kept } = await db.rpc("finish_session_asset", { owner: guestId, asset: photoId, expected_version: version }).throwOnError();
  if (!kept) {
    await removeFiles(db, [row.photo_path, row.thumbnail_path]).catch(logFailure("deleting an outdated photo"));
    return null;
  }
  const [photo] = await shownPhotos(db, [row]);
  if (!photo) throw new Error("making photo links failed");
  return { ok: true as const, photo };
}

/** Makes a photo the item to style around (R31). False when there's no such photo. */
export async function choosePhoto(db: SupabaseClient, guestId: string, sessionId: string, photoId: string) {
  const { data } = await db.rpc("choose_session_asset", { owner: guestId, session: sessionId, asset: photoId }).throwOnError();
  return data === true;
}

/** Remove (R31): the photo and its files. False when there's no such photo. */
export async function removePhoto(db: SupabaseClient, guestId: string, sessionId: string, photoId: string) {
  const { data } = await db.rpc("remove_session_asset", { owner: guestId, session: sessionId, asset: photoId }).throwOnError();
  const removed = data as { version: number; paths: string[] } | null;
  if (!removed) return false;
  await removeFiles(db, [...removed.paths, incomingPath(guestId, photoId, removed.version)]).catch(logFailure("deleting a removed photo"));
  return true;
}

/** Deletes photos and their files, files first: a row is only deleted once its files are gone. */
async function deletePhotos(db: SupabaseClient, rows: Row[]) {
  if (!rows.length) return 0;
  await removeFiles(db, rows.flatMap(allPaths));
  await db
    .from("session_assets")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    )
    .throwOnError();
  return rows.length;
}

/** A session has ended: its photos are deleted with its notes (R63, the tech spec's data model). */
export async function deleteSessionPhotos(db: SupabaseClient, sessionId: string) {
  const { data } = await db.from("session_assets").select(COLUMNS).eq("session_id", sessionId).returns<Row[]>().throwOnError();
  return deletePhotos(db, data ?? []);
}

/**
 * Photos of sessions the database timer ended after 30 idle minutes: the timer can't delete files, so
 * they go on the guest's next Start conversation or in the daily job, whichever comes first (Sabine's
 * answer to Q4 in 3a). Returns how many it deleted.
 */
export async function deleteEndedSessionPhotos(db: SupabaseClient, guestId?: string, limit = 500) {
  let query = db.from("session_assets").select(`${COLUMNS}, sessions!inner(status)`).eq("sessions.status", "ended").limit(limit);
  if (guestId) query = query.eq("user_id", guestId);
  const { data } = await query.returns<Row[]>().throwOnError();
  return deletePhotos(db, data ?? []);
}
