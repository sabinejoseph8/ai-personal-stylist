import { z } from "zod";
import { createGptLiveProvider, createVoiceCall } from "@/connectors/conversation/gpt-live/server";
import { currentGuest } from "@/lib/guest";
import { serverKeyDb } from "@/lib/supabase/admin";
import { attachVoiceCall } from "@/lib/voice-calls";

// Joining a voice-only call (6c; R9, tech spec 4.2): { callId, sdp } is the session's pending voice call
// and the browser's WebRTC offer. The answer is OpenAI's SDP answer and the call's id, never the key.

const Body = z.object({ callId: z.string().min(1).max(200), sdp: z.string().trim().min(1).max(20_000) });

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/voice">) {
  const { id } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "No such session." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request isn't valid." }, { status: 400 });
  const provider = createGptLiveProvider();
  const result = await attachVoiceCall({ db: serverKeyDb(), create: createVoiceCall, close: (callId) => provider.end(callId) }, guest.id, id, body.data.callId, body.data.sdp);
  // OpenAI's refusal code goes with the answer (a number, never the key), so a refused key can be told
  // apart from no credit or no access without the live site's logs (27 Oct 2026).
  if (!result.ok)
    return Response.json(
      { error: "The voice stylist couldn't start. Please try again.", ...(result.reason === "unavailable" ? { providerStatus: result.status } : {}) },
      { status: result.reason === "no_call" ? 409 : 503 },
    );
  return Response.json({ callId: result.callId, sdp: result.sdp });
}
