import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { sessionContext } from "@/lib/session-context";
import { serverKeyDb } from "@/lib/supabase/admin";

// What the stylist should know as a call starts (3d): the notes, saved preferences, the photo to style
// around and the wardrobe items chosen for styling, so she knows them before anything changes.

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/context">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const db = serverKeyDb();
  const { data } = await db.from("sessions").select("id").eq("id", id).eq("user_id", guest.id).in("status", ["active", "paused"]).maybeSingle().throwOnError();
  if (!data) return Response.json({ error: "No such session." }, { status: 404 });
  return Response.json({ context: await sessionContext(db, guest.id, id) });
}
