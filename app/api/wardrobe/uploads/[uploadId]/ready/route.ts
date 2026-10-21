import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { photoReadingDeps } from "@/lib/photo-deps";
import { PHOTO_MESSAGES } from "@/lib/photos";
import { withinLimit } from "@/lib/rate-limits";
import { finishUpload } from "@/lib/wardrobe-service";

// Add item, step 2: the photo has arrived. It's checked and cleaned, kept, and read by the photo reader,
// which suggests the item's name, category and details. The answer is a draft for the shopper to check.

const REFUSED = { type: 415, size: 413, unreadable: 422, missing: 409 } as const;

// Converting a large HEIC photo can take a few seconds, and reading it a few more.
export const maxDuration = 60;

export async function POST(_request: Request, ctx: RouteContext<"/api/wardrobe/uploads/[uploadId]/ready">) {
  const { uploadId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(uploadId).success) return Response.json({ error: PHOTO_MESSAGES.missing }, { status: 404 });
  if (!(await withinLimit(guest.db, "changePhoto"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  const result = await finishUpload(photoReadingDeps(), guest.id, uploadId);
  if (!result.ok) return Response.json({ reason: result.reason, error: PHOTO_MESSAGES[result.reason] }, { status: REFUSED[result.reason] });
  return Response.json({ item: result.item, read: result.read });
}
