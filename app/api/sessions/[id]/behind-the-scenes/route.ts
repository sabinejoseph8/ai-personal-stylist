import { z } from "zod";
import { behindTheScenesFor } from "@/lib/behind-the-scenes";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { withinLimit } from "@/lib/rate-limits";

// Behind the scenes (tech spec 4.1, R72): the guest's own session, in plain-language entries, newest
// first. Read only, no AI. 240 an hour, since the open panel asks again as notes and looks change.

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/behind-the-scenes">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  if (!(await withinLimit(guest.db, "behindTheScenes"))) return Response.json({ error: "Too many requests. Please wait a little." }, { status: 429 });
  const entries = await behindTheScenesFor(looksDeps(), guest.id, id);
  if (!entries) return Response.json({ error: "No such session." }, { status: 404 });
  return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}
