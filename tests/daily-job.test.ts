import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/daily/route";
import { canRunDatabaseTests, createTestGuest, serverDb, setting, type TestGuest } from "./support/test-guests";

// Phase 1 automated test: the daily job deletes guests unused for 7 days (R3) and closes idle sessions.
// It runs the real job against the shared database, as Vercel's scheduler would.
const SECRET = "test-cron-secret-0123456789";
const run = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} }));
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe("daily job: who may run it", () => {
  beforeAll(() => {
    process.env.CRON_SECRET = SECRET;
  });

  it("refuses anyone without Vercel's secret", async () => {
    expect((await run()).status).toBe(401);
    expect((await run("Bearer wrong-secret")).status).toBe(401);
    expect((await run(SECRET)).status).toBe(401);
  });

  it("refuses everyone when no secret is set", async () => {
    delete process.env.CRON_SECRET;
    expect((await run(`Bearer ${SECRET}`)).status).toBe(401);
    process.env.CRON_SECRET = SECRET;
  });
});

describe.skipIf(!canRunDatabaseTests)("daily job", () => {
  const db = serverDb();
  let old: TestGuest;
  let active: TestGuest;
  let old2: TestGuest;
  let idleSession: string;
  let liveSession: string;
  let summary: Record<string, number>;

  beforeAll(async () => {
    process.env.CRON_SECRET = SECRET;
    process.env.SUPABASE_SECRET_KEY = setting("SUPABASE_SECRET_KEY");
    [old, active, old2] = await Promise.all([createTestGuest(), createTestGuest(), createTestGuest()]);
    await db.from("profiles").update({ last_active_at: ago(8 * 24 * 60) }).eq("user_id", old.id).throwOnError();
    const upload = await old.db.storage.from("guest-photos").upload(`${old.id}/blazer.jpg`, new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }));
    if (upload.error) throw upload.error;
    // One open session per guest: the idle one is a second guest's (only the server creates sessions).
    const sessions = await db
      .from("sessions")
      .insert([
        { user_id: old2.id, last_activity_at: ago(40) },
        { user_id: active.id, last_activity_at: ago(5) },
      ])
      .select("id, last_activity_at")
      .order("last_activity_at")
      .throwOnError();
    [idleSession, liveSession] = sessions.data!.map((s) => s.id);
    const res = await run(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    summary = await res.json();
  }, 60_000);

  afterAll(async () => {
    await active?.remove();
    await old2?.remove();
    await old?.remove().catch(() => undefined); // already deleted by the job, unless a test failed
  });

  it("deletes a guest unused for 7 days, with their photos and rows", async () => {
    expect(summary.guests_deleted).toBeGreaterThanOrEqual(1);
    const user = await db.auth.admin.getUserById(old.id);
    expect(user.data.user).toBeNull();
    const profile = await db.from("profiles").select("user_id").eq("user_id", old.id);
    expect(profile.data).toEqual([]);
    const photos = await db.storage.from("guest-photos").list(old.id);
    expect(photos.data ?? []).toEqual([]);
  });

  it("keeps a guest who visited recently", async () => {
    const user = await db.auth.admin.getUserById(active.id);
    expect(user.data.user?.id).toBe(active.id);
  });

  it("closes a session idle for 30 minutes, and leaves a live one open (R12)", async () => {
    const { data } = await db.from("sessions").select("id, status, ended_at").in("id", [idleSession, liveSession]).throwOnError();
    const byId = Object.fromEntries(data!.map((s) => [s.id, s]));
    expect(byId[idleSession]).toMatchObject({ status: "ended" });
    expect(byId[idleSession].ended_at).not.toBeNull();
    expect(byId[liveSession]).toMatchObject({ status: "active", ended_at: null });
  });
});

describe.skipIf(!canRunDatabaseTests)("last visit", () => {
  const db = serverDb();
  let guest: TestGuest;
  const lastActive = async () =>
    new Date((await db.from("profiles").select("last_active_at").eq("user_id", guest.id).single().throwOnError()).data!.last_active_at).getTime();

  beforeAll(async () => {
    guest = await createTestGuest();
  }, 30_000);
  afterAll(async () => {
    await guest?.remove();
  });

  it("a visit marks the guest active, writing at most once an hour (R3)", async () => {
    await db.from("profiles").update({ last_active_at: ago(120) }).eq("user_id", guest.id).throwOnError();
    await guest.db.rpc("touch_last_active").throwOnError();
    const touched = await lastActive();
    expect(Date.now() - touched).toBeLessThan(60_000);
    await db.from("profiles").update({ last_active_at: ago(10) }).eq("user_id", guest.id).throwOnError();
    const before = await lastActive();
    await guest.db.rpc("touch_last_active").throwOnError();
    expect(await lastActive()).toBe(before);
  });
});
