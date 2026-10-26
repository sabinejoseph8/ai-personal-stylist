import { z } from "zod";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { changeSize, removeFromBag } from "@/lib/bag-service";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// A piece in the demo bag (6a, R61): PATCH { size } picks another size it comes in; DELETE is Remove.

const ENDED = { error: "Your demo has ended. Start again from the welcome screen." };
const Body = z.object({ size: z.string().trim().min(1).max(20) });

export async function PATCH(request: Request, ctx: RouteContext<"/api/bag/[itemId]">) {
  const { itemId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json(ENDED, { status: 401 });
  if (!z.uuid().safeParse(itemId).success) return Response.json({ error: "No such piece." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "bagChange"))) return Response.json({ error: "Too many bag changes this hour. Please wait a little, then try again." }, { status: 429 });
  const db = serverKeyDb();
  const items = await changeSize({ db, catalog: createSampleCatalog(db) }, guest.id, itemId, body.data.size);
  if (items === null) return Response.json({ error: "No such piece." }, { status: 404 });
  if (items === false) return Response.json({ error: "That piece doesn't come in that size." }, { status: 409 });
  return Response.json({ items });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/bag/[itemId]">) {
  const { itemId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json(ENDED, { status: 401 });
  if (!z.uuid().safeParse(itemId).success) return Response.json({ error: "No such piece." }, { status: 404 });
  if (!(await withinLimit(guest.db, "bagChange"))) return Response.json({ error: "Too many bag changes this hour. Please wait a little, then try again." }, { status: 429 });
  if (!(await removeFromBag(serverKeyDb(), guest.id, itemId))) return Response.json({ error: "No such piece." }, { status: 404 });
  return Response.json({ ok: true });
}
