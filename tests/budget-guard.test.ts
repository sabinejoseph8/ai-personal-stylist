import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type BudgetLimits, createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// Phase 1 automated test: the budget guard blocks a paid call once the daily or monthly limit is reached (risk 4).

describe("budget limits", () => {
  it("uses Sabine's defaults: 10 minutes a day, $1 of AI a day, 110 video minutes, $12 Claude and $4 OpenAI a month", () => {
    expect(readBudgetLimits({})).toEqual({
      dailyConversationSeconds: 600,
      dailyAiUsd: 1,
      monthlyVideoSeconds: 6600,
      monthlyClaudeUsd: 12,
      monthlyOpenaiUsd: 4,
    });
  });

  it("can be changed with settings, ignoring values that aren't numbers", () => {
    const limits = readBudgetLimits({ BUDGET_DAILY_CONVERSATION_MINUTES: "5", BUDGET_MONTHLY_CLAUDE_USD: "lots", BUDGET_DAILY_AI_USD: "-1" });
    expect(limits.dailyConversationSeconds).toBe(300);
    expect(limits.monthlyClaudeUsd).toBe(12);
    expect(limits.dailyAiUsd).toBe(1);
  });
});

describe.skipIf(!canRunDatabaseTests)("budget guard", () => {
  const db = serverDb();
  let guest: TestGuest;
  const limits = (change: Partial<BudgetLimits>) => ({ ...readBudgetLimits({}), ...change });
  const month = async () => (await db.rpc("budget_status", { guest: guest.id }).throwOnError()).data as Record<string, number>;
  const today = async () => {
    const { data } = await db.from("usage").select("*").eq("user_id", guest.id).maybeSingle().throwOnError();
    return data;
  };

  beforeAll(async () => {
    guest = await createTestGuest();
  }, 30_000);
  beforeEach(async () => {
    await db.from("usage").delete().eq("user_id", guest.id).throwOnError();
  });
  afterAll(async () => {
    await guest?.remove();
  });

  it("reserves conversation time and refuses once the day's time is used (R13)", async () => {
    const guard = createBudgetGuard(db, limits({ dailyConversationSeconds: 90 }));
    const first = await guard.reserveTime(guest.id, "video", 60);
    expect(first).toMatchObject({ ok: true, reservation: { engine: "video", seconds: 60 } });
    const second = await guard.reserveTime(guest.id, "voice", 60);
    expect(second).toMatchObject({ ok: true, reservation: { engine: "voice", seconds: 30 } });
    expect(await guard.reserveTime(guest.id, "video", 60)).toEqual({ ok: false, reason: "daily_time_used" });
  });

  it("gives back reserved time a call didn't use", async () => {
    const guard = createBudgetGuard(db, limits({ dailyConversationSeconds: 90 }));
    const first = await guard.reserveTime(guest.id, "video", 90);
    if (!first.ok) throw new Error("expected a reservation");
    await guard.settleTime(guest.id, first.reservation, 20);
    expect((await today())?.video_seconds).toBe(20);
    expect(await guard.reserveTime(guest.id, "video", 90)).toMatchObject({ ok: true, reservation: { seconds: 70 } });
  });

  it("refuses video once the demo's video minutes for the month are used, but still allows voice only", async () => {
    const used = (await month()).month_video_seconds;
    const guard = createBudgetGuard(db, limits({ monthlyVideoSeconds: used + 45 }));
    expect(await guard.reserveTime(guest.id, "video", 60)).toMatchObject({ ok: true, reservation: { seconds: 45 } });
    expect(await guard.reserveTime(guest.id, "video", 60)).toEqual({ ok: false, reason: "monthly_video_used" });
    expect(await guard.reserveTime(guest.id, "voice", 60)).toMatchObject({ ok: true, reservation: { seconds: 60 } });
  });

  it("refuses AI calls once the guest's AI money for the day is used", async () => {
    const guard = createBudgetGuard(db, limits({ dailyAiUsd: 0.01 }));
    await guard.recordAi(guest.id, "claude", 0.006);
    expect(await guard.checkAi(guest.id, "claude")).toEqual({ ok: true });
    await guard.recordAi(guest.id, "openai", 0.005);
    expect(await guard.checkAi(guest.id, "claude")).toEqual({ ok: false, reason: "daily_ai_used" });
    expect((await today())?.claude_microdollars).toBe(6000);
  });

  it("refuses Claude once the month's Claude money is used, without blocking OpenAI", async () => {
    const used = (await month()).month_claude_microdollars / 1_000_000;
    const guard = createBudgetGuard(db, limits({ monthlyClaudeUsd: used + 0.002 }));
    await guard.recordAi(guest.id, "claude", 0.003);
    expect(await guard.checkAi(guest.id, "claude")).toEqual({ ok: false, reason: "monthly_claude_used" });
    expect(await guard.checkAi(guest.id, "openai")).toEqual({ ok: true });
  });

  it("refuses voice only once the month's OpenAI money is used, without blocking video", async () => {
    const used = (await month()).month_openai_microdollars / 1_000_000;
    const guard = createBudgetGuard(db, limits({ monthlyOpenaiUsd: used + 0.001 }));
    await guard.recordAi(guest.id, "openai", 0.002);
    expect(await guard.reserveTime(guest.id, "voice", 60)).toEqual({ ok: false, reason: "monthly_openai_used" });
    expect(await guard.reserveTime(guest.id, "video", 60)).toMatchObject({ ok: true });
  });

  it("can't be used or faked from a visitor's browser", async () => {
    const reserve = await guest.db.rpc("budget_reserve_time", { guest: guest.id, engine: "video", wanted: 60, daily_limit: 99999, monthly_video_limit: 99999 });
    const record = await guest.db.rpc("budget_record_ai", { guest: guest.id, provider: "claude", microdollars: 0 });
    const status = await guest.db.rpc("budget_status", { guest: guest.id });
    const tidy = await guest.db.rpc("daily_tidy");
    const expired = await guest.db.rpc("expired_guests", { idle_days: 0, test_hours: 0, max_count: 10 });
    for (const r of [reserve, record, status, tidy, expired]) expect(r.error).not.toBeNull();
    const write = await guest.db.from("usage").insert({ user_id: guest.id, video_seconds: -600 });
    expect(write.error).not.toBeNull();
  });
});
