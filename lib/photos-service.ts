import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { ANALYZING, changeItem, type ItemChange, type Ownership, savedReading, type StyleItem } from "@/core/photos/item";
import type { PhotoReader } from "@/core/photos/reader";
import type { BudgetGuard } from "@/lib/budget-guard";
import { cleanPhoto, type PhotoRefusal } from "@/lib/photo-cleaner";
import { stored } from "@/lib/photo-store";
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
  /** A replacement on its way (review batch 1): the original stays until this version is kept. */
  pending_version: number | null;
};
const COLUMNS = "id, user_id, version, status, source, active, photo_path, thumbnail_path, recognized_details, ownership, details_seq, pending_version";

const itemOf = (r: Row): StyleItem => ({ reading: savedReading(r.recognized_details), ownership: r.ownership });

/** Where the browser sends a photo before it's checked. */
const incomingPath = (owner: string, id: string, version: number) => `${owner}/incoming/${id}-v${version}`;
/** Where a version's kept files live, as the database's session_asset_path puts them. */
const keptPath = (owner: string, session: string, id: string, version: number, thumbnail: boolean) => `${owner}/${session}/${id}-v${version}${thumbnail ? "-thumb" : ""}.jpg`;
const allPaths = (r: Row) => [r.photo_path, r.thumbnail_path, incomingPath(r.user_id, r.id, r.version), ...(r.pending_version ? [incomingPath(r.user_id, r.id, r.pending_version)] : [])];

export async function removeFiles(db: SupabaseClient, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await stored(() => db.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100)));
    if (error) throw new Error(`deleting photos failed: ${error.message}`);
  }
}

export const logFailure = (what: string) => (e: unknown) => console.error(`${what} failed: ${e instanceof Error ? e.message : e}`);

/** 30-minute links for files in the photo store, by path. Works with the guest's own sign-in or the server key. */
export async function signedLinks(db: SupabaseClient, paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await stored(() => db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, LINK_SECONDS));
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
type Added = { id: string; version: number } | { refused: AddRefusal };

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
  // A replacement is pending until it's kept: the original, its reading and its files stay meanwhile
  // (review batch 1; they went at once, so a failed replacement lost the original).
  // A retried replacement uses its version's upload path again: a file left there by a lost ready request
  // would refuse the new upload (5d review).
  await removeFiles(db, [incomingPath(guestId, added.id, added.version)]).catch(logFailure("clearing an old upload"));
  const link = await stored(() => db.storage.from(PHOTO_BUCKET).createSignedUploadUrl(incomingPath(guestId, added.id, added.version)));
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
  const sent = await stored(() => db.storage.from(PHOTO_BUCKET).download(original));
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
    const { error } = await stored(() => store.upload(path, file, { contentType: "image/jpeg", upsert: true }));
    if (error) throw new Error(`keeping a photo failed: ${error.message}`);
  }
  return { ok: true as const, jpeg: cleaned.photo };
}

/**
 * The browser has sent the photo: check it, clean it, and keep the clean copy (FR-27). The original
 * is deleted either way. A new photo turned away is removed; a replacement turned away leaves the
 * original as it was (review batch 1). A new photo becomes the active one only now, once kept: active
 * from the moment its link was issued, a failed upload left the session with no item to style around.
 * Returns null when the photo has been replaced or removed since, its session has ended, or it was
 * already kept: a photo is only ever checked and read once, so a repeated request can't pay for more
 * readings (Phase 3 code review).
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
  const replacing = row?.pending_version === version;
  if (!row || !(replacing || (row.status === "uploading" && row.version === version))) {
    await removeFiles(db, [original]).catch(logFailure("deleting an outdated upload"));
    return null;
  }

  // Claimed in one database step, so two requests at the same instant can't both clean and read it, paying
  // Claude twice and putting a confirmed detail back in pencil (full code review, D3). Let go on failure,
  // so a retry can claim it again.
  const { data: claimed } = await db.rpc("claim_session_asset", { owner: guestId, asset: photoId, expected_version: version }).throwOnError();
  if (!claimed) return null;
  const paths = { photo: keptPath(guestId, sessionId, photoId, version, false), thumbnail: keptPath(guestId, sessionId, photoId, version, true) };
  let cleaned: Awaited<ReturnType<typeof keepUpload>>;
  try {
    cleaned = await keepUpload(db, original, paths);
  } catch (e) {
    // Let go of the claim, so a retry can claim the version again (5d review).
    await db.rpc("unclaim_session_asset", { owner: guestId, asset: photoId, expected_version: version }).then(() => undefined, () => undefined);
    throw e;
  }
  if (!cleaned.ok) {
    await db.rpc("unclaim_session_asset", { owner: guestId, asset: photoId, expected_version: version }).throwOnError();
    if (cleaned.reason !== "missing") {
      // Turned away: a replacement is dropped and the original stays; a new photo goes.
      if (replacing && row.status === "ready") await db.from("session_assets").update({ pending_version: null }).eq("id", photoId).eq("pending_version", version).throwOnError();
      else await removePhoto(db, guestId, sessionId, photoId);
    }
    return cleaned;
  }
  const { data } = await db.rpc("finish_session_asset", { owner: guestId, asset: photoId, expected_version: version }).throwOnError();
  const finished = data as { kept: boolean; old_paths?: string[] };
  if (!finished.kept) {
    await removeFiles(db, [paths.photo, paths.thumbnail]).catch(logFailure("deleting an outdated photo"));
    return null;
  }
  // The replaced version's files go only now that the new one is kept.
  if (replacing) await removeFiles(db, [...(finished.old_paths ?? []), incomingPath(guestId, photoId, row.version)]).catch(logFailure("deleting a replaced photo"));
  // The photo reader starts on it next (3b): until it answers, the photo shows Analyzing.
  const analyzing = { ...ANALYZING, since: new Date().toISOString() };
  await db.rpc("save_asset_details", { asset: photoId, expected_version: version, details: analyzing }).throwOnError();
  // As kept: a new photo is the active one now.
  const { data: kept } = await db.from("session_assets").select(COLUMNS).eq("id", photoId).single<Row>().throwOnError();
  const [photo] = await shownPhotos(db, [{ ...kept, recognized_details: analyzing, ownership: null }]);
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
  const removed = data as { version: number; pending_version: number | null; paths: string[] } | null;
  if (!removed) return false;
  const incoming = [removed.version, ...(removed.pending_version ? [removed.pending_version] : [])].map((v) => incomingPath(guestId, photoId, v));
  await removeFiles(db, [...removed.paths, ...incoming]).catch(logFailure("deleting a removed photo"));
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
