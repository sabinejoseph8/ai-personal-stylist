import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isVoiceCall, VOICE_USD_PER_SECOND } from "@/connectors/conversation/gpt-live/shared";
import type { CallProvider, Engine } from "@/connectors/conversation/types";
import type { BudgetGuard, Refusal } from "@/lib/budget-guard";
import { deleteEndedSessionPhotos, deleteSessionPhotos } from "@/lib/photos-service";

// Styling sessions (R12): Start conversation opens one (or picks up the guest's open one), End
// closes it, and 30 minutes without activity ends it. Sessions are the app's own record, so this
// runs with the server key (decision A) and checks every session belongs to the guest. When a session
// ends, its session-only data is deleted (R63, 2e), photos included (3a).

export const IDLE_MINUTES = 30;

export type Session = {
  id: string;
  user_id: string;
  status: "active" | "paused" | "ended";
  engine: Engine;
  last_activity_at: string;
  call_id: string | null;
  call_started_at: string | null;
  reserved_seconds: number | null;
  reserved_day: string | null;
};

const COLUMNS = "id, user_id, status, engine, last_activity_at, call_id, call_started_at, reserved_seconds, reserved_day";

export type SessionDeps = {
  /** Supabase with the server key. */
  db: SupabaseClient;
  /** The video stylist (Tavus). */
  provider: CallProvider;
  /** The voice-only stylist (GPT-Live, 6c). */
  voice?: CallProvider;
  guard: BudgetGuard;
};

/** The provider a call belongs to: voice calls carry their own prefix (6c). */
const providerFor = (deps: SessionDeps, callId: string) => (isVoiceCall(callId) && deps.voice ? deps.voice : deps.provider);

export type StartRefusal = Refusal | "video_busy" | "video_unavailable" | "voice_unavailable";
export type StartResult =
  | {
      ok: true;
      sessionId: string;
      resumed: boolean;
      /** Video, or voice only (6c). */
      engine: Engine;
      /** Why voice when video was asked for (6c, R9): busy with another visitor, unavailable, or resting for the month. */
      because?: VoiceBecause;
      call: { callId: string; joinUrl: string };
      /** The call's longest length, and which limit ends it (R13). */
      seconds: number;
      endsBecause: "day" | "month";
    }
  | { ok: false; reason: StartRefusal };

export type VoiceBecause = "busy" | "unavailable" | "resting";

/** Video refusals that voice only stands in for (R9). The day's time is shared, so it never does. */
const FALLBACK: Partial<Record<StartRefusal, VoiceBecause>> = { video_busy: "busy", video_unavailable: "unavailable", monthly_video_used: "resting" };

export const isIdle = (lastActivityAt: string, now = Date.now()) => now - Date.parse(lastActivityAt) > IDLE_MINUTES * 60_000;

/** Tavus ends a call 30 seconds after the shopper leaves it (participant_left_timeout, tavus/server.ts). */
const LEFT_TIMEOUT_MS = 30_000;

/**
 * When a call left behind stopped being used: the shopper's last activity, plus the 30 seconds Tavus
 * waits before ending it (Sabine's answer to B in the Phase 2 review). It can undercount a call left
 * running with nobody there, which she accepted.
 */
const lastUse = (s: Session) => Math.min(Date.now(), Date.parse(s.last_activity_at) + LEFT_TIMEOUT_MS);

/**
 * Ends the session's call, if it has one, and gives back the reserved time it didn't use. The Tavus
 * conversation is hard-deleted as it ends (connectors/conversation/tavus/server.ts), and an ended
 * session's notes are deleted (R63). The call is claimed first, so when two ends arrive together (End
 * and the tab closing) only one ends it and gives back its time (Phase 2 review).
 */
