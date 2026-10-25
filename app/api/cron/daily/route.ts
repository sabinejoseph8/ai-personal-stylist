import { timingSafeEqual } from "node:crypto";
import { deleteGuest, sweepIncoming } from "@/lib/guest-cleanup";
import { deleteEndedSessionPhotos } from "@/lib/photos-service";
import { sessionDeps } from "@/lib/session-deps";
import { endLeftBehindCalls, retryStaleCalls } from "@/lib/sessions";
import { serverKeyDb } from "@/lib/supabase/admin";

// The daily clean-up job (1f). Vercel's scheduler calls it once a day (vercel.json) with
// CRON_SECRET; nobody else can. It closes idle sessions (the database's own timer does too, every 10
// minutes) and ends any call they left behind at Tavus, deletes their photos, tidies old records, and
// deletes guests unused for 7 days (R3) and test guests a test run left behind.
const IDLE_DAYS = 7;
const TEST_GUEST_HOURS = 24;
const MAX_GUESTS_PER_RUN = 200;
const AT_ONCE = 5;

export const maxDuration = 60;

function fromScheduler(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!fromScheduler(request)) return Response.json({ error: "Not allowed." }, { status: 401 });

  const db = serverKeyDb();
  const tidy = await db.rpc("daily_tidy");
  if (tidy.error) return Response.json({ error: `tidy failed: ${tidy.error.message}` }, { status: 500 });
  // A failure in any of these mustn't stop the guest deletions below (R3, Phase 2 review). The Tavus steps
  // and the storage steps don't depend on each other, so they run side by side (5d review): a slow Tavus
  // must not use up the job's minute before the deletions.
  const deps = sessionDeps();
  const quietly = (what: string, work: () => Promise<number>) =>
    work().catch((e) => {
      console.error(`daily job: ${what} failed: ${e instanceof Error ? e.message : e}`);
      return 0;
    });
  const [[callsEnded, callsRetried], [photosDeleted, incomingSwept]] = await Promise.all([
    (async () => [
      await quietly("ending left-behind calls", () => endLeftBehindCalls(deps)),
      // Calls whose end or hard-delete at Tavus failed are tried again (review batch 1).
      await quietly("retrying stale calls", () => retryStaleCalls(deps)),
    ])(),
    (async () => [
      // Photos of sessions that ended from being idle: the database timer can't delete files (3a, Q4).
      await quietly("deleting ended sessions' photos", () => deleteEndedSessionPhotos(db)),
      // Raw uploads that never finished, older than an hour (review batch 5, E4).
      await quietly("sweeping raw uploads", () => sweepIncoming(db)),
    ])(),
  ]);

  const expired = await db.rpc("expired_guests", {
    idle_days: IDLE_DAYS,
    test_hours: TEST_GUEST_HOURS,
    max_count: MAX_GUESTS_PER_RUN,
  });
  if (expired.error) return Response.json({ error: `finding old guests failed: ${expired.error.message}` }, { status: 500 });

  // A few at a time, so a busy week's guests fit within the 60 seconds Vercel allows.
  const ids = expired.data as string[];
  let deleted = 0;
  const failures: string[] = [];
  for (let i = 0; i < ids.length; i += AT_ONCE) {
    // Their left-behind calls are ended first: deleted with them, a call's record would never reach Tavus (review batch 5, E6).
    const results = await Promise.allSettled(ids.slice(i, i + AT_ONCE).map((id) => endLeftBehindCalls(deps, id).then(() => deleteGuest(db, id))));
    for (const r of results) {
      if (r.status === "fulfilled") deleted++;
      else failures.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  const summary = { ...tidy.data, calls_ended: callsEnded, calls_retried: callsRetried, photos_deleted: photosDeleted, incoming_swept: incomingSwept, guests_deleted: deleted, guests_failed: failures.length };
  console.log(`daily job: ${JSON.stringify(summary)}${failures.length ? `; first failure: ${failures[0]}` : ""}`);
  return Response.json(summary, { status: failures.length ? 500 : 200 });
}
