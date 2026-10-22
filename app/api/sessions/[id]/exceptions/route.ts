import { z } from "zod";
import { allowException, listExceptions } from "@/lib/exceptions-service";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// "This session only" exceptions (tech spec 4.1, R57, 5c). GET gives the session's exceptions; POST
// { preferenceId } is Allow for this session, for a saved Must have or Never. Counted with touches on
// notes (4 a second). The looks pick the change up from the requirements on their next request.

const Body = z.object({ preferenceId: z.uuid() });

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/exceptions">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const exceptions = await listExceptions(serverKeyDb(), guest.id, id);
  return exceptions ? Response.json({ exceptions }) : Response.json({ error: "No such session." }, { status: 404 });
}

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/exceptions">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "touchNote"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  const exceptions = await allowException(serverKeyDb(), guest.id, id, body.data.preferenceId);
  return exceptions ? Response.json({ exceptions }) : Response.json({ error: "That preference can't be allowed here." }, { status: 404 });
}
