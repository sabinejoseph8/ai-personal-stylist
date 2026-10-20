import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { PHOTO_MESSAGES } from "@/lib/photos";
import { choosePhoto, removePhoto } from "@/lib/photos-service";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// Switch the active photo (PATCH) or Remove one (DELETE), R31. Four changes a second at most.

const Body = z.object({ active: z.literal(true) });

async function guestAndIds(ctx: RouteContext<"/api/sessions/[id]/assets/[assetId]">) {
  const { id, assetId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(assetId).success) return Response.json({ error: PHOTO_MESSAGES.photo }, { status: 404 });
  if (!(await withinLimit(guest.db, "changePhoto"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  return { guest, id, assetId };
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/sessions/[id]/assets/[assetId]">) {
  const found = await guestAndIds(ctx);
  if (found instanceof Response) return found;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await choosePhoto(serverKeyDb(), found.guest.id, found.id, found.assetId))) return Response.json({ error: PHOTO_MESSAGES.photo }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]/assets/[assetId]">) {
  const found = await guestAndIds(ctx);
  if (found instanceof Response) return found;
  if (!(await removePhoto(serverKeyDb(), found.guest.id, found.id, found.assetId))) return Response.json({ error: PHOTO_MESSAGES.photo }, { status: 404 });
  return Response.json({ ok: true });
}
