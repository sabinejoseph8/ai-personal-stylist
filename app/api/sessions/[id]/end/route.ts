import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { sessionDeps } from "@/lib/session-deps";
import { endConversation } from "@/lib/sessions";

// End (R12) ends the session. A call that stopped by itself (time up, the tab closed) sends
// keep: true, so the session stays open to resume for 30 minutes.
const Body = z.object({ keep: z.boolean().optional() }).nullable();

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/end">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });

  const result = await endConversation(sessionDeps(), guest.id, id, body.data?.keep ?? false);
  if (!result) return Response.json({ error: "No such session." }, { status: 404 });
  return Response.json(result);
}
