import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeProvider } from "@/connectors/conversation/fake";
import type { CallProvider } from "@/connectors/conversation/types";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { endConversation, endLeftBehindCalls, openSession, type SessionDeps, startConversation } from "@/lib/sessions";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 2a and 2e: sessions (R12) with the fake engine, against the real database: start, resume, End, the
// 30-minute idle rule, the budget guard on every call, sessions only the server can change, and
// session-only data deleted when a session ends (R63).
describe.skipIf(!canRunDatabaseTests)("sessions", () => {
  const db = serverDb();
  let guest: TestGuest;
  const ended: string[] = [];
  const recording = (): CallProvider => {
    const fake = createFakeProvider();
    return { ...fake, end: async (id) => void ended.push(id) };
  };
  const deps = (change: Partial<SessionDeps> = {}): SessionDeps => ({
    db,
    provider: recording(),
    // The month's video total is shared with the live site and other tests, so it's kept out of reach here.
    guard: createBudgetGuard(db, { ...readBudgetLimits({}), dailyConversationSeconds: 600, monthlyVideoSeconds: 1e9 }),
    ...change,
  });
  const row = async (id: string) => (await db.from("sessions").select("*").eq("id", id).single().throwOnError()).data!;
  const usedToday = async () =>
    (await db.from("usage").select("video_seconds").eq("user_id", guest.id).maybeSingle().throwOnError()).data?.video_seconds ?? 0;

  beforeAll(async () => {
    guest = await createTestGuest();
  }, 30_000);
  beforeEach(async () => {
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    await db.from("usage").delete().eq("user_id", guest.id).throwOnError();
    ended.length = 0;
  });
  afterAll(async () => guest?.remove());

  it("Start conversation opens a session, reserves the day's time and starts a call capped at it", async () => {
    const started = await startConversation(deps(), guest.id);
    if (!started.ok) throw new Error(started.reason);
    expect(started).toMatchObject({ resumed: false, seconds: 600 });
    expect(started.call.joinUrl).toMatch(/^fake:\/\//);
    expect(await row(started.sessionId)).toMatchObject({ status: "active", engine: "video", call_id: started.call.callId, reserved_seconds: 600 });
    expect(await usedToday()).toBe(600);
  });

  it("End ends the call, closes the session and gives back the time it didn't use", async () => {
    const started = await startConversation(deps(), guest.id);
    if (!started.ok) throw new Error(started.reason);
    await db.from("sessions").update({ call_started_at: new Date(Date.now() - 90_000).toISOString() }).eq("id", started.sessionId).throwOnError();
    expect(await endConversation(deps(), guest.id, started.sessionId)).toEqual({ status: "ended" });
    expect(ended).toEqual([started.call.callId]);
    expect(await row(started.sessionId)).toMatchObject({ status: "ended", call_id: null });
    const used = await usedToday();
    expect(used).toBeGreaterThanOrEqual(90);
    expect(used).toBeLessThan(100);
  });

  const addNote = (sessionId: string) =>
    db.from("session_notes").insert({ user_id: guest.id, session_id: sessionId, note_text: "Elegant", kind: "style" }).throwOnError();
  const notesIn = async (sessionId: string) =>
    (await db.from("session_notes").select("id", { count: "exact", head: true }).eq("session_id", sessionId).throwOnError()).count;

  it("End deletes the session's notes, while a paused session keeps them to resume (R63)", async () => {
    const started = await startConversation(deps(), guest.id);
    if (!started.ok) throw new Error(started.reason);
    expect(started.endsBecause).toBe("day");
    await addNote(started.sessionId);
    await endConversation(deps(), guest.id, started.sessionId, true);
    expect(await notesIn(started.sessionId)).toBe(1);
    await endConversation(deps(), guest.id, started.sessionId);
    expect(await notesIn(started.sessionId)).toBe(0);
  });

  it("the database timer ends sessions idle for 30 minutes and deletes their notes; the call they left behind ends on the next start (R12, R63)", async () => {
    const started = await startConversation(deps(), guest.id);
    if (!started.ok) throw new Error(started.reason);
    await addNote(started.sessionId);
    await db.from("sessions").update({ last_activity_at: new Date(Date.now() - 40 * 60_000).toISOString() }).eq("id", started.sessionId).throwOnError();
    await db.rpc("close_idle_sessions").throwOnError();
    expect(await row(started.sessionId)).toMatchObject({ status: "ended", call_id: started.call.callId });
    expect(await notesIn(started.sessionId)).toBe(0);

    const next = await startConversation(deps(), guest.id);
    if (!next.ok) throw new Error(next.reason);
    expect(next.sessionId).not.toBe(started.sessionId);
    expect(ended).toEqual([started.call.callId]);
    expect(await row(started.sessionId)).toMatchObject({ status: "ended", call_id: null, reserved_seconds: null });
  });

  it("the daily job's sweep ends every call left behind, counting it until the last activity plus 30 seconds (Sabine's answer to B)", async () => {
    const started = await startConversation(deps(), guest.id);
    if (!started.ok) throw new Error(started.reason);
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    await db.from("sessions").update({ status: "ended", call_started_at: minutesAgo(20), last_activity_at: minutesAgo(18) }).eq("id", started.sessionId).throwOnError();
    expect(await endLeftBehindCalls(deps(), guest.id)).toBe(1);
    expect(ended).toEqual([started.call.callId]);
    expect(await row(started.sessionId)).toMatchObject({ call_id: null });
    const used = await usedToday(); // 2 minutes of use, plus Tavus's 30 seconds
    expect(used).toBeGreaterThanOrEqual(145);
    expect(used).toBeLessThanOrEqual(155);
    expect(await endLeftBehindCalls(deps(), guest.id)).toBe(0);
  });

  it("two ends of the same call arriving together end it and give its time back only once (Phase 2 review)", async () => {
    const started = await startConversation(deps(), guest.id);
    if (!started.ok) throw new Error(started.reason);
    await db.from("sessions").update({ call_started_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", started.sessionId).throwOnError();
    await Promise.all([endConversation(deps(), guest.id, started.sessionId), endConversation(deps(), guest.id, started.sessionId, true)]);
    expect(ended).toEqual([started.call.callId]);
    const used = await usedToday();
    expect(used).toBeGreaterThanOrEqual(60);
    expect(used).toBeLessThan(70);
  });

  it("a call that stops by itself pauses the session, and the next start resumes it", async () => {
    const first = await startConversation(deps(), guest.id);
    if (!first.ok) throw new Error(first.reason);
    expect(await endConversation(deps(), guest.id, first.sessionId, true)).toEqual({ status: "paused" });
    const second = await startConversation(deps(), guest.id);
    expect(second).toMatchObject({ ok: true, sessionId: first.sessionId, resumed: true });
  });

  it("a new start ends a call still running in another tab first", async () => {
    const first = await startConversation(deps(), guest.id);
    const second = await startConversation(deps(), guest.id);
    if (!first.ok || !second.ok) throw new Error("expected two starts");
    expect(second.sessionId).toBe(first.sessionId);
    expect(ended).toEqual([first.call.callId]);
  });

  it("a session left 30 minutes without activity ends, and the next start opens a new one (R12)", async () => {
    const first = await startConversation(deps(), guest.id);
    if (!first.ok) throw new Error(first.reason);
    await db.from("sessions").update({ last_activity_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("id", first.sessionId).throwOnError();
    expect(await openSession(deps(), guest.id)).toBeNull();
    expect(await row(first.sessionId)).toMatchObject({ status: "ended" });
    const second = await startConversation(deps(), guest.id);
    expect(second).toMatchObject({ ok: true, resumed: false });
    expect(second.ok && second.sessionId).not.toBe(first.sessionId);
  });

  it("refuses once the day's 10 minutes are used, without starting a call (R13)", async () => {
    const tight = deps({ guard: createBudgetGuard(db, { ...readBudgetLimits({}), dailyConversationSeconds: 60, monthlyVideoSeconds: 1e9 }) });
    const first = await startConversation(tight, guest.id);
    if (!first.ok) throw new Error(first.reason);
    // The first call ran its whole minute, so starting again (which ends it first) finds no time left.
    await db.from("sessions").update({ call_started_at: new Date(Date.now() - 70_000).toISOString() }).eq("id", first.sessionId).throwOnError();
    expect(await startConversation(tight, guest.id)).toEqual({ ok: false, reason: "daily_time_used" });
    expect(await usedToday()).toBe(60);
  });

  it("when the video stylist is busy, says so, gives the time back and leaves no empty session", async () => {
    const busy: CallProvider = { engine: "video", start: async () => ({ ok: false, reason: "busy" }), end: async () => {} };
    expect(await startConversation(deps({ provider: busy }), guest.id)).toEqual({ ok: false, reason: "video_busy" });
    expect(await usedToday()).toBe(0);
    const { data } = await db.from("sessions").select("id").eq("user_id", guest.id);
    expect(data).toEqual([]);
  });

  it("only the guest's own session can be ended", async () => {
    const other = await createTestGuest();
    try {
      const started = await startConversation(deps(), other.id);
      if (!started.ok) throw new Error(started.reason);
      expect(await endConversation(deps(), guest.id, started.sessionId)).toBeNull();
      expect(await row(started.sessionId)).toMatchObject({ status: "active" });
      await endConversation(deps(), other.id, started.sessionId);
    } finally {
      await other.remove();
    }
  });

  it("a guest can read their sessions but can't create, change or delete them (decision A)", async () => {
    const started = await startConversation(deps(), guest.id);
    if (!started.ok) throw new Error(started.reason);
    const read = await guest.db.from("sessions").select("id").eq("id", started.sessionId);
    expect(read.data).toHaveLength(1);
    const insert = await guest.db.from("sessions").insert({ user_id: guest.id });
    expect(insert.error).not.toBeNull();
    await guest.db.from("sessions").update({ status: "ended" }).eq("id", started.sessionId);
    await guest.db.from("sessions").delete().eq("id", started.sessionId);
    expect(await row(started.sessionId)).toMatchObject({ status: "active" });
  });
});
