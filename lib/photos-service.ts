import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { ANALYZING, changeItem, type ItemChange, type Ownership, savedReading, type StyleItem } from "@/core/photos/item";
import type { PhotoReader } from "@/core/photos/reader";
import type { BudgetGuard } from "@/lib/budget-guard";
import { cleanPhoto, type PhotoRefusal } from "@/lib/photo-cleaner";
import { MAX_PHOTO_BYTES, type PhotoSource, type ShownPhoto } from "@/lib/photos";

// The item to style around (3a; R26, R27, R31, FR-27). Photos are the app's own record (decision A),
// so this runs with the server key and checks every photo belongs to the guest's session. Adding one
// takes two steps, because Vercel refuses anything over 4.5 MB (Sabine's answer to Q1 in 3a): the app
// gives the browser a one-time upload link into the guest's private folder, then checks and cleans
// what arrived, keeps the clean copy and deletes the original. Every photo has a version, and a new
// version gets new files, so nothing late can bring back a replaced photo. Once kept, the photo reader
// (3b) works out what the item is, and the shopper confirms or corrects it by touch or voice.

export const PHOTO_BUCKET = "guest-photos";
/** Links to photos stop working after 30 minutes. The page asks for fresh ones when it needs them. */
const LINK_SECONDS = 30 * 60;

type Row = {
  id: string;
  user_id: string;
  version: number;
  status: "uploading" | "ready";
  source: PhotoSource;
  active: boolean;
  photo_path: string;
  thumbnail_path: string;
  recognized_details: unknown;
  ownership: Ownership;
  details_seq: number;
};
const COLUMNS = "id, user_id, version, status, source, active, photo_path, thumbnail_path, recognized_details, ownership, details_seq";

const itemOf = (r: Row): StyleItem => ({ reading: savedReading(r.recognized_details), ownership: r.ownership });

/** Where the browser sends a photo before it's checked. */
const incomingPath = (owner: string, id: string, version: number) => `${owner}/incoming/${id}-v${version}`;
const allPaths = (r: Row) => [r.photo_path, r.thumbnail_path, incomingPath(r.user_id, r.id, r.version)];

export async function removeFiles(db: SupabaseClient, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`deleting photos failed: ${error.message}`);
  }
}

export const logFailure = (what: string) => (e: unknown) => console.error(`${what} failed: ${e instanceof Error ? e.message : e}`);

/** 30-minute links for files in the photo store, by path. Works with the guest's own sign-in or the server key. */
export async function signedLinks(db: SupabaseClient, paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, LINK_SECONDS);
  if (error) throw new Error(`making photo links failed: ${error.message}`);
  return new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

