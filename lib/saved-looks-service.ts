import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { itemsKey, MAX_SAVED_LOOKS, type OpenedLook, type SavedCopy, type SavedLook } from "@/core/looks/saved";
import { type BuildOptions, checkedLook, checkSaved, type LooksDeps } from "@/lib/looks-service";

// Saved looks (6a; R60, design 4: Saved looks). Save look keeps a copy of a look on screen whose check
// passed (Sabine's answer to Q3); the Saved looks page lists them, opens one after a check against the
// saved profile (Q1), and removes one. Written only with the server key, after checking the row is the
// guest's (review batch 5, E2). Kept until removed, or until the guest is deleted after 7 days unused (R3).

type Row = { id: string; look: SavedCopy; saved_at: string; items_key: string };

const listed = (r: Row): SavedLook => ({ id: r.id, savedAt: r.saved_at, name: r.look.name, items: r.look.items, totalCents: r.look.totalCents, key: r.items_key });

/** The guest's saved looks, newest first. */
export async function listSaved(db: SupabaseClient, guestId: string): Promise<SavedLook[]> {
  const { data } = await db.from("saved_looks").select("id, look, saved_at, items_key").eq("user_id", guestId).order("saved_at", { ascending: false }).returns<Row[]>().throwOnError();
  return (data ?? []).map(listed);
}

export type SaveResult = { saved: SavedLook } | { stale: true } | { full: true };

/**
 * Save look: a copy of a look on the guest's screen whose check passed on the current requirements.
 * Saving it again answers with the copy already kept. Null when the look isn't on the guest's screen.
 */
export async function saveLook(deps: Pick<LooksDeps, "db" | "catalog">, guestId: string, sessionId: string, lookId: string): Promise<SaveResult | null> {
  const { db } = deps;
  const found = await checkedLook(deps, guestId, sessionId, lookId);
  if (!found || "stale" in found) return found;
  const key = itemsKey(found.look.items);
  const already = await db.from("saved_looks").select("id, look, saved_at, items_key").eq("user_id", guestId).eq("items_key", key).returns<Row[]>().maybeSingle().throwOnError();
  if (already.data) return { saved: listed(already.data) };
  const { count } = await db.from("saved_looks").select("id", { count: "exact", head: true }).eq("user_id", guestId).throwOnError();
  if ((count ?? 0) >= MAX_SAVED_LOOKS) return { full: true };
  // Two taps at once: the database keeps one (saved_looks_once), and both answer with it.
  const { data } = await db
    .from("saved_looks")
    .upsert({ user_id: guestId, look: found.copy, items_key: key }, { onConflict: "user_id,items_key", ignoreDuplicates: true })
    .select("id, look, saved_at, items_key")
    .returns<Row[]>()
    .throwOnError();
  const row = data?.[0] ?? (await db.from("saved_looks").select("id, look, saved_at, items_key").eq("user_id", guestId).eq("items_key", key).returns<Row[]>().single().throwOnError()).data!;
  return { saved: listed(row) };
}

/** Remove: true when the guest's saved look is gone. */
export async function removeSaved(db: SupabaseClient, guestId: string, id: string): Promise<boolean> {
  const { data } = await db.from("saved_looks").delete().eq("id", id).eq("user_id", guestId).select("id").throwOnError();
  return (data ?? []).length > 0;
}

/** Open: the saved look after a check against the saved profile, or why it can't be shown. Null when it isn't the guest's. */
export async function openSaved(
  deps: LooksDeps,
  guestId: string,
  id: string,
  options: Pick<BuildOptions, "allowAi"> = {},
): Promise<{ look: OpenedLook } | { none: string } | { limited: true } | null> {
  const { data } = await deps.db.from("saved_looks").select("id, look, saved_at, items_key").eq("id", id).eq("user_id", guestId).returns<Row[]>().maybeSingle().throwOnError();
  if (!data) return null;
  return checkSaved(deps, guestId, data.id, data.look, options);
}
