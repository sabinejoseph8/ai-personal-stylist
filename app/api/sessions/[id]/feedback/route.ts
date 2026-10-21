import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { notesDeps } from "@/lib/notes-deps";
import { feedbackByTouch } from "@/lib/notes-service";
import { withinLimit } from "@/lib/rate-limits";

// Keep and Change on an item of a look (tech spec 4.1, R46, 5a): { lookId, index, act, on }. The answer
// is the notes, with the feedback line jotted under its look or taken back, and the stylist's context.
// Counted with touches on notes (4 a second).

const Body = z.object({ lookId: z.uuid(), index: z.number().int().min(0).max(11), act: z.enum(["keep", "change"]), on: z.boolean() });

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/feedback">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "touchNote"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  const update = await feedbackByTouch(notesDeps(), guest.id, id, body.data);
  if (!update) return Response.json({ error: "That look has changed." }, { status: 404 });
  return Response.json(update);
}
