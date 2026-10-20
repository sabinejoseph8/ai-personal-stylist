import { timingSafeEqual } from "node:crypto";
import { deleteGuest } from "@/lib/guest-cleanup";
import { serverKeyDb } from "@/lib/supabase/admin";

// The daily clean-up job (1f). Vercel's scheduler calls it once a day (vercel.json) with
// CRON_SECRET; nobody else can. It closes idle sessions, tidies old records, and deletes guests
// unused for 7 days (R3) and test guests a test run left behind.
const IDLE_DAYS = 7;
const TEST_GUEST_HOURS = 24;
const MAX_GUESTS_PER_RUN = 200;

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

  const expired = await db.rpc("expired_guests", {
    idle_days: IDLE_DAYS,
    test_hours: TEST_GUEST_HOURS,
    max_count: MAX_GUESTS_PER_RUN,
  });
  if (expired.error) return Response.json({ error: `finding old guests failed: ${expired.error.message}` }, { status: 500 });

  let deleted = 0;
  const failures: string[] = [];
  for (const id of expired.data as string[]) {
    try {
      await deleteGuest(db, id);
      deleted++;
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }

  const summary = { ...tidy.data, guests_deleted: deleted, guests_failed: failures.length };
  console.log(`daily job: ${JSON.stringify(summary)}${failures.length ? `; first failure: ${failures[0]}` : ""}`);
  return Response.json(summary, { status: failures.length ? 500 : 200 });
}
