import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Rate limits from tech spec section 6 (defaults), counted per guest in the database.
export const LIMITS = {
  startSession: { max: 5, windowSeconds: 3600 },
  newWords: { max: 2, windowSeconds: 1 },
  touchNote: { max: 4, windowSeconds: 1 },
  photo: { max: 10, windowSeconds: 3600 },
  changePhoto: { max: 4, windowSeconds: 1 },
  // 2 in 3 seconds rather than 1 in 2: fixed buckets dropped a frame now and then when two sends landed in one (review batch 5, D11).
  cameraFrame: { max: 2, windowSeconds: 3 },
  // Asking for the looks is cheap when nothing changed (4c); building or checking them again counts as a build.
  looksRequest: { max: 120, windowSeconds: 3600 },
  buildLooks: { max: 20, windowSeconds: 3600 },
  swapPiece: { max: 40, windowSeconds: 3600 },
  // Behind the scenes (4d): read only, asked again while open as notes and looks change.
  behindTheScenes: { max: 240, windowSeconds: 3600 },
  makeRule: { max: 20, windowSeconds: 3600 },
  // Saved looks and the demo bag (6a). Opening a saved look checks it again, with the judgment step.
  saveLook: { max: 60, windowSeconds: 3600 },
  openSavedLook: { max: 20, windowSeconds: 3600 },
  bagChange: { max: 120, windowSeconds: 3600 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Counts one use for the signed-in guest. True while within the limit. */
export async function withinLimit(db: SupabaseClient, name: LimitName): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[name];
  const { data, error } = await db.rpc("take_rate_limit", { bucket: name, max_hits: max, window_seconds: windowSeconds });
  return !error && data === true;
}