/** Links for photo rows, in the same order. Works with the guest's own sign-in or the server key. */
export async function shownPhotos(db: SupabaseClient, rows: Row[]): Promise<ShownPhoto[]> {
  if (!rows.length) return [];
  const links = await signedLinks(
    db,
    rows.flatMap((r) => [r.photo_path, r.thumbnail_path]),
  );
  // Which of these photos are already in the wardrobe (3d), so Save to wardrobe shows as saved.
  const { data: saved } = await db
    .from("wardrobe_items")
    .select("saved_from, saved_from_version")
    .in(
      "saved_from",
      rows.map((r) => r.id),
    );
  const inWardrobe = new Set((saved ?? []).map((w) => `${w.saved_from}:${w.saved_from_version}`));
  return rows.flatMap((r) => {
    const photoUrl = links.get(r.photo_path);
    const thumbnailUrl = links.get(r.thumbnail_path);
    return photoUrl && thumbnailUrl
      ? [{ id: r.id, version: r.version, source: r.source, active: r.active, photoUrl, thumbnailUrl, item: itemOf(r), inWardrobe: inWardrobe.has(`${r.id}:${r.version}`) }]
      : [];
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
 * Checks and cleans what the browser sent to its upload link (FR-27), keeps the clean photo and its
 * thumbnail at the given paths, and deletes the original either way. Shared by session photos and
 * Add item on the Wardrobe page (3d). Returns the clean JPEG for the photo reader, or why not.
 */
export async function keepUpload(db: SupabaseClient, original: string, paths: { photo: string; thumbnail: string }) {
  const sent = await db.storage.from(PHOTO_BUCKET).download(original);
  if (sent.error || !sent.data) {
    // Usually nothing arrived; anything else is the photo store's own trouble, worth seeing in the logs.
    if (sent.error && !/not found/i.test(sent.error.message)) console.error(`photos: reading an upload failed: ${sent.error.message}`);
    return { ok: false as const, reason: "missing" as FinishRefusal };
  }
  const cleaned = sent.data.size > MAX_PHOTO_BYTES ? { refused: "size" as const } : await cleanPhoto(Buffer.from(await sent.data.arrayBuffer()));
  await removeFiles(db, [original]);
  if ("refused" in cleaned) return { ok: false as const, reason: cleaned.refused as FinishRefusal };

  const store = db.storage.from(PHOTO_BUCKET);
  for (const [path, file] of [
    [paths.photo, cleaned.photo],
    [paths.thumbnail, cleaned.thumbnail],
  ] as const) {
    const { error } = await store.upload(path, file, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`keeping a photo failed: ${error.message}`);
  }
  return { ok: true as const, jpeg: cleaned.photo };
}

/**
 * The browser has sent the photo: check it, clean it, and keep the clean copy (FR-27). The original
 * is deleted either way. A photo turned away is removed. Returns null when the photo has been
 * replaced or removed since, its session has ended, or it was already kept: a photo is only ever
 * checked and read once, so a repeated request can't pay for more readings (Phase 3 code review).
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
  if (!row || row.version !== version || row.status !== "uploading") {
    await removeFiles(db, [original]).catch(logFailure("deleting an outdated upload"));
    return null;
  }

  const cleaned = await keepUpload(db, original, { photo: row.photo_path, thumbnail: row.thumbnail_path });
  if (!cleaned.ok) {
    if (cleaned.reason !== "missing") await removePhoto(db, guestId, sessionId, photoId);
    return cleaned;
  }
  const { data: kept } = await db.rpc("finish_session_asset", { owner: guestId, asset: photoId, expected_version: version }).throwOnError();
  if (!kept) {
    await removeFiles(db, [row.photo_path, row.thumbnail_path]).catch(logFailure("deleting an outdated photo"));
    return null;
  }
  // The photo reader starts on it next (3b): until it answers, the photo shows Analyzing.
  const analyzing = { ...ANALYZING, since: new Date().toISOString() };
  await db.rpc("save_asset_details", { asset: photoId, expected_version: version, details: analyzing }).throwOnError();
  const [photo] = await shownPhotos(db, [{ ...row, recognized_details: analyzing, ownership: null }]);
  if (!photo) throw new Error("making photo links failed");
  return { ok: true as const, photo, jpeg: cleaned.jpeg };
}

export type PhotoReadingDeps = { db: SupabaseClient; guard: BudgetGuard; reader: PhotoReader };

/** The photo reader sees a smaller copy: plenty for clothing details, and fewer tokens (3b). */
const READ_SIDE = 1024;

/** The items the photo reader finds in a cleaned photo, through the budget guard. Empty when it found nothing, failed, or AI is used up. */
export async function readItems(deps: Omit<PhotoReadingDeps, "db">, guestId: string, jpeg: Buffer) {
  const money = await deps.guard.checkAi(guestId, "claude");
  if (!money.ok) return [];
  const { data, info } = await sharp(jpeg).resize(READ_SIDE, READ_SIDE, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const read = await deps.reader.read({ jpegBase64: data.toString("base64"), width: info.width, height: info.height }).catch(() => null);
  // A failed reading still costs what Claude charged, so it counts toward the allowance too.
  if (read && read.costUsd > 0) await deps.guard.recordAi(guestId, "claude", read.costUsd);
  return read?.items ?? [];
}

/**
 * The photo reader (R28, R29): reads a kept photo through the budget guard and saves what it found
 * with the photo's version. A failed reading, or the day's AI used up, leaves the photo with "Describe
 * it instead" (R32). Returns null when the photo was replaced or removed meanwhile.
 */
export async function readPhoto(deps: PhotoReadingDeps, guestId: string, photoId: string, version: number, jpeg: Buffer): Promise<StyleItem | null> {
  let reading: StyleItem["reading"] = { state: "failed", items: [], chosen: null };
  const items = await readItems(deps, guestId, jpeg);
  if (items.length) reading = { state: "read", items, chosen: items.length === 1 ? 0 : null };
  const { data: saved } = await deps.db.rpc("save_asset_details", { asset: photoId, expected_version: version, details: reading }).throwOnError();
  return saved ? { reading, ownership: null } : null;
}

/** The session's active photo and its item, for the stylist and the notes reader. */
export async function activePhoto(db: SupabaseClient, sessionId: string) {
  const { data } = await db
    .from("session_assets")
    .select(COLUMNS)
    .eq("session_id", sessionId)
    .eq("active", true)
    .eq("status", "ready")
    .maybeSingle<Row>()
    .throwOnError();
  return data ? { id: data.id, version: data.version, item: itemOf(data) } : null;
}

/**
 * A change to the item by touch or voice (R28 to R30): confirm or correct a detail, pick one of several
 * items, or say whether it's theirs. Built on the details as last saved, and tried again if another
 * change saved first. `version` keeps a change for a replaced photo from landing on the new one.
 * Returns the item, or null when there's no such photo (or it was replaced).
 */
export async function changePhoto(db: SupabaseClient, guestId: string, sessionId: string, photoId: string, change: ItemChange, version?: number) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row } = await db
      .from("session_assets")
      .select(COLUMNS)
      .eq("id", photoId)
      .eq("session_id", sessionId)
      .eq("user_id", guestId)
      .eq("status", "ready")
      .maybeSingle<Row>()
      .throwOnError();
    if (!row || (version !== undefined && row.version !== version)) return null;
    const item = changeItem(itemOf(row), change);
    const { data: saved } = await db
      .rpc("change_asset_details", {
        asset: photoId,
        expected_version: row.version,
        expected_seq: row.details_seq,
        details: item.reading,
        new_ownership: item.ownership,
      })
      .throwOnError();
    if (saved) return item;
  }
  throw new Error("saving a photo change kept clashing");
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
