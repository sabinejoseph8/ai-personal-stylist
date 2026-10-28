import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The health page's checks (7c monitoring, Sabine's answer to Q2): yes or no answers only, never a key,
// a count or a name, because anyone can open the page.

/** The daily job runs at 08:00 UTC: one more than 26 hours ago means it stopped. */
export const DAILY_JOB_MAX_AGE_MS = 26 * 60 * 60 * 1000;

export type Health = { ok: boolean; database: boolean; dailyJob: boolean; callsEnded: boolean };

export async function checkHealth(db: SupabaseClient, now = Date.now()): Promise<Health> {
  try {
    const since = new Date(now - DAILY_JOB_MAX_AGE_MS).toISOString();
    const [job, stuck] = await Promise.all([
      db.from("job_runs").select("ran_at, ok").eq("name", "daily").maybeSingle().throwOnError(),
      // A call the daily job couldn't end at Tavus or OpenAI for over a day is stuck.
      db.from("sessions").select("id", { count: "exact", head: true }).not("stale_call_id", "is", null).lt("last_activity_at", since).throwOnError(),
    ]);
    const dailyJob = Boolean(job.data?.ok && Date.parse(job.data.ran_at as string) >= now - DAILY_JOB_MAX_AGE_MS);
    const callsEnded = (stuck.count ?? 0) === 0;
    return { ok: dailyJob && callsEnded, database: true, dailyJob, callsEnded };
  } catch {
    return { ok: false, database: false, dailyJob: false, callsEnded: false };
  }
}
