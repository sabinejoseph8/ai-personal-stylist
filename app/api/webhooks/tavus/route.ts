import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sessionDeps } from "@/lib/session-deps";
import { videoCallEnded } from "@/lib/sessions";

// Tavus's messages about a video call (7a, Sabine's answer to Q4). Only the end matters here
// ("system.shutdown"): the call's exact time is settled. Tavus doesn't sign its messages, so the address
// carries a secret (TAVUS_WEBHOOK_SECRET, a Vercel setting), and the conversation must be one of ours.
// Anything else is answered 200 and ignored, so Tavus doesn't keep resending it.

const Message = z.object({
  conversation_id: z.string().min(1).max(200),
  event_type: z.string().max(100),
  timestamp: z.string().max(100).optional(),
});

function fromTavus(request: Request) {
  const secret = process.env.TAVUS_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(new URL(request.url).searchParams.get("token") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!fromTavus(request)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const message = Message.safeParse(await request.json().catch(() => null));
  if (!message.success || message.data.event_type !== "system.shutdown") return Response.json({ ok: true });
  const endedAt = message.data.timestamp ? Date.parse(message.data.timestamp) : Date.now();
  try {
    const settled = await videoCallEnded(sessionDeps(), message.data.conversation_id, endedAt);
    return Response.json({ ok: true, settled });
  } catch (e) {
    // Tavus tries again on an error; the estimate stays as the fallback either way.
    console.error(`tavus webhook: settling a call failed: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "Not settled." }, { status: 500 });
  }
}
