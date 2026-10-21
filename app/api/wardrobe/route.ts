import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";
import { WARDROBE_MESSAGES } from "@/lib/wardrobe";
import { listWardrobe, type SaveRefusal, saveFromPhoto } from "@/lib/wardrobe-service";

// The wardrobe (3d; R36, R37). GET lists the guest's items with short-lived photo links. POST is Save
// to wardrobe for a session photo marked "You own this"; the first time it answers "permission", and
// the page asks before sending allowPhotos (R36, R64).

const Body = z.object({ fromPhoto: z.uuid(), allowPhotos: z.boolean().default(false) });

const REFUSED: Record<SaveRefusal, { status: number; error: string }> = {
  permission: { status: 409, error: "Allow wardrobe photos to save this item." },
  photo: { status: 404, error: WARDROBE_MESSAGES.photo },
  not_owned: { status: 409, error: WARDROBE_MESSAGES.notOwned },
};

export async function GET() {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  return Response.json({ items: await listWardrobe(serverKeyDb(), guest.id) });
}

export async function POST(request: Request) {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "changePhoto"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  const saved = await saveFromPhoto(serverKeyDb(), guest.id, body.data.fromPhoto, body.data.allowPhotos);
  if (!saved.ok) return Response.json({ reason: saved.reason, error: REFUSED[saved.reason].error }, { status: REFUSED[saved.reason].status });
  return Response.json({ item: saved.item });
}
