import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { deletePreference } from "@/lib/privacy-service";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// Delete one saved preference (6b, R65), after the page has asked.

export async function DELETE(_request: Request, ctx: RouteContext<"/api/preferences/[preferenceId]">) {
  const { preferenceId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(preferenceId).success) return Response.json({ error: "No such preference." }, { status: 404 });
  if (!(await withinLimit(guest.db, "privacyChange"))) return Response.json({ error: "Too many changes this hour. Please wait a little, then try again." }, { status: 429 });
  if (!(await deletePreference(serverKeyDb(), guest.id, preferenceId))) return Response.json({ error: "No such preference." }, { status: 404 });
  return Response.json({ ok: true });
}
