import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    await deps.provider.end(s.call_id).catch((e) => console.error(`ending a call failed: ${e instanceof Error ? e.message : e}`));
    if (s.reserved_seconds !== null && s.reserved_day) {
      const ran = s.call_started_at ? (usedUntil - Date.parse(s.call_started_at)) / 1000 : 0;
      await deps.guard.settleTime(
        s.user_id,
        { engine: s.engine, seconds: s.reserved_seconds, day: s.reserved_day },
        Math.min(s.reserved_seconds, Math.max(0, ran)),
      );
    }
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

/** Start conversation: picks up the open session or opens one, reserves time, and starts a video call. */
export async function startConversation(deps: SessionDeps, guestId: string): Promise<StartResult> {
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
