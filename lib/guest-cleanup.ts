import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stored } from "@/lib/photo-store";

const BUCKET = "guest-photos";
const PAGE = 1000;

/** Every file in a guest's photo folder, including any subfolders. */
async function photoPaths(db: SupabaseClient, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await stored(() => db.storage.from(BUCKET).list(folder, { limit: PAGE, offset }));
    if (error) throw new Error(`listing photos failed: ${error.message}`);
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      if (item.id) paths.push(path);
      else paths.push(...(await photoPaths(db, path))); // a folder has no id
    }
    if (data.length < PAGE) return paths;
  }
}

/**
 * Deletes a guest completely (R3, and R65 later): their photos first, because storage doesn't
 * follow the database, then their sign-in, which deletes every row they own. Their usage
 * records stay, without the guest, so the month's totals stay right. Needs the server key.
 */
export async function deleteGuest(db: SupabaseClient, guestId: string) {
  const paths = await photoPaths(db, guestId);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await stored(() => db.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
    if (error) throw new Error(`deleting photos failed: ${error.message}`);
  }
  const { error } = await db.auth.admin.deleteUser(guestId);
  if (error) throw new Error(`deleting the guest failed: ${error.message}`);
}

/** How old a raw upload may be before the daily job sweeps it: long after any upload would have finished. */
export const INCOMING_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Deletes raw uploads in the "incoming" folders of guests active in the last week that are older than
 * `olderThanMs`: a wardrobe upload abandoned between the file landing and the ready step, or a session
 * photo removed while its file was still landing, stayed until the guest was deleted (full code review,
 * E4 and D5). Returns how many files went.
 */
export async function sweepIncoming(db: SupabaseClient, olderThanMs = INCOMING_MAX_AGE_MS, maxGuests = 200) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: guests } = await db.from("profiles").select("user_id").gte("last_active_at", since).limit(maxGuests).throwOnError();
  const cutoff = Date.now() - olderThanMs;
  let swept = 0;
  for (const g of guests ?? []) {
    const folder = `${g.user_id}/incoming`;
    const { data: files, error } = await stored(() => db.storage.from(BUCKET).list(folder, { limit: 100 }));
    if (error || !files?.length) continue;
    const old = files.filter((f) => f.name && Date.parse(f.created_at ?? f.updated_at ?? "") < cutoff).map((f) => `${folder}/${f.name}`);
    if (!old.length) continue;
    const removed = await stored(() => db.storage.from(BUCKET).remove(old));
    if (!removed.error) swept += old.length;
  }
  return swept;
}
