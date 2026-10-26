import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { withinLimit } from "@/lib/rate-limits";
import { openSaved } from "@/lib/saved-looks-service";

// Open a saved look (6a, R60, Sabine's answer to Q1): checked again first, against the saved profile,
// with the judgment step through the budget guard. Answers { look } once it passed, or { none } with why
// it can't be shown. 20 an hour.

export const maxDuration = 60;

export async function POST(_request: Request, ctx: RouteContext<"/api/saved-looks/[savedId]/open">) {
  const { savedId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(savedId).success) return Response.json({ error: "No such look." }, { status: 404 });
  try {
    const result = await openSaved(looksDeps(), guest.id, savedId, { allowAi: () => withinLimit(guest.db, "openSavedLook") });
    if (!result) return Response.json({ error: "No such look." }, { status: 404 });
    if ("limited" in result) return Response.json({ error: "Too many looks opened this hour. Please wait a little, then try again." }, { status: 429 });
    return Response.json(result);
  } catch (e) {
    console.error(`saved looks: opening one failed: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "This look couldn't be checked. Try again." }, { status: 500 });
  }
}
