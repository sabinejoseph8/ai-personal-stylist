import { fakeEngineAllowed } from "@/connectors/conversation/server";
import { z } from "zod";
import { currentGuest } from "@/lib/guest";
import { dailyTimeUsedLine, nextMonthFirst, nextVideoCycle } from "@/lib/budget-guard";
import { withinLimit } from "@/lib/rate-limits";
import { sessionDeps } from "@/lib/session-deps";
import { type StartRefusal, startConversation } from "@/lib/sessions";

// Start conversation (R12): picks up the guest's open session or opens one, reserves their time with
// the budget guard, and starts the video call. The browser gets only the call's join link.

// The day's limit and the dates come from the settings (7c: 20 minutes a day, video counted from the 21st).
const WHY: Record<StartRefusal | "too_many_starts", { status: number; message: string }> = {
  daily_time_used: { status: 409, message: "" },
  monthly_video_used: { status: 503, message: "" },
  video_busy: { status: 503, message: "The video stylist is with another visitor. Please try again in a few minutes." },
  video_unavailable: { status: 503, message: "The video stylist couldn't start. Please try again in a moment." },
  voice_unavailable: { status: 503, message: "The voice stylist couldn't start. Please try again in a moment." },
  too_many_starts: { status: 429, message: "You've started 5 conversations in the last hour. Please wait a little, then try again." },
  daily_ai_used: { status: 409, message: "You've reached today's limit for the demo. Come back tomorrow." },
  monthly_claude_used: { status: 503, message: "" },
  monthly_openai_used: { status: 503, message: "" },
};

const message = (reason: keyof typeof WHY) =>
  reason === "daily_time_used"
    ? dailyTimeUsedLine()
    : reason === "monthly_video_used"
      ? `The video stylist is resting until ${nextVideoCycle()}.`
      : reason === "monthly_claude_used" || reason === "monthly_openai_used"
        ? `The demo is resting until ${nextMonthFirst()}.`
        : WHY[reason].message;
const refuse = (reason: keyof typeof WHY) => Response.json({ reason, error: message(reason) }, { status: WHY[reason].status });

const Body = z.object({ engine: z.enum(["video", "voice"]).default("video") }).catch({ engine: "video" });

/** Start conversation: { engine } is video, or voice only (Voice only, 6c). */
export async function POST(request: Request) {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!(await withinLimit(guest.db, "startSession"))) return refuse("too_many_starts");
  const { engine } = Body.parse(await request.json().catch(() => ({})));

  // Browser tests only (never on the live site): the fake video or voice stylist can be made to refuse.
  const fake = fakeEngineAllowed() ? { video: request.headers.get("x-fake-video"), voice: request.headers.get("x-fake-voice") } : undefined;
  const result = await startConversation(sessionDeps(fake), guest.id, engine);
  if (!result.ok) return refuse(result.reason);
  // The lines the page shows when this call's time runs out (7c): the day's, and when video is back.
  return Response.json({
    sessionId: result.sessionId,
    resumed: result.resumed,
    engine: result.engine,
    because: result.because ?? null,
    call: result.call,
    seconds: result.seconds,
    endsBecause: result.endsBecause,
    dayUsedLine: dailyTimeUsedLine(),
    videoBackOn: nextVideoCycle(),
  });
}
