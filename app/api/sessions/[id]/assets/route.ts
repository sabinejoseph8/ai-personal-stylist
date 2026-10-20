import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { PHOTO_MESSAGES } from "@/lib/photos";
import { type AddRefusal, addPhoto, listPhotos } from "@/lib/photos-service";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// Photos to style around (tech spec 4.1; R26, R31). POST adds a photo or replaces one, and answers at
// once with the photo's id and a one-time upload link: the browser sends the photo straight to private
// storage, then calls .../ready (Sabine's answer to Q1 in 3a). GET gives fresh links to the session's
// photos. Ten photos an hour at most (tech spec 6).

const Body = z.object({ source: z.enum(["upload", "camera"]).default("upload"), replaces: z.uuid().nullable().default(null) });

const REFUSED: Record<AddRefusal, number> = { session: 409, full: 409, photo: 404 };

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/assets">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "photo"))) return Response.json({ error: PHOTO_MESSAGES.tooMany }, { status: 429 });

  const added = await addPhoto(serverKeyDb(), guest.id, id, body.data.source, body.data.replaces);
  if (!added.ok) return Response.json({ reason: added.reason, error: PHOTO_MESSAGES[added.reason] }, { status: REFUSED[added.reason] });
  return Response.json({ id: added.id, version: added.version, uploadUrl: added.uploadUrl });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/assets">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  return Response.json({ photos: await listPhotos(serverKeyDb(), guest.id, id) });
}
