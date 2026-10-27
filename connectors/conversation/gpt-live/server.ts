import "server-only";
import OpenAI from "openai";
import stylist from "@/tavus/stylist-pal.json";
import type { CallProvider } from "../types";
import { ALLOWED_CLIENT_EVENTS, ALLOWED_SERVER_EVENTS, liveSessionId, PENDING_PREFIX, VOICE_PREFIX } from "./shared";

// The GPT-Live voice-only stylist, server side (6c; R9, tech spec 4.2). A WebRTC call needs the
// browser's offer first, so start() only reserves a pending call; the browser then sends its offer to
// POST /api/sessions/:id/voice, which creates the call here and returns only the answer, never the key.
// The voice is quartz, picked in Phase 0 as the closest to the video stylist.

export const VOICE = "quartz";
export const VOICE_MODEL = "gpt-live-1";

/** The stylist's standing instructions, as Tavus has them, for voice. */
export const VOICE_INSTRUCTIONS = `${stylist.system_prompt} You are now in voice only, with no video, and you are the same stylist the shopper may have been talking to by video. Never offer to look things up, delegate tasks or call tools. When you're told to say an exact line, say it word for word and nothing else.`;

/** Removes the OpenAI key from any text before it's logged. */
function scrub(text: string) {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? text.split(key).join("[hidden]") : text;
}

/** The key, without stray spaces or line breaks a copy and paste can bring into a setting. */
const apiKey = () => process.env.OPENAI_API_KEY?.trim();
const client = () => new OpenAI({ apiKey: apiKey(), maxRetries: 0, timeout: 20_000 });

/**
 * Creates the GPT-Live call for the browser's offer. `context` is what the stylist knows so far, read
 * by the server from the session's notes. Returns OpenAI's session id and the SDP answer.
 */
export async function createVoiceCall(offer: string, context: string | null): Promise<{ ok: true; sessionId: string; sdp: string } | { ok: false; status: number }> {
  try {
    const result = await client().live.create({
      session: {
        model: VOICE_MODEL,
        instructions: VOICE_INSTRUCTIONS,
        audio: { output: { voice: VOICE } },
        delegation: { type: "client" },
        client: { data_channel: { allowed_client_events: ALLOWED_CLIENT_EVENTS, allowed_server_events: ALLOWED_SERVER_EVENTS } },
        ...(context ? { input: [{ role: "developer", content: [{ type: "input_text", text: context }] }] } : {}),
      } as Parameters<ReturnType<typeof client>["live"]["create"]>[0]["session"],
      transport: { type: "webrtc", sdp: offer },
    });
    return { ok: true, sessionId: String(result.session.id), sdp: String(result.transport.sdp) };
  } catch (e) {
    if (e instanceof OpenAI.APIError) {
      console.error(`gpt-live: starting a call failed (${e.status}): ${scrub(String(e.message)).slice(0, 300)}`);
      return { ok: false, status: e.status ?? 502 };
    }
    throw e;
  }
}

/**
 * Closes a voice call from the server, through OpenAI's trusted sideband connection: open it, send
 * session.close, and let go. A call usually closes itself when the browser leaves; this is for End from
 * another tab, a call left behind, and delete-all.
 */
async function closeVoiceCall(sessionId: string) {
  const url = `wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`;
  await new Promise<void>((resolve, reject) => {
    // Node's WebSocket (undici) takes headers as an extension of the standard options.
    const Socket = WebSocket as unknown as new (url: string, init: { headers: Record<string, string> }) => WebSocket;
    const ws = new Socket(url, { headers: { Authorization: `Bearer ${apiKey()}` } });
    const timer = setTimeout(() => {
      ws.close();
      resolve();
    }, 5000);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "session.close" })));
    ws.addEventListener("message", (m) => {
      const event = (() => {
        try {
          return JSON.parse(String(m.data)) as { type?: string; error?: { code?: string } };
        } catch {
          return null;
        }
      })();
      if (event?.type === "session.closed") {
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("gpt-live: closing a call failed"));
    });
  });
}

export function createGptLiveProvider(): CallProvider {
  return {
    engine: "voice",
    async start({ sessionId }) {
      return { ok: true, callId: `${PENDING_PREFIX}${crypto.randomUUID()}`, joinUrl: `/api/sessions/${sessionId}/voice` };
    },
    async end(callId) {
      const id = liveSessionId(callId);
      if (id) await closeVoiceCall(id);
    },
  };
}

export { VOICE_PREFIX };