async function finishCall(deps: SessionDeps, s: Session, status: "paused" | "ended", usedUntil = Date.now()) {
  const now = new Date().toISOString();
  let claim = deps.db
    .from("sessions")
    .update({
      status,
      ended_at: status === "ended" ? now : null,
      last_activity_at: now,
      call_id: null,
      call_started_at: null,
      reserved_seconds: null,
      reserved_day: null,
    })
    .eq("id", s.id);
  claim = s.call_id ? claim.eq("call_id", s.call_id) : claim.is("call_id", null);
  const { data: claimed } = await claim.select("id").throwOnError();

  if (claimed?.length && s.call_id) {
    // The unused time goes back first, before the provider is asked to end the call: a start arriving
    // meanwhile (Voice only switching from video, 6c) was refused as "today's 10 minutes used" while
    // Tavus took a second to end the call (found on Sabine's iPhone, 27 Oct 2026).
    if (s.reserved_seconds !== null && s.reserved_day) {
      const ran = s.call_started_at ? (usedUntil - Date.parse(s.call_started_at)) / 1000 : 0;
      const used = Math.min(s.reserved_seconds, Math.max(0, ran));
      await deps.guard.settleTime(s.user_id, { engine: s.engine, seconds: s.reserved_seconds, day: s.reserved_day }, used);
      // Voice only is paid by the second from the OpenAI account, against the app's OpenAI stop (6c).
      if (s.engine === "voice" && used > 0) await deps.guard.recordAi(s.user_id, "openai", used * VOICE_USD_PER_SECOND);
    }
    // Ending or hard-deleting at Tavus can fail; the id is kept so the daily job tries again (review batch 1).
    await endAtProvider(deps, s.id, s.call_id);
  } else if (!claimed?.length && status === "ended") {
    // Another request finished the call first: End still ends the session.
    await deps.db.from("sessions").update({ status: "ended", ended_at: now }).eq("id", s.id).throwOnError();
  }
  if (status === "ended") {
    // A photo that fails to delete here goes on the guest's next start or in the daily job (3a).
    await deleteSessionPhotos(deps.db, s.id).catch((e) => console.error(`deleting a session's photos failed: ${e instanceof Error ? e.message : e}`));
    await deps.db.rpc("delete_session_data", { session: s.id }).throwOnError();
  }
}

/** Ends and hard-deletes a call at the provider; a failure is remembered on the session for retryStaleCalls. */
async function endAtProvider(deps: SessionDeps, sessionId: string, callId: string) {
  try {
    await providerFor(deps, callId).end(callId);
    return true;
  } catch (e) {
    console.error(`ending a call failed: ${e instanceof Error ? e.message : e}`);
    // Remembered beside any earlier one, and a failed write mustn't stop the end: the time is still given back (5d review).
    try {
      const { data } = await deps.db.from("sessions").select("stale_call_id").eq("id", sessionId).maybeSingle().throwOnError();
      const ids = new Set([...staleIds(data?.stale_call_id as string | null), callId]);
      await deps.db.from("sessions").update({ stale_call_id: [...ids].join(",") }).eq("id", sessionId).throwOnError();
    } catch (inner) {
      console.error(`remembering a call to end failed: ${inner instanceof Error ? inner.message : inner}`);
    }
    return false;
  }
}

/** The calls a session still has to end at Tavus, as remembered: one or more ids, comma-separated. */
const staleIds = (stored: string | null | undefined) => (stored ?? "").split(",").filter(Boolean);

/**
 * Calls whose end or hard-delete at Tavus failed (stale_call_id): tried again, in the daily job, so a
 * conversation never stays at Tavus for want of a retry (the 18 Oct 2026 hard-delete decision).
 * Returns how many it ended.
 */
