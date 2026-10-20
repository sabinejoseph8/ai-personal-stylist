import { currentGuest } from "@/lib/guest";
import { withinLimit } from "@/lib/rate-limits";
import { sessionDeps } from "@/lib/session-deps";
import { type StartRefusal, startConversation } from "@/lib/sessions";

// Start conversation (R12): picks up the guest's open session or opens one, reserves their time with
// the budget guard, and starts the video call. The browser gets only the call's join link.

const WHY: Record<StartRefusal | "too_many_starts", { status: number; message: string }> = {
  daily_time_used: { status: 409, message: "You've used today's 10 minutes with your stylist. Come back tomorrow to talk again." },
  monthly_video_used: { status: 503, message: "The video stylist is resting until the 1st of next month." },
  video_busy: { status: 503, message: "The video stylist is with another visitor. Please try again in a few minutes." },
  video_unavailable: { status: 503, message: "The video stylist couldn't start. Please try again in a moment." },
  too_many_starts: { status: 429, message: "You've started 5 conversations in the last hour. Please wait a little, then try again." },
  daily_ai_used: { status: 409, message: "You've reached today's limit for the demo. Come back tomorrow." },
  monthly_claude_used: { status: 503, message: "The demo is resting until the 1st of next month." },
  monthly_openai_used: { status: 503, message: "The demo is resting until the 1st of next month." },
};

const refuse = (reason: keyof typeof WHY) => Response.json({ reason, error: WHY[reason].message }, { status: WHY[reason].status });

export async function POST() {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!(await withinLimit(guest.db, "startSession"))) return refuse("too_many_starts");

  const result = await startConversation(sessionDeps(), guest.id);
  if (!result.ok) return refuse(result.reason);
  return Response.json({ sessionId: result.sessionId, resumed: result.resumed, call: result.call, seconds: result.seconds });
}
