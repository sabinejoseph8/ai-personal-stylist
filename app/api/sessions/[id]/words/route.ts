import { after } from "next/server";
import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { notesDeps } from "@/lib/notes-deps";
import { hearWords, type NotesUpdate } from "@/lib/notes-service";
import { withinLimit } from "@/lib/rate-limits";

// New words heard (tech spec 4.1, R15 to R19). The answer streams one line of JSON per update: first
// the notes after plain code reads money and dates, then the notes after Claude's reading.

const Body = z.object({
  words: z.string().trim().min(1).max(3000),
  stylistSaid: z.string().max(600).default(""),
  final: z.boolean().default(false),
  /** The browser's label for the shopper's turn: the session's question stays while the turn does. */
  turn: z.string().max(64).default(""),
  /** The look most on the shopper's screen (5a), for feedback that doesn't name one. */
  look: z.number().int().min(1).max(3).nullable().default(null),
  /** The page shows looks: readings while the shopper talks leave reactions to them for the end (5a). */
  looks: z.boolean().default(false),
  /** The saved preference the stylist just asked about (5c): the words may answer it. */
  asking: z.uuid().nullable().default(null),
});

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/words">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "newWords"))) return Response.json({ error: "Too many updates at once." }, { status: 429 });

  const deps = notesDeps();
  const encoder = new TextEncoder();
  // If the browser goes away mid-answer (a reload), the reading still finishes and is saved: it's
  // registered with after(), because Vercel stops work a cancelled response leaves behind (Phase 3 review).
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
      const hearing = (async () => {
        try {
          const found = await hearWords(deps, guest.id, id, body.data, (update: NotesUpdate) => send(update));
          if (!found) send({ error: "No such session." });
        } catch (e) {
          console.error(`notes: hearing words failed: ${e instanceof Error ? e.message : e}`);
          send({ paused: true });
        }
      })();
      after(hearing);
      await hearing;
      if (listening) controller.close();
      listening = false;
    },
    cancel() {
      listening = false;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
