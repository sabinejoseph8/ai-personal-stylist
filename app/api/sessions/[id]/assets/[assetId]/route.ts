import { z } from "zod";
import { DETAIL_NAMES } from "@/core/photos/item";
import { currentGuest } from "@/lib/guest";
import { PHOTO_MESSAGES } from "@/lib/photos";
import { changePhoto, choosePhoto, removePhoto } from "@/lib/photos-service";
import { withinLimit } from "@/lib/rate-limits";
import { sessionContext } from "@/lib/session-context";
import { serverKeyDb } from "@/lib/supabase/admin";

// Changes to a photo (R28 to R31), four a second at most. PATCH makes it the active photo, confirms a
// detail, picks one of several items, or says whether it's the shopper's (3b). DELETE removes it.
// Each answer carries the stylist's context, so she knows at once.

const Body = z.union([
  z.object({ active: z.literal(true) }),
  z.object({ confirm: z.enum(DETAIL_NAMES) }),
  z.object({ choose: z.number().int().min(0).max(3) }),
  z.object({ ownership: z.enum(["owned", "inspiration"]) }),
]);

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
  const { guest, id, assetId } = found;
  const db = serverKeyDb();
  const change = body.data;
  if ("active" in change) {
    if (!(await choosePhoto(db, guest.id, id, assetId))) return Response.json({ error: PHOTO_MESSAGES.photo }, { status: 404 });
    return Response.json({ ok: true, context: await sessionContext(db, guest.id, id) });
  }
  const item = await changePhoto(
    db,
    guest.id,
    id,
    assetId,
    "confirm" in change ? { confirm: [change.confirm] } : "choose" in change ? { choose: change.choose } : { ownership: change.ownership },
  );
  if (!item) return Response.json({ error: PHOTO_MESSAGES.photo }, { status: 404 });
  return Response.json({ item, context: await sessionContext(db, guest.id, id) });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]/assets/[assetId]">) {
  const found = await guestAndIds(ctx);
  if (found instanceof Response) return found;
  const db = serverKeyDb();
  if (!(await removePhoto(db, found.guest.id, found.id, found.assetId))) return Response.json({ error: PHOTO_MESSAGES.photo }, { status: 404 });
  return Response.json({ ok: true, context: await sessionContext(db, found.guest.id, found.id) });
}
