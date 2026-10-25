import "server-only";
import pal from "@/tavus/pal-id.json";
import type { CallProvider, CallStart } from "../types";

// The Tavus video stylist, server side: creates and ends calls with the TAVUS_API_KEY, which never
// leaves the server. The stylist's setup (PAL) lives in tavus/stylist-pal.json.
const TAVUS_API = "https://tavusapi.com/v2";

type Fetch = typeof fetch;

export function createTavusProvider(options: { apiKey?: string; palId?: string; fetch?: Fetch } = {}): CallProvider {
  const key = options.apiKey ?? process.env.TAVUS_API_KEY;
  const palId = options.palId ?? pal.pal_id;
  const send = options.fetch ?? fetch;

  async function tavus(method: string, path: string, body?: unknown) {
    if (!key) throw new Error("TAVUS_API_KEY is not set");
    const res = await send(`${TAVUS_API}${path}`, {
      method,
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  }

  return {
    engine: "video",

    async start({ sessionId, maxSeconds }): Promise<CallStart> {
      const res = await tavus("POST", "/conversations", {
        pal_id: palId,
        conversation_name: `Session ${sessionId}`,
        properties: {
          max_call_duration: Math.max(1, Math.floor(maxSeconds)),
          participant_left_timeout: 30,
          participant_absent_timeout: 60,
          enable_recording: false,
        },
      });
      if (!res.ok) {
        // Measured in Phase 0: a second call is refused at once with this message.
        const busy = res.status === 400 && /concurrent conversations/i.test(res.text);
        console.error(`tavus: starting a call failed (${res.status})`);
        return { ok: false, reason: busy ? "busy" : "unavailable" };
      }
      const data = JSON.parse(res.text) as { conversation_id?: unknown; conversation_url?: unknown };
      if (typeof data.conversation_id !== "string" || typeof data.conversation_url !== "string") {
        return { ok: false, reason: "unavailable" };
      }
      return { ok: true, callId: data.conversation_id, joinUrl: data.conversation_url };
    },

    // A failure throws, so the caller can remember the call and try again later (review batch 1).
    async end(callId) {
      const id = encodeURIComponent(callId);
      const ended = await tavus("POST", `/conversations/${id}/end`);
      const deleted = await tavus("DELETE", `/conversations/${id}?hard=true`);
      if (!ended.ok && ended.status !== 404) throw new Error(`tavus: ending a call failed (${ended.status})`);
      if (!deleted.ok && deleted.status !== 404) throw new Error(`tavus: deleting a call failed (${deleted.status})`);
    },
  };
}
