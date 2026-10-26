import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { withinLimit } from "@/lib/rate-limits";
import { listSaved, saveLook } from "@/lib/saved-looks-service";
import { serverKeyDb } from "@/lib/supabase/admin";

// Saved looks (6a, R60). GET lists the guest's saved looks. POST { sessionId, lookId } is Save look: a
// look on the guest's screen whose check passed on the current requirements (Sabine's answer to Q3).

const ENDED = { error: "Your demo has ended. Start again from the welcome screen." };
const Body = z.object({ sessionId: z.uuid(), lookId: z.uuid() });

export async function GET() {
  const guest = await currentGuest();
  if (!guest) return Response.json(ENDED, { status: 401 });
  return Response.json({ looks: await listSaved(serverKeyDb(), guest.id) });
}

export async function POST(request: Request) {
  const guest = await currentGuest();
  if (!guest) return Response.json(ENDED, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "saveLook"))) return Response.json({ error: "Too many saves this hour. Please wait a little, then try again." }, { status: 429 });
  const result = await saveLook(looksDeps(), guest.id, body.data.sessionId, body.data.lookId);
  if (!result) return Response.json({ error: "No such look." }, { status: 404 });
  if ("stale" in result) return Response.json({ error: "This look needs a new check before it can be saved." }, { status: 409 });
  if ("full" in result) return Response.json({ error: "You've saved 30 looks. Remove one to save another." }, { status: 409 });
  return Response.json(result);
}
