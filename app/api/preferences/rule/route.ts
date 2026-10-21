import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { ruleMakingDeps } from "@/lib/rule-deps";

// The preference rule maker (4a): turns a Must have or Never preference into a rule on the products'
// details, which setup reads back to the shopper before it's saved (Sabine's answer to Q1 in 4a).
// Through the budget guard, 20 an hour at most. When AI is used up, the preference is judged instead.

const Body = z.object({ kind: z.enum(["must_have", "never"]), words: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "makeRule"))) return Response.json({ error: "Too many preferences at once. Please wait a little." }, { status: 429 });

  const { guard, maker } = ruleMakingDeps();
  const money = await guard.checkAi(guest.id, "claude");
  if (!money.ok) return Response.json({ rule: { type: "judged" } });
  const made = await maker.make(body.data.kind, body.data.words);
  if (made.costUsd > 0) await guard.recordAi(guest.id, "claude", made.costUsd);
  return Response.json({ rule: made.rule });
}
