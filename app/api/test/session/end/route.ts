import { endTestConversation, passcodeOk, wrongPasscode } from "@/lib/test-session";

// Phase 0 test only: ends a Tavus call so it stops using minutes.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!passcodeOk(body?.passcode)) {
    return wrongPasscode();
  }
  if (typeof body?.conversationId !== "string" || !/^[a-z0-9]{6,40}$/i.test(body.conversationId)) {
    return Response.json({ error: "Missing conversation" }, { status: 400 });
  }
  const result = await endTestConversation(body.conversationId);
  return Response.json({ ended: result.ok, deleted: result.deleted }, { status: result.ok ? 200 : 502 });
}
