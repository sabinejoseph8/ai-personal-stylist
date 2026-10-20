import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { PHOTO_MESSAGES } from "@/lib/photos";
import { type FinishRefusal, finishPhoto } from "@/lib/photos-service";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// The browser has sent the photo to its upload link: the server checks its real type and size,
// cleans it (no location or camera details) and keeps it (FR-27). The answer carries the photo's
// short-lived links, or why it was turned away. It shares the 4-a-second limit on photo changes.

const Body = z.object({ version: z.number().int().positive() });

const REFUSED: Record<FinishRefusal, number> = { type: 415, size: 413, unreadable: 422, missing: 409 };

// Converting a large HEIC photo can take a few seconds.
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/assets/[assetId]/ready">) {
  const { id, assetId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(assetId).success) return Response.json({ error: PHOTO_MESSAGES.photo }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "changePhoto"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });

  const result = await finishPhoto(serverKeyDb(), guest.id, id, assetId, body.data.version);
  // Replaced or removed meanwhile, or the session ended.
  if (!result) return Response.json({ reason: "photo", error: PHOTO_MESSAGES.photo }, { status: 404 });
  if (!result.ok) return Response.json({ reason: result.reason, error: PHOTO_MESSAGES[result.reason] }, { status: REFUSED[result.reason] });
  return Response.json({ photo: result.photo });
}
