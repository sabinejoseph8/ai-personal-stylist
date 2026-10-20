import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallProvider, Engine } from "@/connectors/conversation/types";
import type { BudgetGuard, Refusal } from "@/lib/budget-guard";

// Styling sessions (R12): Start conversation opens one (or picks up the guest's open one), End
// closes it, and 30 minutes without activity ends it. Sessions are the app's own record, so this
// runs with the server key (decision A) and checks every session belongs to the guest. When a session
// ends, its session-only data is deleted (R63, 2e).

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
  provider: CallProvider;
  guard: BudgetGuard;
};

export type StartRefusal = Refusal | "video_busy" | "video_unavailable";
export type StartResult =
  | {
      ok: true;
      sessionId: string;
      resumed: boolean;
      call: { callId: string; joinUrl: string };
      /** The call's longest length, and which limit ends it (R13). */
      seconds: number;
      endsBecause: "day" | "month";
    }
  | { ok: false; reason: StartRefusal };

export const isIdle = (lastActivityAt: string, now = Date.now()) => now - Date.parse(lastActivityAt) > IDLE_MINUTES * 60_000;

/**
 * Ends the session's call, if it has one, and gives back the reserved time it didn't use. The Tavus
 * conversation is hard-deleted as it ends (connectors/conversation/tavus/server.ts). An ended session's
 * notes are deleted (R63).
 */
async function finishCall(deps: SessionDeps, s: Session, status: "paused" | "ended") {
  if (s.call_id) {
    await deps.provider.end(s.call_id).catch((e) => console.error(`ending a call failed: ${e instanceof Error ? e.message : e}`));
    if (s.reserved_seconds !== null && s.reserved_day) {
      const ran = s.call_started_at ? (Date.now() - Date.parse(s.call_started_at)) / 1000 : 0;
      await deps.guard.settleTime(
        s.user_id,
        { engine: s.engine, seconds: s.reserved_seconds, day: s.reserved_day },
        Math.min(s.reserved_seconds, Math.max(0, ran)),
      );
    }
  }
  const now = new Date().toISOString();
  await deps.db
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
    .eq("id", s.id)
    .throwOnError();
  if (status === "ended") await deps.db.rpc("delete_session_data", { session: s.id }).throwOnError();
}

/**
 * Calls left behind: sessions the database timer ended after 30 idle minutes while they still had a
 * call (the browser closed without saying goodbye). Their call is ended and deleted at Tavus, and the
 * minutes it didn't use given back. Runs for the guest on Start conversation, and for everyone in the
 * daily job. Returns how many it ended.
 */
export async function endLeftBehindCalls(deps: SessionDeps, guestId?: string, limit = 50) {
  let query = deps.db.from("sessions").select(COLUMNS).eq("status", "ended").not("call_id", "is", null).limit(limit);
  if (guestId) query = query.eq("user_id", guestId);
  const { data } = await query.returns<Session[]>().throwOnError();
  for (const s of data ?? []) await finishCall(deps, s, "ended");
  return data?.length ?? 0;
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
    await finishCall(deps, data, "ended");
    return null;
  }
  return data;
}

/** Start conversation: picks up the open session or opens one, reserves time, and starts a video call. */
export async function startConversation(deps: SessionDeps, guestId: string): Promise<StartResult> {
  await endLeftBehindCalls(deps, guestId);
  let session = await openSession(deps, guestId);
  const resumed = session !== null;
  if (!session) {
    const created = await deps.db.from("sessions").insert({ user_id: guestId, status: "paused", engine: "video" }).select(COLUMNS).single<Session>();
    // Another tab may have opened one at the same moment: there's only ever one open session per guest.
    session = created.data ?? (await openSession(deps, guestId));
    if (!session) throw new Error(`opening a session failed: ${created.error?.message}`);
  }
  // One call at a time: a call still running in another tab ends first.
  if (session.call_id) await finishCall(deps, session, "paused");

  const reserved = await deps.guard.reserveTime(guestId, "video");
  if (!reserved.ok) return { ok: false, reason: reserved.reason };
  const call = await deps.provider.start({ sessionId: session.id, maxSeconds: reserved.reservation.seconds });
  if (!call.ok) {
    await deps.guard.settleTime(guestId, reserved.reservation, 0);
    if (!resumed) await deps.db.from("sessions").delete().eq("id", session.id).throwOnError();
    return { ok: false, reason: call.reason === "busy" ? "video_busy" : "video_unavailable" };
  }

  const now = new Date().toISOString();
  await deps.db
    .from("sessions")
    .update({
      status: "active",
      engine: deps.provider.engine,
      call_id: call.callId,
      call_started_at: now,
      reserved_seconds: reserved.reservation.seconds,
      reserved_day: reserved.reservation.day,
      last_activity_at: now,
    })
    .eq("id", session.id)
    .throwOnError();
  return {
    ok: true,
    sessionId: session.id,
    resumed,
    call: { callId: call.callId, joinUrl: call.joinUrl },
    seconds: reserved.reservation.seconds,
    endsBecause: reserved.endsBecause,
  };
}

/**
 * End (R12), or a call that stopped by itself (keep: true, so the session can be resumed).
 * Returns null when the session isn't the guest's.
 */
export async function endConversation(deps: SessionDeps, guestId: string, sessionId: string, keep = false) {
  const { data } = await deps.db
    .from("sessions")
    .select(COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", guestId)
    .maybeSingle<Session>()
    .throwOnError();
  if (!data) return null;
  if (data.status === "ended") return { status: "ended" as const };
  const status = keep ? "paused" : "ended";
  await finishCall(deps, data, status);
  return { status };
}
