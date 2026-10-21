import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WardrobePick } from "@/core/notes/context";
import { chosenItem, savedReading } from "@/core/photos/item";
import { cleanPhoto } from "@/lib/photo-cleaner";
import { MAX_PHOTO_BYTES } from "@/lib/photos";
import { logFailure, PHOTO_BUCKET, type PhotoReadingDeps, readItems, removeFiles, signedLinks } from "@/lib/photos-service";
import { type Category, categoryOf, type ShownWardrobeItem, type WardrobeDetails, type WardrobeEdit } from "@/lib/wardrobe";

// The wardrobe (3d; R36, R37). Items the shopper owns, kept beyond a session: saved from a session
// photo marked "You own this", or added on the Wardrobe page. Like session photos, they're the app's
// own record (decision A): this runs with the server key and checks each item is the guest's. Photos
// live at <guest>/wardrobe/<item>.jpg with a thumbnail, as copies, so a session's photo can go when it
// ends without taking the wardrobe item with it (R31). Storing them needs the guest's permission first
// (R36, R64).

type Row = {
  id: string;
  user_id: string;
  name: string;
  category: Category | null;
  details: Partial<WardrobeDetails>;
  photo_path: string | null;
  thumbnail_path: string | null;
  styling: boolean;
  draft: boolean;
  created_at: string;
};
const COLUMNS = "id, user_id, name, category, details, photo_path, thumbnail_path, styling, draft, created_at";

const photoPath = (owner: string, id: string) => `${owner}/wardrobe/${id}.jpg`;
const thumbnailPath = (owner: string, id: string) => `${owner}/wardrobe/${id}-thumb.jpg`;
/** Where the browser sends a photo added on the Wardrobe page, before it's checked. */
const incomingPath = (owner: string, id: string) => `${owner}/incoming/wardrobe-${id}`;
/** A draft left unsaved this long is deleted (an Add item the shopper walked away from). */
const DRAFT_HOURS = 1;

const detailsOf = (d: Partial<WardrobeDetails> | null | undefined): WardrobeDetails => ({
  type: d?.type ?? "",
  colors: d?.colors ?? "",
  pattern: d?.pattern ?? "",
  style: d?.style ?? "",
});

/** Rows as the browser shows them, with 30-minute links. Works with the guest's own sign-in or the server key. */
export async function shownWardrobe(db: SupabaseClient, rows: Row[]): Promise<ShownWardrobeItem[]> {
  const links = await signedLinks(
    db,
    rows.flatMap((r) => [r.photo_path, r.thumbnail_path].filter((p): p is string => !!p)),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category ?? "other",
    details: detailsOf(r.details),
    photoUrl: r.photo_path ? (links.get(r.photo_path) ?? null) : null,
    thumbnailUrl: r.thumbnail_path ? (links.get(r.thumbnail_path) ?? null) : null,
    styling: r.styling,
  }));
}

async function deleteRows(db: SupabaseClient, rows: Pick<Row, "id" | "user_id" | "photo_path" | "thumbnail_path">[]) {
  if (!rows.length) return;
  await removeFiles(
    db,
    rows.flatMap((r) => [r.photo_path, r.thumbnail_path, incomingPath(r.user_id, r.id)].filter((p): p is string => !!p)),
  );
  await db
    .from("wardrobe_items")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    )
    .throwOnError();
}

/** The guest's wardrobe, newest first. Drafts left unsaved for an hour are deleted on the way. */
export async function listWardrobe(db: SupabaseClient, guestId: string): Promise<ShownWardrobeItem[]> {
  const { data } = await db.from("wardrobe_items").select(COLUMNS).eq("user_id", guestId).order("created_at", { ascending: false }).returns<Row[]>().throwOnError();
  const rows = data ?? [];
  const old = Date.now() - DRAFT_HOURS * 3600_000;
  await deleteRows(
    db,
    rows.filter((r) => r.draft && Date.parse(r.created_at) < old),
  ).catch(logFailure("deleting old wardrobe drafts"));
  return shownWardrobe(
    db,
    rows.filter((r) => !r.draft),
  );
}

