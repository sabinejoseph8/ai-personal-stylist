import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claudeAsk, LIVE_MODEL } from "@/connectors/ai/claude";
import { type CameraReader, createCameraReader, createFakeCameraReader, type Sighting } from "@/core/camera/reader";
import { type BudgetGuard, createBudgetGuard } from "@/lib/budget-guard";
import { photoType } from "@/lib/photo-cleaner";
import { serverKeyDb } from "@/lib/supabase/admin";

// Camera frames (3c; R34, R35, tech spec 4.4). One small frame every 2 seconds while the camera is on
// goes to the camera reader, Claude Haiku 5.5 at low effort, through the budget guard. The frame is
// read and thrown away: it's never saved or logged, and Tavus never receives the camera.

/** A 640 px JPEG is about 60 KB; anything much bigger isn't a camera frame from the page. */
export const MAX_FRAME_BYTES = 400 * 1024;

export type CameraDeps = { db: SupabaseClient; guard: BudgetGuard; reader: CameraReader };

/** The fake camera reader is only for automated tests: refused on Vercel's live site, whatever the setting says. */
export function fakeCameraAllowed(env: Record<string, string | undefined> = process.env) {
  return env.CAMERA_READER === "fake" && env.VERCEL_ENV !== "production";
}

export function cameraDeps(): CameraDeps {
  const db = serverKeyDb();
  return { db, guard: createBudgetGuard(db), reader: fakeCameraAllowed() ? createFakeCameraReader() : createCameraReader(claudeAsk(LIVE_MODEL, "low")) };
}

export type FrameRefusal = "session" | "frame" | "allowance" | "failed";

/** Reads one frame. Says why not when the session isn't the guest's open one, the frame isn't a JPEG, or AI is used up. */
export async function readFrame(deps: CameraDeps, guestId: string, sessionId: string, frame: Buffer): Promise<{ ok: true; sighting: Sighting } | { ok: false; reason: FrameRefusal }> {
  if (frame.length > MAX_FRAME_BYTES || photoType(frame) !== "jpeg") return { ok: false, reason: "frame" };
  const { data: session } = await deps.db
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", guestId)
    .in("status", ["active", "paused"])
    .maybeSingle()
    .throwOnError();
  if (!session) return { ok: false, reason: "session" };
  const money = await deps.guard.checkAi(guestId, "claude");
  if (!money.ok) return { ok: false, reason: "allowance" };
  const read = await readQuietly(deps.reader, frame.toString("base64"));
  if (read.costUsd > 0) await deps.guard.recordAi(guestId, "claude", read.costUsd);
  return read.sighting ? { ok: true, sighting: read.sighting } : { ok: false, reason: "failed" };
}

/**
 * The reader's answer, or no sighting when it throws (the Claude client unreachable): a frame that
 * produced nothing, not a server error per frame while the page keeps sending (full code review, D8).
 * The photo reader catches the same failure; a thrown call reports no cost.
 */
export async function readQuietly(reader: CameraDeps["reader"], frame: string): Promise<Awaited<ReturnType<CameraDeps["reader"]["read"]>>> {
  try {
    return await reader.read(frame);
  } catch (e) {
    console.error(`camera: reading a frame failed: ${e instanceof Error ? e.message : e}`);
    return { sighting: null, costUsd: 0 };
  }
}
