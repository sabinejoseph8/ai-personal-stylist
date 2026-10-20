import "server-only";
import { claudeAsk, PHOTO_MODEL } from "@/connectors/ai/claude";
import { createFakePhotoReader } from "@/core/photos/fake-reader";
import { createPhotoReader } from "@/core/photos/reader";
import { createBudgetGuard } from "@/lib/budget-guard";
import type { PhotoReadingDeps } from "@/lib/photos-service";
import { serverKeyDb } from "@/lib/supabase/admin";

/** The fake photo reader is only for automated tests: refused on Vercel's live site, whatever the setting says. */
export function fakePhotosAllowed(env: Record<string, string | undefined> = process.env) {
  return env.PHOTO_READER === "fake" && env.VERCEL_ENV !== "production";
}

/** What the photo reader runs with: the server key, the budget guard, and Opus 5.5 at low effort (tech spec 4.4). */
export function photoReadingDeps(): PhotoReadingDeps {
  const db = serverKeyDb();
  return { db, guard: createBudgetGuard(db), reader: fakePhotosAllowed() ? createFakePhotoReader() : createPhotoReader(claudeAsk(PHOTO_MODEL, "low")) };
}
