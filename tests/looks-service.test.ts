import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { createFakeLooksBuilder, type LooksBuilder } from "@/core/looks/builder";
import { createFakeJudge } from "@/core/looks/judge";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { buildLooks, currentLooks, type LooksDeps } from "@/lib/looks-service";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 4b: building looks on the real sample catalog in the database, with the fake builder and judge: the
// filter, the checker, records of every decision, and the one publishing gate (R54, R55). Phase 4
// automated test: the publishing gate shows nothing without a passing check for that exact look on
// current requirements.

describe.skipIf(!canRunDatabaseTests)("building looks", () => {
  const db = serverDb();
  let guest: TestGuest;
  let session: string;
  const guard = createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd: 1, monthlyClaudeUsd: 1e6, monthlyOpenaiUsd: 1e6, monthlyVideoSeconds: 1e9 });
  const deps = (builder: LooksBuilder = createFakeLooksBuilder()): LooksDeps => ({ db, catalog: createSampleCatalog(db), guard, builder, judge: createFakeJudge() });
  const note = (kind: string, text: string, status: string, details: [string, string][] = []) => ({
    user_id: guest.id,
    session_id: session,
    kind,
    note_text: text,
    status,
    hidden_details: details.map(([name, value]) => ({ name, value })),
    source: "voice",
  });
  const wedding = () => [
    note("occasion", "Outdoor wedding, November", "confirmed", [["event", "wedding"], ["month", "november"]]),
    note("budget", "Budget: up to $350", "confirmed", [["max", "350"]]),
    note("outfit", "Dress", "confirmed", [["outfit", "dress"]]),
  ];

  beforeAll(async () => {
    guest = await createTestGuest();
    const { budget, preferences, ...shopping } = SAMPLE_PROFILE;
    await saveShopping(guest.db, guest.id, shopping);
    await saveBudget(guest.db, guest.id, budget);
    await savePreferences(guest.db, preferences);
  }, 30_000);
  beforeEach(async () => {
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    session = (await db.from("sessions").insert({ user_id: guest.id, status: "active" }).select("id").single().throwOnError()).data!.id;
  });
  afterAll(async () => guest?.remove());

  it("waits for a confirmed occasion (R39)", async () => {
    expect(await buildLooks(deps(), guest.id, session)).toEqual({ needs: "Tell the stylist the occasion to see looks" });
    expect(await buildLooks(deps(), "00000000-0000-0000-0000-000000000000", session)).toBeNull();
  });

  it("publishes three checked looks, each with a total and a record of its check", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const stages: string[] = [];
    const result = await buildLooks(deps(), guest.id, session, (s) => stages.push(s));
    if (!result || !("looks" in result)) throw new Error(JSON.stringify(result));
    expect(stages.slice(0, 2)).toEqual(["building", "checking"]);
    expect(result.looks).toHaveLength(3);
    expect(result.noMatch).toBeNull();
    for (const look of result.looks) {
      expect(look.items.some((i) => i.category === "dress")).toBe(true);
      expect(look.total.fits).toBe(true);
      expect(look.total.comparison).toMatch(/under your \$350 limit|Right at/);
    }
    const { data: rows } = await db.from("looks").select("id, status").eq("session_id", session).throwOnError();
    expect(rows!.filter((r) => r.status === "published")).toHaveLength(3);
    const { data: checks } = await db.from("check_results").select("verdict, reasons").eq("session_id", session).throwOnError();
    expect(checks!.length).toBe(rows!.length);
    expect(checks!.every((c) => (c.reasons as { about: string }[]).some((r) => r.about === "Never: high heels"))).toBe(true);
    expect((await currentLooks(deps(), guest.id, session)).map((l) => [l.id, l.current])).toEqual(result.looks.map((l) => [l.id, true]));

    // A changed requirement: the looks are no longer current, so they need a new check (R58).
    await db.from("session_notes").update({ hidden_details: [{ name: "max", value: "300" }], note_text: "Budget: up to $300" }).eq("session_id", session).eq("kind", "budget").throwOnError();
    expect((await currentLooks(deps(), guest.id, session)).every((l) => !l.current)).toBe(true);
  });

  it("the gate refuses a look without a passing check, with changed items, or on old requirements (Phase 4 test)", async () => {
    const look = async () =>
      (await db.from("looks").insert({ user_id: guest.id, session_id: session, items: [{ kind: "product", productId: "a" }], requirements_key: "k1", status: "checking" }).select("id").single().throwOnError()).data!.id as string;
    const publish = async (id: string, key = "k1") => (await db.rpc("publish_look", { look: id, current_requirements: key }).throwOnError()).data;

    const unchecked = await look();
    expect(await publish(unchecked)).toBe(false);

    const failed = await look();
    await db.rpc("record_check", { look: failed, verdict: "conflict", reasons: [], requirements_key: "k1" }).throwOnError();
    expect(await publish(failed)).toBe(false);

    const changed = await look();
    await db.rpc("record_check", { look: changed, verdict: "pass", reasons: [], requirements_key: "k1" }).throwOnError();
    await db.from("looks").update({ items: [{ kind: "product", productId: "b" }] }).eq("id", changed).throwOnError();
    expect(await publish(changed)).toBe(false);

    const passed = await look();
    await db.rpc("record_check", { look: passed, verdict: "pass", reasons: [], requirements_key: "k1" }).throwOnError();
    expect(await publish(passed, "k2")).toBe(false);
    expect(await publish(passed)).toBe(true);

    // A guest can't write looks or checks themselves.
    const write = await guest.db.from("looks").update({ status: "published" }).eq("id", unchecked).select("id");
    expect(write.data ?? []).toEqual([]);
    expect((await db.from("looks").select("status").eq("id", unchecked).single()).data!.status).toBe("checking");
  });

  it("with a tight budget, shows what passed and explains what limits the rest (Sabine's Q2)", async () => {
    await db
      .from("session_notes")
      .insert([note("occasion", "Outdoor wedding, November", "confirmed"), note("budget", "Budget: up to $90", "confirmed", [["max", "90"]]), note("outfit", "Dress", "confirmed", [["outfit", "dress"]])])
      .throwOnError();
    const result = await buildLooks(deps(), guest.id, session);
    if (!result || !("looks" in result)) throw new Error(JSON.stringify(result));
    expect(result.looks.length).toBeLessThan(3);
    expect(result.noMatch?.message).toMatch(/^Only \d (dresses|shoes) fit under your \$90 limit\.$/);
    expect(result.noMatch?.choices).toContain("Raise the budget");
  });

  it("publishes nothing when the requirements change while the looks are being built (R52)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const fake = createFakeLooksBuilder();
    const changing: LooksBuilder = {
      async build(input) {
        await db.from("session_notes").update({ hidden_details: [{ name: "max", value: "300" }] }).eq("session_id", session).eq("kind", "budget").throwOnError();
        return fake.build(input);
      },
    };
    expect(await buildLooks(deps(changing), guest.id, session)).toEqual({ stale: true });
    const { data } = await db.from("looks").select("status").eq("session_id", session).throwOnError();
    expect(data!.every((r) => r.status !== "published")).toBe(true);
  });

  it("looks and their checks are deleted when the session ends (R63)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    await buildLooks(deps(), guest.id, session);
    await db.rpc("delete_session_data", { session }).throwOnError();
    expect((await db.from("looks").select("id").eq("session_id", session)).data).toEqual([]);
    expect((await db.from("check_results").select("id").eq("session_id", session)).data).toEqual([]);
  });
});
