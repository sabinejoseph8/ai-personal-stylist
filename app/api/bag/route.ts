import { z } from "zod";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { type AddRefusal, addToBag, listBag } from "@/lib/bag-service";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// The demo bag (6a; R61, R62). GET lists it. POST { sessionId, lookId, items: [{ productId, size }] } is
// Add to bag: pieces of a look on the guest's screen whose check passed on the current requirements
// (Sabine's answer to Q3), never the shopper's own. 120 bag changes an hour.

const ENDED = { error: "Your demo has ended. Start again from the welcome screen." };
const Body = z.object({
  sessionId: z.uuid(),
  lookId: z.uuid(),
  items: z.array(z.object({ productId: z.uuid(), size: z.string().trim().min(1).max(20) })).min(1).max(12),
});

const REFUSED: Record<AddRefusal, string> = {
  owned: "Your own pieces can't go in the bag.",
  not_in_look: "That piece isn't in this look.",
  size: "That piece doesn't come in that size.",
  full: "Your demo bag holds 30 pieces. Remove one to add another.",
};

export async function GET() {
  const guest = await currentGuest();
  if (!guest) return Response.json(ENDED, { status: 401 });
  const db = serverKeyDb();
  return Response.json({ items: await listBag({ db, catalog: createSampleCatalog(db) }, guest.id) });
}

export async function POST(request: Request) {
  const guest = await currentGuest();
  if (!guest) return Response.json(ENDED, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "bagChange"))) return Response.json({ error: "Too many bag changes this hour. Please wait a little, then try again." }, { status: 429 });
  const result = await addToBag(looksDeps(), guest.id, body.data.sessionId, body.data.lookId, body.data.items);
  if (!result) return Response.json({ error: "No such look." }, { status: 404 });
  if ("stale" in result) return Response.json({ error: "This look needs a new check before its pieces can go in the bag." }, { status: 409 });
  if ("refused" in result) return Response.json({ reason: result.refused, error: REFUSED[result.refused] }, { status: 409 });
  return Response.json(result);
}
