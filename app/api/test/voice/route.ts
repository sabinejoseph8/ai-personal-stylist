import { passcodeOk } from "@/lib/test-session";
import { startTestVoiceSession, TEST_VOICES } from "@/lib/test-voice";

// Phase 0 test only: exchanges the browser's WebRTC offer for a GPT-Live answer.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!passcodeOk(body?.passcode)) {
    return Response.json({ error: "Wrong passcode" }, { status: 401 });
  }
  if (typeof body?.sdp !== "string" || !body.sdp.trim() || body.sdp.length > 20000) {
    return Response.json({ error: "An SDP offer is required" }, { status: 400 });
  }
  const voice = TEST_VOICES.includes(body?.voice) ? body.voice : "marin";
  const result = await startTestVoiceSession(body.sdp, voice);
  if (!result.ok) {
    return Response.json({ error: "OpenAI refused the call", status: result.status, message: result.message }, { status: 502 });
  }
  return Response.json({ sessionId: result.sessionId, sdp: result.sdp });
}
