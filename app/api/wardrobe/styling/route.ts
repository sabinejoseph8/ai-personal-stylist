import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";
import { chooseForStyling } from "@/lib/wardrobe-service";

// Style with these (R37, Sabine's answer to Q2 in 3d): exactly these items are chosen for styling.

const Body = z.object({ ids: z.array(z.uuid()).max(50) });

export async function PUT(request: Request) {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "changePhoto"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  await chooseForStyling(serverKeyDb(), guest.id, body.data.ids);
  return Response.json({ ok: true });
}
