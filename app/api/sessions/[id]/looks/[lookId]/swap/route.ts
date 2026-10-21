import { after } from "next/server";
import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { swapPiece } from "@/lib/looks-service";
import { SessionEndedError } from "@/lib/notes-store";
import { withinLimit } from "@/lib/rate-limits";

// Swap a piece (tech spec 4.1, R43, Sabine's answer to Q1 in 4c): { index } names the item in the look.
// The answer is the look with its new piece, in the same place, once it has passed the whole
// preference check; or { none } when nothing else fits; or { stale } when the look needs bringing up
// to date first. 40 swaps an hour.

// Up to 3 batches of 3 replacements, each checked by the judgment step.
export const maxDuration = 120;

const Body = z.object({ index: z.number().int().min(0).max(11) });

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/looks/[lookId]/swap">) {
  const { id, lookId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(lookId).success) return Response.json({ error: "No such look." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });

  // Registered with after(), so a swap that's checked is saved even if the page goes away (Phase 3 review).
  const swapping = swapPiece(looksDeps(), guest.id, id, lookId, body.data.index, { allowAi: () => withinLimit(guest.db, "swapPiece") });
  after(swapping.catch(() => undefined));
  try {
    const result = await swapping;
    if (!result) return Response.json({ error: "No such look." }, { status: 404 });
    if ("limited" in result) return Response.json({ error: "Too many swaps this hour. Please wait a little, then try again." }, { status: 429 });
    return Response.json(result);
  } catch (e) {
    if (e instanceof SessionEndedError) return Response.json({ error: "No such look." }, { status: 404 });
    console.error(`looks: swapping a piece failed: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "The swap couldn't be checked. Try again." }, { status: 500 });
  }
}
