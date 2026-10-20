import { createHash, timingSafeEqual } from "node:crypto";
import pal from "@/tavus/pal-id.json";

const TAVUS_API = "https://tavusapi.com/v2";

/** True when the given passcode matches TEST_PAGE_PASSCODE. Compares hashes so timing reveals nothing. */
export function passcodeOk(given: unknown): boolean {
  const expected = process.env.TEST_PAGE_PASSCODE;
  if (!expected || typeof given !== "string") return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** A wrong passcode waits 1.5 seconds before answering, so guessing it is slow. Real rate limits come in Phase 1 (1b). */
export async function wrongPasscode() {
  await new Promise((r) => setTimeout(r, 1500));
  return Response.json({ error: "Wrong passcode" }, { status: 401 });
}

/** Removes the Tavus key from any text before it leaves the server. */
function scrub(text: string): string {
  const key = process.env.TAVUS_API_KEY;
  return key ? text.split(key).join("[hidden]") : text;
}

async function tavus(method: string, path: string, body?: unknown) {
  const key = process.env.TAVUS_API_KEY;
  if (!key) throw new Error("TAVUS_API_KEY is not set");
  const res = await fetch(`${TAVUS_API}${path}`, {
    method,
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text: scrub(text) };
}

/** Starts a Tavus call for the Phase 0 test page. Returns only what the browser needs. */
export async function startTestConversation() {
  const res = await tavus("POST", "/conversations", {
    pal_id: pal.pal_id,
    conversation_name: "Phase 0 video test",
    properties: {
      max_call_duration: 600,
      participant_left_timeout: 30,
      participant_absent_timeout: 60,
      enable_recording: false,
    },
  });
  if (!res.ok) return { ok: false as const, status: res.status, message: res.text.slice(0, 500) };
  const data = JSON.parse(res.text);
  return {
    ok: true as const,
    conversationId: String(data.conversation_id),
    conversationUrl: String(data.conversation_url),
  };
}

/** Ends a Tavus call, then hard-deletes it, so Tavus keeps no copy (decided 18 Oct 2026). */
export async function endTestConversation(conversationId: string) {
  const id = encodeURIComponent(conversationId);
  const ended = await tavus("POST", `/conversations/${id}/end`);
  const deleted = await tavus("DELETE", `/conversations/${id}?hard=true`);
  return { ok: ended.ok, status: ended.status, deleted: deleted.ok };
}
