import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPendingVoiceCall, VOICE_PREFIX } from "@/connectors/conversation/gpt-live/shared";
import { sessionContext } from "@/lib/session-context";

// Joining a voice-only call (6c, R9): the browser's WebRTC offer becomes a GPT-Live call for the session's
// pending voice call, and the session then records OpenAI's id, so End and the daily job can close it.

export type VoiceCallDeps = {
  db: SupabaseClient;
  create: (offer: string, context: string | null) => Promise<{ ok: true; sessionId: string; sdp: string } | { ok: false; status: number; code?: string; param?: string }>;
  close: (callId: string) => Promise<void>;
};

/** `status`: OpenAI's refusal code, such as 401 for a key it doesn't accept: a number, never the key. */
export type AttachResult = { ok: true; callId: string; sdp: string } | { ok: false; reason: "no_call" } | { ok: false; reason: "unavailable"; status: number; code?: string; param?: string };

/**
 * Creates the call for the guest's open session whose pending voice call is `callId`, telling the
 * stylist what's in the notes so far. A session ended or replaced meanwhile gets no call: one made in
 * the gap is closed at once.
 */
export async function attachVoiceCall(deps: VoiceCallDeps, guestId: string, sessionId: string, callId: string, offer: string): Promise<AttachResult> {
  if (!isPendingVoiceCall(callId)) return { ok: false, reason: "no_call" };
  const { data } = await deps.db.from("sessions").select("id").eq("id", sessionId).eq("user_id", guestId).eq("status", "active").eq("call_id", callId).maybeSingle().throwOnError();
  if (!data) return { ok: false, reason: "no_call" };
  const context = await sessionContext(deps.db, guestId, sessionId).catch(() => null);
  const made = await deps.create(offer, context);
  if (!made.ok) return { ok: false, reason: "unavailable", status: made.status, code: made.code, param: made.param };
  const real = `${VOICE_PREFIX}${made.sessionId}`;
  const { data: claimed } = await deps.db
    .from("sessions")
    .update({ call_id: real, last_activity_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", guestId)
    .eq("status", "active")
    .eq("call_id", callId)
    .select("id")
    .throwOnError();
  if (!claimed?.length) {
    await deps.close(real).catch((e) => console.error(`gpt-live: closing an unwanted call failed: ${e instanceof Error ? e.message : e}`));
    return { ok: false, reason: "no_call" };
  }
  return { ok: true, callId: real, sdp: made.sdp };
}