export async function retryStaleCalls(deps: SessionDeps, limit = 50) {
  const { data } = await deps.db.from("sessions").select("id, stale_call_id").not("stale_call_id", "is", null).limit(limit).throwOnError();
  let ended = 0;
  for (const s of data ?? []) {
    const left: string[] = [];
    for (const id of staleIds(s.stale_call_id as string)) {
      try {
        await providerFor(deps, id).end(id);
        ended++;
      } catch (e) {
        console.error(`retrying a call's end failed: ${e instanceof Error ? e.message : e}`);
        left.push(id);
      }
    }
    try {
      await deps.db.from("sessions").update({ stale_call_id: left.length ? left.join(",") : null }).eq("id", s.id).eq("stale_call_id", s.stale_call_id).throwOnError();
    } catch (e) {
      console.error(`forgetting ended calls failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return ended;
}

/**
 * Calls left behind: sessions the database timer ended after 30 idle minutes while they still had a
 * call (the browser closed without saying goodbye). Their call is ended and deleted at Tavus, and the
 * minutes after the shopper's last activity given back. Runs for the guest on Start conversation, and
 * for everyone in the daily job, where one failure doesn't stop the rest. Returns how many it ended.
 */
export async function endLeftBehindCalls(deps: SessionDeps, guestId?: string, limit = 50) {
  let query = deps.db.from("sessions").select(COLUMNS).eq("status", "ended").not("call_id", "is", null).limit(limit);
  if (guestId) query = query.eq("user_id", guestId);
  const { data } = await query.returns<Session[]>().throwOnError();
  let ended = 0;
  for (const s of data ?? []) {
    try {
      await finishCall(deps, s, "ended", lastUse(s));
      ended++;
    } catch (e) {
      console.error(`ending a left-behind call failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return ended;
}

/** The guest's open session, or null. A session left 30 minutes without activity is ended first (R12). */
export async function openSession(deps: SessionDeps, guestId: string): Promise<Session | null> {
  const { data } = await deps.db
    .from("sessions")
    .select(COLUMNS)
    .eq("user_id", guestId)
    .in("status", ["active", "paused"])
    .maybeSingle<Session>()
    .throwOnError();
  if (!data) return null;
  if (isIdle(data.last_activity_at)) {
    await finishCall(deps, data, "ended", lastUse(data));
    return null;
  }
  return data;
}

/**
 * Start conversation: picks up the open session or opens one, reserves time, and starts a call: video,
 * or voice only when asked (Voice only, 6c). A voice call is pending until the browser sends its offer.
 * When video can't start (another visitor, unavailable, or the month's video used up), voice only
 * starts instead, saying why (R9, 6c); if voice can't either, the video refusal stands.
 */
export async function startConversation(deps: SessionDeps, guestId: string, engine: Engine = "video"): Promise<StartResult> {
  const first = await startCall(deps, guestId, engine);
  if (first.ok || engine !== "video" || !deps.voice) return first;
  const because = FALLBACK[first.reason];
  if (!because) return first;
  const voice = await startCall(deps, guestId, "voice");
  return voice.ok ? { ...voice, because } : first;
}

async function startCall(deps: SessionDeps, guestId: string, engine: Engine): Promise<StartResult> {
  const provider = engine === "voice" ? deps.voice : deps.provider;
  if (!provider) return { ok: false, reason: "voice_unavailable" };
  await endLeftBehindCalls(deps, guestId);
  // Photos of a session that ended from being idle (Sabine's answer to Q4 in 3a).
  await deleteEndedSessionPhotos(deps.db, guestId).catch((e) => console.error(`deleting old photos failed: ${e instanceof Error ? e.message : e}`));
  let session = await openSession(deps, guestId);
  const resumed = session !== null;
  if (!session) {
    const created = await deps.db.from("sessions").insert({ user_id: guestId, status: "paused", engine: "video" }).select(COLUMNS).single<Session>();
    // Another tab may have opened one at the same moment: there's only ever one open session per guest.
    session = created.data ?? (await openSession(deps, guestId));
    if (!session) throw new Error(`opening a session failed: ${created.error?.message}`);
  }
  // One call at a time: a call still running in another tab ends first. It counts until the shopper's
  // last activity plus Tavus's 30 seconds, as a left-behind call does: a phone that dropped the call
  // and resumed later was charged for the whole time away (review batch 1, A2).
  if (session.call_id) await finishCall(deps, session, "paused", lastUse(session));

  const reserved = await deps.guard.reserveTime(guestId, provider.engine);
  if (!reserved.ok) return { ok: false, reason: reserved.reason };
  const giveBack = async () => {
    await deps.guard.settleTime(guestId, reserved.reservation, 0);
    if (!resumed) await deps.db.from("sessions").delete().eq("id", session.id).throwOnError();
  };
  // A start that throws (Tavus unreachable, a reply that isn't JSON) gives the time back too: left
  // reserved, it cost the shopper their day and the month 10 minutes with no call made (review batch 1, A1).
  let call: Awaited<ReturnType<CallProvider["start"]>>;
  try {
    call = await provider.start({ sessionId: session.id, maxSeconds: reserved.reservation.seconds });
  } catch (e) {
    console.error(`starting a call failed: ${e instanceof Error ? e.message : e}`);
    call = { ok: false, reason: "unavailable" };
  }
  if (!call.ok) {
    await giveBack();
    if (provider.engine === "voice") return { ok: false, reason: "voice_unavailable" };
    if (call.reason === "out_of_minutes") return { ok: false, reason: "monthly_video_used" };
    return { ok: false, reason: call.reason === "busy" ? "video_busy" : "video_unavailable" };
  }

  const now = new Date().toISOString();
  try {
    await deps.db
      .from("sessions")
      .update({
        status: "active",
        engine: provider.engine,
        call_id: call.callId,
        call_started_at: now,
        reserved_seconds: reserved.reservation.seconds,
        reserved_day: reserved.reservation.day,
        last_activity_at: now,
      })
      .eq("id", session.id)
      .throwOnError();
  } catch (e) {
    // The call exists but nothing records it: end it, and give the time back. Unless the update did land and
    // only its answer was lost: then the next end gives the time back, once (5d review).
    const { data: landed } = await deps.db.from("sessions").select("call_id").eq("id", session.id).maybeSingle();
    if (landed?.call_id === call.callId) throw e;
    const ended = await endAtProvider(deps, session.id, call.callId).catch(() => false);
    await deps.guard.settleTime(guestId, reserved.reservation, 0).catch((inner) => console.error(`giving back a failed start's time failed: ${inner instanceof Error ? inner.message : inner}`));
    // A new session goes, unless it remembers a call the daily job still has to end.
    if (!resumed && ended) await deps.db.from("sessions").delete().eq("id", session.id).then(() => undefined, (inner) => console.error(`removing a failed start's session failed: ${inner instanceof Error ? inner.message : inner}`));
    throw e;
  }
  return {
    ok: true,
    sessionId: session.id,
    resumed,
    engine: provider.engine,
    call: { callId: call.callId, joinUrl: call.joinUrl },
    seconds: reserved.reservation.seconds,
    endsBecause: reserved.endsBecause,
  };
}

/**
 * End (R12), or a call that stopped by itself (keep: true, so the session can be resumed). A stopped
 * call names itself (callId): one that stopped before a reconnect can arrive late, after the new call
 * is recorded, and must not end that one (review batch 1, A3). End by the button ends whatever runs.
 * Returns null when the session isn't the guest's.
 */
export async function endConversation(deps: SessionDeps, guestId: string, sessionId: string, keep = false, callId?: string) {
  const { data } = await deps.db
    .from("sessions")
    .select(COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", guestId)
    .maybeSingle<Session>()
    .throwOnError();
  if (!data) return null;
  if (data.status === "ended") return { status: "ended" as const };
  if (keep && callId && data.call_id !== callId) return { status: data.status === "paused" ? ("paused" as const) : ("active" as const) };
  const status = keep ? "paused" : "ended";
  await finishCall(deps, data, status);
  return { status };
}
