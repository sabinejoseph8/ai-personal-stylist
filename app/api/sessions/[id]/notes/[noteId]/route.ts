import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { notesDeps } from "@/lib/notes-deps";
import { touchSessionNote } from "@/lib/notes-service";
import { withinLimit } from "@/lib/rate-limits";

// Confirm, Remove or Undo a note by touch (R20). A touch always beats a later-arriving reading of
// earlier words (R22). Four touches a second at most (Phase 2 review).
const Body = z.object({ action: z.enum(["confirm", "remove", "restore"]) });

export async function PATCH(request: Request, ctx: RouteContext<"/api/sessions/[id]/notes/[noteId]">) {
  const { id, noteId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(noteId).success) return Response.json({ error: "No such note." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "touchNote"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });

  const result = await touchSessionNote(notesDeps(), guest.id, id, noteId, body.data.action);
  if (!result) return Response.json({ error: "No such note." }, { status: 404 });
  return Response.json(result);
}
