import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { setPermission } from "@/lib/privacy-service";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// The permissions the app keeps (6b, R64): { which, on }. Turning one off deletes what it covered, after
// the page has asked: the wardrobe (Sabine's answer to Q2) or the saved preferences (Q3).

const Body = z.object({ which: z.enum(["wardrobePhotos", "savingPreferences"]), on: z.boolean() });

export async function PATCH(request: Request) {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "privacyChange"))) return Response.json({ error: "Too many changes this hour. Please wait a little, then try again." }, { status: 429 });
  await setPermission(serverKeyDb(), guest.id, body.data.which, body.data.on);
  return Response.json({ ok: true });
}
