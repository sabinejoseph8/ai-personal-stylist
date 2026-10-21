import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Rate limits from tech spec section 6 (defaults), counted per guest in the database.
export const LIMITS = {
  startSession: { max: 5, windowSeconds: 3600 },
  newWords: { max: 2, windowSeconds: 1 },
  touchNote: { max: 4, windowSeconds: 1 },
  photo: { max: 10, windowSeconds: 3600 },
  changePhoto: { max: 4, windowSeconds: 1 },
  cameraFrame: { max: 1, windowSeconds: 2 },
  buildLooks: { max: 20, windowSeconds: 3600 },
  makeRule: { max: 20, windowSeconds: 3600 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Counts one use for the signed-in guest. True while within the limit. */
export async function withinLimit(db: SupabaseClient, name: LimitName): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[name];
  const { data, error } = await db.rpc("take_rate_limit", { bucket: name, max_hits: max, window_seconds: windowSeconds });
  return !error && data === true;
}
