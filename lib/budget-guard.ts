import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The budget guard (tech spec 5, pattern 10; risk 4): every paid call to Tavus, OpenAI or Claude
// asks it first, and records what it used afterwards. Days and months are counted in UTC.
// It needs the server key (lib/supabase/admin.ts), so visitors can't fake or inflate usage.
// If the guard can't reach the database, it throws: no answer means no paid call.

export type BudgetLimits = {
  dailyConversationSeconds: number;
  dailyAiUsd: number;
  monthlyVideoSeconds: number;
  monthlyClaudeUsd: number;
  monthlyOpenaiUsd: number;
};

/** Sabine's limits (1f, 20 Oct 2026). Each can be changed with a setting in Vercel. */
const DEFAULTS = {
  BUDGET_DAILY_CONVERSATION_MINUTES: 10, // R13
  BUDGET_DAILY_AI_USD: 1, // a full demo uses about $0.35
  BUDGET_MONTHLY_VIDEO_MINUTES: 165, // Sabine's Tavus plan has 175 a month since 21 Oct 2026; 10 are kept for testing
  BUDGET_MONTHLY_CLAUDE_USD: 12, // the Anthropic console limit is $15
  BUDGET_MONTHLY_OPENAI_USD: 4, // the OpenAI console limit is $5
};

export function readBudgetLimits(env: Record<string, string | undefined> = process.env): BudgetLimits {
  const value = (name: keyof typeof DEFAULTS) => {
    const n = Number(env[name]);
    return env[name] !== undefined && env[name] !== "" && Number.isFinite(n) && n >= 0 ? n : DEFAULTS[name];
  };
  return {
    dailyConversationSeconds: Math.round(value("BUDGET_DAILY_CONVERSATION_MINUTES") * 60),
    dailyAiUsd: value("BUDGET_DAILY_AI_USD"),
    monthlyVideoSeconds: Math.round(value("BUDGET_MONTHLY_VIDEO_MINUTES") * 60),
    monthlyClaudeUsd: value("BUDGET_MONTHLY_CLAUDE_USD"),
    monthlyOpenaiUsd: value("BUDGET_MONTHLY_OPENAI_USD"),
  };
}

export type Engine = "video" | "voice";
export type Provider = "claude" | "openai";
export type Refusal = "daily_time_used" | "daily_ai_used" | "monthly_video_used" | "monthly_claude_used" | "monthly_openai_used";
export type Reservation = { engine: Engine; seconds: number; day: string };
type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason: Refusal };

const MICRO = 1_000_000;

export function createBudgetGuard(db: SupabaseClient, limits: BudgetLimits = readBudgetLimits()) {
  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`budget guard: ${fn} failed: ${error.message}`);
    return data as T;
  }

  /** Before an AI call: is there money left for this guest today, and for this provider this month? */
  async function checkAi(guestId: string, provider: Provider): Promise<Answer> {
    const s = await call<Record<string, number>>("budget_status", { guest: guestId });
    if (s.today_microdollars >= limits.dailyAiUsd * MICRO) return { ok: false, reason: "daily_ai_used" };
    if (provider === "claude" && s.month_claude_microdollars >= limits.monthlyClaudeUsd * MICRO) {
      return { ok: false, reason: "monthly_claude_used" };
    }
    if (provider === "openai" && s.month_openai_microdollars >= limits.monthlyOpenaiUsd * MICRO) {
      return { ok: false, reason: "monthly_openai_used" };
    }
    return { ok: true };
  }

  return {
    limits,
    checkAi,

    /** After an AI call: records its cost. */
    async recordAi(guestId: string, provider: Provider, costUsd: number) {
      if (!(costUsd >= 0)) throw new Error("budget guard: a cost can't be negative");
      await call("budget_record_ai", { guest: guestId, provider, microdollars: Math.round(costUsd * MICRO) });
    },

    /**
     * Before a call: reserves up to `wantedSeconds` of conversation, in one step. A video call is
     * then created with the seconds granted as its longest length, so Tavus ends it on time.
     * Voice only also needs OpenAI money left this month.
     */
    async reserveTime(
      guestId: string,
      engine: Engine,
      wantedSeconds = limits.dailyConversationSeconds,
    ): Promise<Answer<{ reservation: Reservation; endsBecause: "day" | "month" }>> {
      if (!Number.isInteger(wantedSeconds) || wantedSeconds < 1) throw new Error("budget guard: ask for at least 1 second");
      if (engine === "voice") {
        const money = await checkAi(guestId, "openai");
        if (!money.ok) return money;
      }
      const r = await call<{ granted: number; day: string; left_today: number }>("budget_reserve_time", {
        guest: guestId,
        engine,
        wanted: wantedSeconds,
        daily_limit: limits.dailyConversationSeconds,
        monthly_video_limit: limits.monthlyVideoSeconds,
      });
      if (r.granted > 0) return { ok: true, reservation: { engine, seconds: r.granted, day: r.day }, endsBecause: endsBecause(r.granted, wantedSeconds, r.left_today) };
      return { ok: false, reason: r.left_today <= 0 ? "daily_time_used" : "monthly_video_used" };
    },

    /** After a call ends: swaps the reserved seconds for the seconds really used. */
    async settleTime(guestId: string, reservation: Reservation, usedSeconds: number) {
      const used = Math.max(0, Math.round(usedSeconds));
      await call("budget_settle_time", {
        guest: guestId,
        engine: reservation.engine,
        reserved_day: reservation.day,
        reserved: reservation.seconds,
        used,
      });
    },
  };
}

export type BudgetGuard = ReturnType<typeof createBudgetGuard>;

/** Which limit ends a call (R13): today's time, or the month's video minutes when they run out first. */
export function endsBecause(granted: number, wanted: number, leftToday: number): "day" | "month" {
  return granted < Math.min(wanted, leftToday) ? "month" : "day";
}
