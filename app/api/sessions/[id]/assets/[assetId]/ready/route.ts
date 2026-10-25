import { after } from "next/server";
import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { SessionEndedError } from "@/lib/notes-store";
import { photoReadingDeps } from "@/lib/photo-deps";
import { PHOTO_MESSAGES } from "@/lib/photos";
import { type FinishRefusal, finishPhoto, readPhoto } from "@/lib/photos-service";
import { withinLimit } from "@/lib/rate-limits";
import { sessionContext } from "@/lib/session-context";

// The browser has sent the photo to its upload link: the server checks its real type and size,
// cleans it (no location or camera details) and keeps it (FR-27). It shares the 4-a-second limit on
// photo changes. The answer streams one line of JSON per update: first the kept photo, with its
// short-lived links, showing Analyzing; then what the photo reader found (3b), with the stylist's
// context. If the browser goes away meanwhile, the reading still finishes and is saved: it's
// registered with after(), because Vercel stops work a cancelled response leaves behind (Phase 3 review).

const Body = z.object({ version: z.number().int().positive() });

const REFUSED: Record<FinishRefusal, number> = { type: 415, size: 413, unreadable: 422, missing: 409 };

// Converting a large HEIC photo can take a few seconds, and reading it a few more.
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/assets/[assetId]/ready">) {
  const { id, assetId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(assetId).success) return Response.json({ error: PHOTO_MESSAGES.photo }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "changePhoto"))) return Response.json({ error: "Too many changes at once." }, { status: 429 });

  const deps = photoReadingDeps();
  const result = await finishPhoto(deps.db, guest.id, id, assetId, body.data.version);
  // Replaced or removed meanwhile, or the session ended.
  if (!result) return Response.json({ reason: "photo", error: PHOTO_MESSAGES.photo }, { status: 404 });
  if (!result.ok) return Response.json({ reason: result.reason, error: PHOTO_MESSAGES[result.reason] }, { status: REFUSED[result.reason] });
  const { photo, jpeg } = result;

  const reading = (async () => {
    try {
      const item = await readPhoto(deps, guest.id, assetId, photo.version, jpeg);
      // Null: replaced or removed while it was being read, so its answer is dropped (R31).
      return item ? { id: assetId, version: photo.version, item, context: await sessionContext(deps.db, guest.id, id) } : null;
    } catch (e) {
      if (e instanceof SessionEndedError) return null; // the session was deleted meanwhile
      console.error(`photos: reading a photo failed: ${e instanceof Error ? e.message : e}`);
      // Saved as failed too, or a reload showed Analyzing for two minutes (review batch 5, D9).
      const failed = { state: "failed", items: [], chosen: null };
      await deps.db.rpc("save_asset_details", { asset: assetId, expected_version: photo.version, details: failed }).then(() => undefined, () => undefined);
      return { id: assetId, version: photo.version, item: { reading: { state: "failed", items: [], chosen: null }, ownership: null } };
    }
  })();
  after(reading);

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
      send({ photo });
      const line = await reading;
      if (line) send(line);
      if (listening) controller.close();
      listening = false;
    },
    cancel() {
      listening = false;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
