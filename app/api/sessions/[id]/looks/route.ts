import { after } from "next/server";
import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { buildLooks, currentLooks } from "@/lib/looks-service";
import { SessionEndedError } from "@/lib/notes-store";
import { withinLimit } from "@/lib/rate-limits";

// Looks (tech spec 4.1; R39, R40, R44, R54, R55, R58, R59). POST brings them up to date: the answer
// streams one line of JSON per stage ("updating" while the looks on screen are checked again, then
// "building" and "checking" for new ones), then the looks, with a no-match explanation when fewer than
// three pass. With nothing changed it answers at once, at no cost. { force: true } is Try again. 20
// builds an hour; asking is limited to 120. GET gives the looks on screen. Swap is .../:lookId/swap.

const Body = z.object({ force: z.boolean().default(false) });

// The builder and the checks take a while with Opus 5.5 at medium effort, and up to 3 rounds.
export const maxDuration = 300;

const TOO_MANY = "Too many looks this hour. Please wait a little, then try again.";

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/looks">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "looksRequest"))) return Response.json({ error: TOO_MANY }, { status: 429 });

  const deps = looksDeps();
  const encoder = new TextEncoder();
  let listening = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) => {
        if (!listening) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          listening = false;
        }
      };
      // Registered with after(), so the build finishes and is saved if the page goes away (Phase 3 review).
      const building = (async () => {
        try {
          const result = await buildLooks(deps, guest.id, id, (state) => send({ state }), {
            force: body.data.force,
            allowAi: () => withinLimit(guest.db, "buildLooks"),
          });
          send(!result ? { error: "No such session." } : "limited" in result ? { error: TOO_MANY } : result);
        } catch (e) {
          // The shopper ended the session meanwhile: nothing to show.
          if (e instanceof SessionEndedError) return send({ error: "No such session." });
          console.error(`looks: building looks failed: ${e instanceof Error ? e.message : e}`);
          send({ error: "The looks couldn't be put together. Try again." });
        }
      })();
      after(building);
      await building;
      if (listening) controller.close();
      listening = false;
    },
    cancel() {
      listening = false;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/looks">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  return Response.json({ looks: await currentLooks(looksDeps(), guest.id, id) });
}
