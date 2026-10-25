import { after } from "next/server";
import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { restoreLook } from "@/lib/looks-service";
import { notesDeps } from "@/lib/notes-deps";
import { takeBackFeedback } from "@/lib/notes-service";
import { SessionEndedError } from "@/lib/notes-store";
import { undoAnswer } from "@/lib/undo-answer";
import { withinLimit } from "@/lib/rate-limits";

// Undo feedback and Use this look (tech spec 4.1, R51, 5c): { undo: true } brings back the look before
// the last revision and takes back the feedback it answered; { versionId } brings back an earlier
// version from Compare. Either is checked against the current requirements first: the answer is the
// look back in its place (with the notes, after Undo), or { none } saying why it no longer fits, or
// { stale } when the looks need bringing up to date first. Counted with swaps (40 an hour).

export const maxDuration = 60;

const Body = z.union([z.object({ undo: z.literal(true) }), z.object({ versionId: z.uuid() })]);

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/looks/[lookId]/restore">) {
  const { id, lookId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(lookId).success) return Response.json({ error: "No such look." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });

  // Registered with after(), so a look that's checked is saved even if the page goes away.
  const restoring = restoreLook(looksDeps(), guest.id, id, lookId, body.data, { allowAi: () => withinLimit(guest.db, "swapPiece") });
  after(restoring.catch(() => undefined));
  try {
    const result = await restoring;
    if (!result) return Response.json({ error: "No such look." }, { status: 404 });
    if ("limited" in result) return Response.json({ error: "Too many changes this hour. Please wait a little, then try again." }, { status: 429 });
    if (!("look" in result)) return Response.json(result);
    // The look is back: the answer says so even if taking back its feedback fails (review batch 4, C12).
    return Response.json(await undoAnswer(result.look, result.takeBack.length ? () => takeBackFeedback(notesDeps(), guest.id, id, result.takeBack) : null));
  } catch (e) {
    if (e instanceof SessionEndedError) return Response.json({ error: "No such look." }, { status: 404 });
    console.error(`looks: bringing back a look failed: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "That look couldn't be checked. Try again." }, { status: 500 });
  }
}
