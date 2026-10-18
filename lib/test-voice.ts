import OpenAI from "openai";
import stylist from "@/tavus/stylist-pal.json";

// Voices offered on the Phase 0 test page (feminine English voices, plus the default).
export const TEST_VOICES = ["marin", "gleam", "coral", "shimmer", "sage", "willow", "quartz", "delta"] as const;

/** Removes the OpenAI key from any text before it leaves the server. */
function scrub(text: string): string {
  const key = process.env.OPENAI_API_KEY;
  return key ? text.split(key).join("[hidden]") : text;
}

/**
 * Starts a GPT-Live voice session for the browser's WebRTC offer.
 * Returns only the session ID and the SDP answer, never the key.
 */
export async function startTestVoiceSession(sdp: string, voice: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  try {
    const result = await client.live.create({
      session: {
        model: "gpt-live-1",
        instructions: `${stylist.system_prompt} You are now in voice only, with no video. Never offer to look things up or delegate tasks.`,
        audio: { output: { voice } },
        delegation: null,
      },
      transport: { type: "webrtc", sdp },
    });
    return { ok: true as const, sessionId: String(result.session.id), sdp: String(result.transport.sdp) };
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      return { ok: false as const, status: error.status ?? 502, message: scrub(String(error.message)).slice(0, 300) };
    }
    throw error;
  }
}
