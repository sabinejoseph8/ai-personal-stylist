import { currentGuest } from "@/lib/guest";
import { deleteAllData } from "@/lib/privacy-service";
import { withinLimit } from "@/lib/rate-limits";
import { sessionDeps } from "@/lib/session-deps";

// Delete all my data (6b; R65, S19): after the page has asked, the call ends, every row and photo goes
// with the guest, and this browser is signed out. The page then goes to the welcome screen.

export async function DELETE() {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!(await withinLimit(guest.db, "privacyChange"))) return Response.json({ error: "Too many changes this hour. Please wait a little, then try again." }, { status: 429 });
  try {
    await deleteAllData(sessionDeps(), guest.id);
  } catch (e) {
    console.error(`delete all: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "Your data couldn't be deleted. Try again." }, { status: 500 });
  }
  // The guest is gone: only this browser's sign-in is left to clear.
  await guest.db.auth.signOut({ scope: "local" }).catch(() => undefined);
  return Response.json({ ok: true });
}
