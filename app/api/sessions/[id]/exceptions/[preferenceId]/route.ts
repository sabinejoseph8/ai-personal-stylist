import { z } from "zod";
import { removeException } from "@/lib/exceptions-service";
import { jotWanted } from "@/lib/notes-service";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// Remove a "This session only" exception (R57, 5c): the saved preference limits the looks again, and
// what was asked for with it ("High heels") is taken back from the notes (fix plan 3).

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]/exceptions/[preferenceId]">) {
  const { id, preferenceId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(preferenceId).success) return Response.json({ error: "No such session." }, { status: 404 });
  if (!(await withinLimit(guest.db, "touchNote"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  const db = serverKeyDb();
  const { data: pref } = await db.from("saved_preferences").select("id, kind, words").eq("id", preferenceId).eq("user_id", guest.id).maybeSingle().throwOnError();
  const exceptions = await removeException(db, guest.id, id, preferenceId);
  if (!exceptions) return Response.json({ error: "No such session." }, { status: 404 });
  const notes = pref && pref.kind !== "likes" ? await jotWanted({ db }, guest.id, id, { id: pref.id, kind: pref.kind, words: pref.words }, false) : null;
  return Response.json({ exceptions, ...(notes ? { notes } : {}) });
}
