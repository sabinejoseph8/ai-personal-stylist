import { z } from "zod";
import { cameraDeps, type FrameRefusal, MAX_FRAME_BYTES, readFrame } from "@/lib/camera-service";
import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";

// One small camera frame for live recognition (tech spec 4.1, R34): what it shows comes back, and the
// frame is thrown away. One every 2 seconds at most (tech spec 6).

const Body = z.object({ frame: z.string().min(1).max(Math.ceil((MAX_FRAME_BYTES * 4) / 3) + 4) });

const REFUSED: Record<FrameRefusal, { status: number; error: string }> = {
  session: { status: 404, error: "No such session." },
  frame: { status: 400, error: "That isn't a camera frame." },
  allowance: { status: 409, error: "You've reached today's limit for the demo." },
  failed: { status: 502, error: "The camera reader couldn't answer." },
};

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/camera-frame">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  if (!(await withinLimit(guest.db, "cameraFrame"))) return Response.json({ error: "Too many frames at once." }, { status: 429 });

  const result = await readFrame(cameraDeps(), guest.id, id, Buffer.from(body.data.frame, "base64"));
  if (!result.ok) return Response.json({ reason: result.reason, error: REFUSED[result.reason].error }, { status: REFUSED[result.reason].status });
  return Response.json({ sighting: result.sighting });
}
