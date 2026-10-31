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
  /** The day of the month the video minutes start again, as Tavus's plan renews (7c, Q1). */
  videoCycleDay: number;
  /** One call's longest length: Tavus's Builder plan ends a call at 15 minutes; a day set longer than that takes two calls (7c). */
  maxCallSeconds: number;
};

/**
 * Sabine's limits (1f, 20 Oct 2026; the daily AI allowance raised on 25 Oct 2026; the final launch limits
 * on 28 Oct 2026, 7c Q1). Each can be changed with a setting in Vercel; a missing setting means these.
 */
const DEFAULTS = {
  BUDGET_DAILY_CONVERSATION_MINUTES: 15, // R13; 10 until 28 Oct 2026, when Sabine set it to 15, one Tavus call's longest length (7c)
  BUDGET_DAILY_AI_USD: 3, // a 10-minute session with styling changes uses about $1 of Opus judgments (measured 25 Oct 2026; $1 until then, when a demo used about $0.35)
  BUDGET_MONTHLY_VIDEO_MINUTES: 165, // Sabine's Tavus plan has 175 a month since 21 Oct 2026; 10 are kept for testing
  BUDGET_MONTHLY_CLAUDE_USD: 40, // raised from $12 on 22 Oct 2026; the Anthropic console limit is set above it
  BUDGET_MONTHLY_OPENAI_USD: 4, // the OpenAI console limit is $5
  BUDGET_VIDEO_CYCLE_DAY: 21, // Tavus's plan renews on the 21st (the upgrade of 21 Oct 2026); 1 means calendar months
  BUDGET_MAX_CALL_MINUTES: 15, // Tavus Builder's longest call
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
    videoCycleDay: Math.min(28, Math.max(1, Math.round(value("BUDGET_VIDEO_CYCLE_DAY")))),
    maxCallSeconds: Math.max(60, Math.round(value("BUDGET_MAX_CALL_MINUTES") * 60)),
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
    const s = await call<Record<string, number>>("budget_status", { guest: guestId, video_cycle_day: limits.videoCycleDay });
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
     * Before a call: reserves up to `wantedSeconds` of conversation, in one step: the rest of the day,
     * up to one call's longest length. A video call is then created with the seconds granted as its
     * longest length, so Tavus ends it on time. Voice only also needs OpenAI money left this month.
     */
    async reserveTime(
      guestId: string,
      engine: Engine,
      wantedSeconds = Math.min(limits.dailyConversationSeconds, limits.maxCallSeconds),
    ): Promise<Answer<{ reservation: Reservation; endsBecause: EndsBecause; /** Today's time left when the call starts, this call included (Phase 7 review). */ leftToday: number }>> {
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
        video_cycle_day: limits.videoCycleDay,
      });
      if (r.granted > 0) return { ok: true, reservation: { engine, seconds: r.granted, day: r.day }, endsBecause: endsBecause(r.granted, wantedSeconds, r.left_today), leftToday: r.left_today };
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

/** The month's totals for the whole demo, as budget_status counts them. */
export type MonthTotals = { month_video_seconds: number; month_claude_microdollars: number; month_openai_microdollars: number };

/**
 * The demo is resting (R13, TQ4; Sabine's answer to Q2 in 6c) when the month's Claude stop is reached, since
 * nothing works without it, or when both the video and the OpenAI stops are, since there's no way to talk.
 * With only the video minutes used up, voice only carries on.
 */
export function isResting(m: MonthTotals, limits: BudgetLimits) {
  const claude = m.month_claude_microdollars >= limits.monthlyClaudeUsd * MICRO;
  const video = m.month_video_seconds >= limits.monthlyVideoSeconds;
  const openai = m.month_openai_microdollars >= limits.monthlyOpenaiUsd * MICRO;
  return claude || (video && openai);
}

/**
 * When a resting demo is back, in words ("1 December"): the 1st when the month's Claude is used up; the
 * earlier of the video cycle day and the 1st when video and OpenAI are, since either brings the stylist
 * back (Phase 7 review: the welcome screen said the 1st when video was back on the 21st).
 */
export function restingBackOn(m: MonthTotals, limits: BudgetLimits, now = new Date()) {
  if (m.month_claude_microdollars >= limits.monthlyClaudeUsd * MICRO) return inWords(nextMonthFirstDate(now));
  const video = nextVideoCycleDate(now, limits.videoCycleDay);
  const first = nextMonthFirstDate(now);
  return inWords(video < first ? video : first);
}

/** Whether the demo is resting this month, from the usage table (no guest needed): when it's back, or null. */
export async function demoResting(db: SupabaseClient, limits: BudgetLimits = readBudgetLimits()): Promise<string | null> {
  const { data, error } = await db.rpc("budget_status", { guest: "00000000-0000-0000-0000-000000000000", video_cycle_day: limits.videoCycleDay });
  if (error) throw new Error(`budget guard: budget_status failed: ${error.message}`);
  const totals = data as MonthTotals;
  return isResting(totals, limits) ? restingBackOn(totals, limits) : null;
}

/**
 * The resting answer, remembered for a minute on this server (6d review; Sabine's answer to Q2): the
 * welcome screen asks on every visit, and the answer changes a few times a month at most. A failed
 * answer isn't kept, so the next visit asks again.
 */
export const RESTING_REMEMBERED_MS = 60_000;
let remembered: { at: number; value: Promise<string | null> } | null = null;
export function demoRestingRemembered(db: SupabaseClient, now = Date.now(), limits?: BudgetLimits) {
  if (!remembered || now - remembered.at >= RESTING_REMEMBERED_MS) {
    const value = demoResting(db, limits);
    const mine = { at: now, value };
    remembered = mine;
    void value.catch(() => {
      if (remembered === mine) remembered = null;
    });
  }
  return remembered.value;
}

const inWords = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** When the month's video minutes start again: the next cycle day (7c), in UTC. */
export function nextVideoCycleDate(now = new Date(), cycleDay = readBudgetLimits().videoCycleDay) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return now.getUTCDate() >= cycleDay ? new Date(Date.UTC(y, m + 1, cycleDay)) : new Date(Date.UTC(y, m, cycleDay));
}

/** "21 November": when the month's video minutes start again, in words. */
export function nextVideoCycle(now = new Date(), cycleDay = readBudgetLimits().videoCycleDay) {
  return inWords(nextVideoCycleDate(now, cycleDay));
}

/** The 1st of next month, in UTC as the budget counts Claude and OpenAI months. */
export function nextMonthFirstDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** "1 November": the 1st of next month, in words. */
export function nextMonthFirst(now = new Date()) {
  return inWords(nextMonthFirstDate(now));
}

/**
 * Which limit ends a call (R13): today's time; the month's video minutes when they run out first; or the
 * call's own length, with time left today, so a new call carries on the conversation (7c).
 */
export type EndsBecause = "day" | "month" | "call";
export function endsBecause(granted: number, wanted: number, leftToday: number): EndsBecause {
  if (granted < Math.min(wanted, leftToday)) return "month";
  return wanted < leftToday ? "call" : "day";
}

/** "You've used today's 15 minutes…": the day's limit in words, from the setting. */
export function dailyTimeUsedLine(limits: BudgetLimits = readBudgetLimits()) {
  return `You've used today's ${Math.round(limits.dailyConversationSeconds / 60)} minutes with your stylist. Come back tomorrow to talk again.`;
}
