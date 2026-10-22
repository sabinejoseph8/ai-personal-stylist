import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { lookHistory } from "@/lib/looks-service";

// Compare (tech spec 4.1, R51, 5c): a look's earlier versions in its place, newest first, each with how
// it differs from the look on screen. Reading only: bringing one back is .../restore.

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/looks/[lookId]/history">) {
  const { id, lookId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(lookId).success) return Response.json({ error: "No such look." }, { status: 404 });
  const history = await lookHistory(looksDeps(), guest.id, id, lookId);
  return history ? Response.json(history) : Response.json({ error: "No such look." }, { status: 404 });
}
