// The weekly cost report (7c monitoring, Sabine's answer to Q2): this month's video minutes and AI spend
// against each stop, and the last 7 days, as Markdown for a GitHub issue. Totals only: no guest, session
// or personal detail. Run with node scripts/cost-report.mjs (needs SUPABASE_SECRET_KEY).
// The month's totals come from budget_status, the same question the app's stops ask, so the two agree:
// video from the cycle day, the test suites' fake calls left out (Phase 7 review). The stops are the
// app's defaults in lib/budget-guard.ts (DEFAULTS); a BUDGET_* setting here overrides one.
import { createClient } from "@supabase/supabase-js";
import { requiredSetting, setting } from "./settings.mjs";

const url = setting("NEXT_PUBLIC_SUPABASE_URL") ?? "https://bdbfmhamhhxcxxmfgqok.supabase.co";
const db = createClient(url, requiredSetting("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
const num = (name, fallback) => (Number.isFinite(Number(setting(name))) && setting(name) ? Number(setting(name)) : fallback);
const stops = {
  videoMinutes: num("BUDGET_MONTHLY_VIDEO_MINUTES", 165),
  claudeUsd: num("BUDGET_MONTHLY_CLAUDE_USD", 40),
  openaiUsd: num("BUDGET_MONTHLY_OPENAI_USD", 4),
  cycleDay: num("BUDGET_VIDEO_CYCLE_DAY", 21),
};

const now = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const weekStart = new Date(now.getTime() - 7 * 86_400_000);

const NO_GUEST = "00000000-0000-0000-0000-000000000000";
const [month, cycle, week] = await Promise.all([
  db.rpc("budget_status", { guest: NO_GUEST, video_cycle_day: stops.cycleDay }),
  db.rpc("video_cycle_start", { today: iso(now), cycle_day: stops.cycleDay }),
  db.from("usage").select("user_id, day, video_seconds, voice_seconds, claude_microdollars, openai_microdollars").gte("day", iso(weekStart)),
]);
for (const { error } of [month, cycle, week]) if (error) throw new Error(`reading usage failed: ${error.message}`);
const cycleStart = new Date(`${cycle.data}T00:00:00Z`);
const inWeek = week.data ?? [];
const sum = (list, key) => list.reduce((s, r) => s + Number(r[key] ?? 0), 0);

const videoMin = Number(month.data.month_video_seconds) / 60;
const claude = Number(month.data.month_claude_microdollars) / 1e6;
const openai = Number(month.data.month_openai_microdollars) / 1e6;
const pct = (used, stop) => (stop > 0 ? `${Math.round((used / stop) * 100)}%` : "no stop");
const byDay = new Map();
for (const r of inWeek) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.video_seconds) + Number(r.voice_seconds));
const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

console.log(`## This month, so far

| | Used | The app's stop | Used of the stop |
|---|---|---|---|
| Video minutes (since ${iso(cycleStart)}, when Tavus's plan renewed) | ${videoMin.toFixed(1)} | ${stops.videoMinutes} | ${pct(videoMin, stops.videoMinutes)} |
| Claude | $${claude.toFixed(2)} | $${stops.claudeUsd} | ${pct(claude, stops.claudeUsd)} |
| OpenAI voice | $${openai.toFixed(2)} | $${stops.openaiUsd} | ${pct(openai, stops.openaiUsd)} |

## The last 7 days

- Visitors who talked to the stylist: ${new Set(inWeek.filter((r) => Number(r.video_seconds) + Number(r.voice_seconds) > 0).map((r) => r.user_id)).size}
- Conversation minutes: ${((sum(inWeek, "video_seconds") + sum(inWeek, "voice_seconds")) / 60).toFixed(1)} (${(sum(inWeek, "voice_seconds") / 60).toFixed(1)} of them voice only)
- AI spend: $${((sum(inWeek, "claude_microdollars") + sum(inWeek, "openai_microdollars")) / 1e6).toFixed(2)}
- Busiest day: ${busiest ? `${busiest[0]}, ${(busiest[1] / 60).toFixed(1)} minutes of conversation` : "no conversations"}

Compare with the provider dashboards (Tavus billing, the Anthropic and OpenAI consoles) once a month; the app's counts can differ from theirs by test calls. The month's video minutes leave the test suites' fake calls out, as the app's stop does; the last 7 days include them. Sent by the weekly-cost workflow (7c).`);
