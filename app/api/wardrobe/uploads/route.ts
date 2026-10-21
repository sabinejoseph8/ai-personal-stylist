import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { PHOTO_MESSAGES } from "@/lib/photos";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";
import { startUpload } from "@/lib/wardrobe-service";

// Add item on the Wardrobe page (3d, Sabine's answer to Q1): a one-time upload link into the guest's
// private folder, as for session photos (3a). Needs wardrobe photos allowed first (R36, R64). It counts
// toward the 10 photos an hour.

const Body = z.object({ allowPhotos: z.boolean().default(false) });

export async function POST(request: Request) {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "photo"))) return Response.json({ error: PHOTO_MESSAGES.tooMany }, { status: 429 });
  const started = await startUpload(serverKeyDb(), guest.id, body.data.allowPhotos);
  if (!started.ok) return Response.json({ reason: "permission", error: "Allow wardrobe photos to add an item." }, { status: 409 });
  return Response.json({ id: started.id, uploadUrl: started.uploadUrl });
}
