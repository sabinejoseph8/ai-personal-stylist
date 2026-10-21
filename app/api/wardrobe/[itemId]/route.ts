import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";
import { WardrobeEdit } from "@/lib/wardrobe";
import { deleteItem, editItem } from "@/lib/wardrobe-service";

// Edit a wardrobe item's details, or Delete it with its photo (R37). Four changes a second at most.

async function guestAndId(ctx: RouteContext<"/api/wardrobe/[itemId]">) {
  const { itemId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(itemId).success) return Response.json({ error: "No such item." }, { status: 404 });
  if (!(await withinLimit(guest.db, "changePhoto"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  return { guest, itemId };
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/wardrobe/[itemId]">) {
  const found = await guestAndId(ctx);
  if (found instanceof Response) return found;
  const body = WardrobeEdit.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "That request isn't valid." }, { status: 400 });
  const item = await editItem(serverKeyDb(), found.guest.id, found.itemId, body.data);
  if (!item) return Response.json({ error: "No such item." }, { status: 404 });
  return Response.json({ item });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/wardrobe/[itemId]">) {
  const found = await guestAndId(ctx);
  if (found instanceof Response) return found;
  if (!(await deleteItem(serverKeyDb(), found.guest.id, found.itemId))) return Response.json({ error: "No such item." }, { status: 404 });
  return Response.json({ ok: true });
}
