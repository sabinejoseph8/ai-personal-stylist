import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRunDatabaseTests, createTestGuest, serverDb, visitorDb, type TestGuest } from "./support/test-guests";

// 1b: every new guest gets a profile, and rate limits stop a guest at the limit.
// The tests in this file run in order and share one guest.
describe.skipIf(!canRunDatabaseTests)("guest sign-in", () => {
  let guest: TestGuest;

  beforeAll(async () => {
    guest = await createTestGuest();
  }, 30_000);
  afterAll(async () => guest?.remove());

  it("a new guest gets a profile and a consents row automatically", async () => {
    const profile = await serverDb().from("profiles").select("user_id").eq("user_id", guest.id);
    const consents = await serverDb().from("consents").select("user_id").eq("user_id", guest.id);
    expect(profile.data).toHaveLength(1);
    expect(consents.data).toHaveLength(1);
  });

  it("the guest can read their own profile", async () => {
    const { data } = await guest.db.from("profiles").select("user_id").single();
    expect(data?.user_id).toBe(guest.id);
  });

  it("the 6th session start in an hour is blocked", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const { data } = await guest.db.rpc("take_rate_limit", { bucket: "startSession", max_hits: 5, window_seconds: 3600 });
      results.push(data === true);
    }
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("asking for a different window size doesn't reset the count (Phase 1 code review)", async () => {
    // Runs after the test above, so this hour's 6 session starts are already counted.
    for (const window_seconds of [1, 60, 1800]) {
      await guest.db.rpc("take_rate_limit", { bucket: "startSession", max_hits: 1000, window_seconds });
    }
    const { data } = await guest.db.rpc("take_rate_limit", { bucket: "startSession", max_hits: 5, window_seconds: 3600 });
    expect(data).toBe(false);
  });

  it("a guest can't read or change the rate limit counters", async () => {
    const read = await guest.db.from("rate_limits").select("*");
    expect(read.data ?? []).toHaveLength(0);
    const write = await guest.db
      .from("rate_limits")
      .insert({ user_id: guest.id, bucket: "startSession", window_start: new Date().toISOString(), hits: 0 });
    expect(write.error).not.toBeNull();
  });

  it("someone who isn't signed in can't use the rate limits", async () => {
    const { data } = await visitorDb().rpc("take_rate_limit", { bucket: "startSession", max_hits: 5, window_seconds: 3600 });
    expect(data).not.toBe(true);
  });
});