/** Whether the guest has allowed wardrobe photos (R36, R64), recording it now when `allow` is set. */
async function photosAllowed(db: SupabaseClient, guestId: string, allow: boolean) {
  if (allow) {
    await db.from("consents").update({ wardrobe_photos_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", guestId).throwOnError();
    return true;
  }
  const { data } = await db.from("consents").select("wardrobe_photos_at").eq("user_id", guestId).maybeSingle().throwOnError();
  return !!data?.wardrobe_photos_at;
}

/** Copies a file within the photo store. */
async function copyFile(db: SupabaseClient, from: string, to: string) {
  const { error } = await db.storage.from(PHOTO_BUCKET).copy(from, to);
  if (error) throw new Error(`copying a photo failed: ${error.message}`);
}

export type SaveRefusal = "permission" | "photo" | "not_owned";

/**
 * Save to wardrobe (R36): a session photo the shopper marked "You own this", copied with its details
 * into the wardrobe. The first time, the guest's permission for wardrobe photos is needed (`allow`).
 * Saving the same photo again gives the item already saved.
 */
export async function saveFromPhoto(db: SupabaseClient, guestId: string, photoId: string, allow: boolean): Promise<{ ok: true; item: ShownWardrobeItem } | { ok: false; reason: SaveRefusal }> {
  const { data: photo } = await db
    .from("session_assets")
    .select("id, version, status, ownership, recognized_details, photo_path, thumbnail_path")
    .eq("id", photoId)
    .eq("user_id", guestId)
    .maybeSingle()
    .throwOnError();
  if (!photo || photo.status !== "ready") return { ok: false, reason: "photo" };
  const item = chosenItem(savedReading(photo.recognized_details));
  if (photo.ownership !== "owned" || !item) return { ok: false, reason: "not_owned" };
  if (!(await photosAllowed(db, guestId, allow))) return { ok: false, reason: "permission" };

  const { data: already } = await db
    .from("wardrobe_items")
    .select(COLUMNS)
    .eq("saved_from", photo.id)
    .eq("saved_from_version", photo.version)
    .returns<Row[]>()
    .throwOnError();
  if (already?.length) return { ok: true, item: (await shownWardrobe(db, already))[0] };

  const details: WardrobeDetails = {
    type: item.details.type.value,
    colors: item.details.colors.value,
    pattern: item.details.pattern.value,
    style: item.details.style.value,
  };
  const { data: row, error } = await db
    .from("wardrobe_items")
    .insert({ user_id: guestId, name: item.name, category: categoryOf(details.type), details, saved_from: photo.id, saved_from_version: photo.version })
    .select(COLUMNS)
    .single<Row>();
  if (error || !row) {
    // Saved twice at the same moment: the other save won.
    const { data: other } = await db.from("wardrobe_items").select(COLUMNS).eq("saved_from", photo.id).eq("saved_from_version", photo.version).returns<Row[]>();
    if (other?.length) return { ok: true, item: (await shownWardrobe(db, other))[0] };
    throw new Error(`saving to the wardrobe failed: ${error?.message}`);
  }
  try {
    await copyFile(db, photo.photo_path, photoPath(guestId, row.id));
    await copyFile(db, photo.thumbnail_path, thumbnailPath(guestId, row.id));
    const { data: kept } = await db
      .from("wardrobe_items")
      .update({ photo_path: photoPath(guestId, row.id), thumbnail_path: thumbnailPath(guestId, row.id) })
      .eq("id", row.id)
      .select(COLUMNS)
      .single<Row>()
      .throwOnError();
    return { ok: true, item: (await shownWardrobe(db, [kept!]))[0] };
  } catch (e) {
    await deleteRows(db, [{ ...row, photo_path: photoPath(guestId, row.id), thumbnail_path: thumbnailPath(guestId, row.id) }]).catch(logFailure("undoing a wardrobe save"));
    throw e;
  }
}

/**
 * Add item on the Wardrobe page, step 1 (Sabine's answer to Q1 in 3d): a one-time upload link, as for
 * session photos (3a). Needs the guest's permission for wardrobe photos first.
 */
export async function startUpload(db: SupabaseClient, guestId: string, allow: boolean) {
  if (!(await photosAllowed(db, guestId, allow))) return { ok: false as const, reason: "permission" as const };
  const id = crypto.randomUUID();
  const link = await db.storage.from(PHOTO_BUCKET).createSignedUploadUrl(incomingPath(guestId, id));
  if (link.error) throw new Error(`making an upload link failed: ${link.error.message}`);
  return { ok: true as const, id, uploadUrl: link.data.signedUrl };
}

/**
 * Add item, step 2: the photo has arrived. It's checked and cleaned (FR-27), kept, and read by the
 * photo reader, which suggests a name, category and details (3b). The item is a draft until the
 * shopper saves its details (step 3, `editItem`).
 */
export async function finishUpload(deps: PhotoReadingDeps, guestId: string, id: string) {
  const { db } = deps;
  const original = incomingPath(guestId, id);
  const sent = await db.storage.from(PHOTO_BUCKET).download(original);
  if (sent.error || !sent.data) return { ok: false as const, reason: "missing" as const };
  const cleaned = sent.data.size > MAX_PHOTO_BYTES ? { refused: "size" as const } : await cleanPhoto(Buffer.from(await sent.data.arrayBuffer()));
  await removeFiles(db, [original]);
  if ("refused" in cleaned) return { ok: false as const, reason: cleaned.refused };

  const store = db.storage.from(PHOTO_BUCKET);
  for (const [path, file] of [
    [photoPath(guestId, id), cleaned.photo],
    [thumbnailPath(guestId, id), cleaned.thumbnail],
  ] as const) {
    const { error } = await store.upload(path, file, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`keeping a photo failed: ${error.message}`);
  }
  // The most prominent item is the one being added.
  const [found] = await readItems(deps, guestId, cleaned.photo);
  const details: WardrobeDetails = found
    ? { type: found.details.type.value, colors: found.details.colors.value, pattern: found.details.pattern.value, style: found.details.style.value }
    : detailsOf(null);
  const { data: row } = await db
    .from("wardrobe_items")
    .insert({
      id,
      user_id: guestId,
      name: found?.name ?? "New item",
      category: found ? categoryOf(details.type) : "other",
      details,
      photo_path: photoPath(guestId, id),
      thumbnail_path: thumbnailPath(guestId, id),
      draft: true,
    })
    .select(COLUMNS)
    .single<Row>()
    .throwOnError();
  return { ok: true as const, item: (await shownWardrobe(db, [row!]))[0], read: !!found };
}

/** Edit (R37), and the last step of Add item: the item's details as the shopper set them. Null when it isn't the guest's. */
export async function editItem(db: SupabaseClient, guestId: string, id: string, edit: WardrobeEdit) {
  const { data } = await db
    .from("wardrobe_items")
    .update({ name: edit.name, category: edit.category, details: edit.details, draft: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", guestId)
    .select(COLUMNS)
    .returns<Row[]>()
    .throwOnError();
  return data?.length ? (await shownWardrobe(db, data))[0] : null;
}

/** Delete (R37): the item and its photo files. False when it isn't the guest's. */
export async function deleteItem(db: SupabaseClient, guestId: string, id: string) {
  const { data } = await db.from("wardrobe_items").select(COLUMNS).eq("id", id).eq("user_id", guestId).returns<Row[]>().throwOnError();
  if (!data?.length) return false;
  await deleteRows(db, data);
  return true;
}

/** Style with these (R37, Sabine's answer to Q2 in 3d): exactly these items are chosen for styling. */
export async function chooseForStyling(db: SupabaseClient, guestId: string, ids: string[]) {
  await db.from("wardrobe_items").update({ styling: false }).eq("user_id", guestId).eq("styling", true).throwOnError();
  if (ids.length) await db.from("wardrobe_items").update({ styling: true }).eq("user_id", guestId).eq("draft", false).in("id", ids).throwOnError();
}

/** The items chosen for styling, for the notebook and the stylist. */
export async function stylingItems(db: SupabaseClient, guestId: string): Promise<ShownWardrobeItem[]> {
  const { data } = await db
    .from("wardrobe_items")
    .select(COLUMNS)
    .eq("user_id", guestId)
    .eq("styling", true)
    .eq("draft", false)
    .order("created_at")
    .returns<Row[]>()
    .throwOnError();
  return shownWardrobe(db, data ?? []);
}

/** The items chosen for styling, in words only (no photo links), for what the stylist is told. */
export async function stylingPicks(db: SupabaseClient, guestId: string): Promise<WardrobePick[]> {
  const { data } = await db
    .from("wardrobe_items")
    .select("name, category, details")
    .eq("user_id", guestId)
    .eq("styling", true)
    .eq("draft", false)
    .order("created_at")
    .throwOnError();
  return (data ?? []).map((r) => ({ name: r.name, category: r.category ?? "other", details: detailsOf(r.details) }));
}
