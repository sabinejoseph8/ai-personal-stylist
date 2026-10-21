import { after } from "next/server";
import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { looksDeps } from "@/lib/looks-deps";
import { buildLooks, currentLooks } from "@/lib/looks-service";
import { withinLimit } from "@/lib/rate-limits";

// Looks (tech spec 4.1; R39, R40, R54, R55, R59). POST builds them: the answer streams one line of JSON
// per stage ("building", then "checking"), then the published looks, with a no-match explanation when
// fewer than three pass. 20 builds an hour at most. GET gives the current looks. Swap, refine, restore
// and compare join in 4c and Phase 5.

// The builder and the checks take a while with Opus 5.5 at medium effort, and up to 3 rounds.
export const maxDuration = 300;

export async function POST(_request: Request, ctx: RouteContext<"/api/sessions/[id]/looks">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  if (!(await withinLimit(guest.db, "buildLooks"))) return Response.json({ error: "Too many looks this hour. Please wait a little, then try again." }, { status: 429 });

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
          const result = await buildLooks(deps, guest.id, id, (state) => send({ state }));
          send(result ?? { error: "No such session." });
        } catch (e) {
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
