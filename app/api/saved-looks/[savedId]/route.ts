import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { removeSaved } from "@/lib/saved-looks-service";
import { serverKeyDb } from "@/lib/supabase/admin";

// Remove a saved look (6a, R60), after the page has confirmed it.

export async function DELETE(_request: Request, ctx: RouteContext<"/api/saved-looks/[savedId]">) {
  const { savedId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(savedId).success) return Response.json({ error: "No such look." }, { status: 404 });
  if (!(await withinLimit(guest.db, "saveLook"))) return Response.json({ error: "Too many changes this hour. Please wait a little, then try again." }, { status: 429 });
  if (!(await removeSaved(serverKeyDb(), guest.id, savedId))) return Response.json({ error: "No such look." }, { status: 404 });
  return Response.json({ ok: true });
}
