import { passcodeOk, startTestConversation } from "@/lib/test-session";

// Phase 0 test only: starts a Tavus video call when the passcode is right.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!passcodeOk(body?.passcode)) {
    return Response.json({ error: "Wrong passcode" }, { status: 401 });
  }
  const result = await startTestConversation();
  if (!result.ok) {
    return Response.json(
      { error: "Tavus refused the call", tavusStatus: result.status, tavusMessage: result.message },
      { status: 502 },
    );
  }
  return Response.json({ conversationId: result.conversationId, conversationUrl: result.conversationUrl });
}
