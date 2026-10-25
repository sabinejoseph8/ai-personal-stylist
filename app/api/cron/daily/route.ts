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
  // A failure here mustn't stop the guest deletions below (R3, Phase 2 review).
  const callsEnded = await endLeftBehindCalls(sessionDeps()).catch((e) => {
    console.error(`daily job: ending left-behind calls failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  });
  // Calls whose end or hard-delete at Tavus failed are tried again (review batch 1).
  const callsRetried = await retryStaleCalls(sessionDeps()).catch((e) => {
    console.error(`daily job: retrying stale calls failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  });
  // Photos of sessions that ended from being idle: the database timer can't delete files (3a, Q4).
  const photosDeleted = await deleteEndedSessionPhotos(db).catch((e) => {
    console.error(`daily job: deleting ended sessions' photos failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  });

  // Raw uploads that never finished, older than an hour (review batch 5, E4).
  const incomingSwept = await sweepIncoming(db).catch((e) => {
    console.error(`daily job: sweeping raw uploads failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  });

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
    const results = await Promise.allSettled(ids.slice(i, i + AT_ONCE).map((id) => endLeftBehindCalls(sessionDeps(), id).then(() => deleteGuest(db, id))));
    for (const r of results) {
      if (r.status === "fulfilled") deleted++;
      else failures.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  const summary = { ...tidy.data, calls_ended: callsEnded, calls_retried: callsRetried, photos_deleted: photosDeleted, incoming_swept: incomingSwept, guests_deleted: deleted, guests_failed: failures.length };
  console.log(`daily job: ${JSON.stringify(summary)}${failures.length ? `; first failure: ${failures[0]}` : ""}`);
  return Response.json(summary, { status: failures.length ? 500 : 200 });
}
