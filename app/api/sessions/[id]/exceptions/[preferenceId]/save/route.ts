import { z } from "zod";
import { saveExceptionToProfile } from "@/lib/exceptions-service";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// Save to my profile (R57, Sabine's answer to Q2 in 5c): after the shopper confirms, the preference
// allowed for this session is taken off the profile. Answers with the exceptions and saved preferences left.

export async function POST(_request: Request, ctx: RouteContext<"/api/sessions/[id]/exceptions/[preferenceId]/save">) {
  const { id, preferenceId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(preferenceId).success) return Response.json({ error: "No such session." }, { status: 404 });
  if (!(await withinLimit(guest.db, "touchNote"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });
  const saved = await saveExceptionToProfile(serverKeyDb(), guest.id, id, preferenceId);
  return saved ? Response.json(saved) : Response.json({ error: "That preference isn't allowed in this session." }, { status: 404 });
}
