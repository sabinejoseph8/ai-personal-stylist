import { cookies } from "next/headers";
import { currentGuest } from "@/lib/guest";
import { deleteAllData } from "@/lib/privacy-service";
import { withinLimit } from "@/lib/rate-limits";
import { sessionDeps } from "@/lib/session-deps";
import { GUEST_COOKIE } from "@/lib/supabase/cookies";

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
  // The guest is gone: only this browser's sign-in is left to clear. Signing out a deleted guest doesn't
  // always clear the cookie (found on GitHub's phone run), so the sign-in cookies are deleted here too:
  // left behind, the page still read the browser as a guest and showed "Welcome back".
  await guest.db.auth.signOut({ scope: "local" }).catch(() => undefined);
  const jar = await cookies();
  for (const { name } of jar.getAll()) if (name.startsWith("sb-")) jar.delete({ name, path: GUEST_COOKIE.path });
  return Response.json({ ok: true });
}
