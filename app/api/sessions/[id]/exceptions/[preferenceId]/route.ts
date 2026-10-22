import { z } from "zod";
import { removeException } from "@/lib/exceptions-service";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// Remove a "This session only" exception (R57, 5c): the saved preference limits the looks again.

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]/exceptions/[preferenceId]">) {
  const { id, preferenceId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(preferenceId).success) return Response.json({ error: "No such session." }, { status: 404 });
  if (!(await withinLimit(guest.db, "touchNote"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  const exceptions = await removeException(serverKeyDb(), guest.id, id, preferenceId);
  return exceptions ? Response.json({ exceptions }) : Response.json({ error: "No such session." }, { status: 404 });
}
