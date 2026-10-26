import { currentGuest } from "@/lib/guest";
import { clearSessionNotes } from "@/lib/privacy-service";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// Clear this session's notes (6b, R65): the open session's notes, feedback and "This session only"
// exceptions. Saved preferences stay. 404 when no session is open.

export async function DELETE() {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!(await withinLimit(guest.db, "privacyChange"))) return Response.json({ error: "Too many changes this hour. Please wait a little, then try again." }, { status: 429 });
  if (!(await clearSessionNotes(serverKeyDb(), guest.id))) return Response.json({ error: "There's no session open, so there are no notes to clear." }, { status: 404 });
  return Response.json({ ok: true });
}
