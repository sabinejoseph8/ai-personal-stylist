import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { createFakeLooksBuilder, type LooksBuilder } from "@/core/looks/builder";
import type { LookItem } from "@/core/looks/look";
import { createFakeJudge } from "@/core/looks/judge";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { buildLooks, currentLooks, type LooksDeps, type ShownLook, swapPiece } from "@/lib/looks-service";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 4b: building looks on the real sample catalog in the database, with the fake builder and judge: the
// filter, the checker, records of every decision, and the one publishing gate (R54, R55). Phase 4
// automated test: the publishing gate shows nothing without a passing check for that exact look on
// current requirements. 4c: looks kept in their places and checked again after a change (R44, R58),
// Try again, and Swap (R43), with Phase 4's test that no swap ever brings high heels (S13).

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

    // A swap publishes its look and retires the old one in the same step; a retired look can't come back (4c).
    const swapped = await look();
    await db.rpc("record_check", { look: swapped, verdict: "pass", reasons: [], requirements_key: "k1" }).throwOnError();
    expect((await db.rpc("publish_look", { look: swapped, current_requirements: "k1", replaces: passed }).throwOnError()).data).toBe(true);
    expect((await db.from("looks").select("status").eq("id", passed).single()).data!.status).toBe("replaced");
    expect(await publish(passed)).toBe(false);

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

  it("never shows two looks with the same main pieces, only different shoes (Sabine's review of the sample looks)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const fake = createFakeLooksBuilder();
    let dress: LookItem | undefined;
    const sameDress: LooksBuilder = {
      async build(input) {
        const { looks } = await fake.build(input);
        // Every look, in every round, gets the first look's dress.
        const first = (dress ??= looks[0].items[0]);
        return { looks: looks.map((l) => ({ ...l, items: [first, ...l.items.slice(1)] })), costUsd: 0 };
      },
    };
    const result = await buildLooks(deps(sameDress), guest.id, session);
    if (!result || !("looks" in result)) throw new Error(JSON.stringify(result));
    expect(result.looks).toHaveLength(1);
    expect(result.noMatch).not.toBeNull();
  });

  /** Builds looks, counting the builder's calls. */
  function counting() {
    const fake = createFakeLooksBuilder();
    const counter: { calls: number; builder: LooksBuilder } = { calls: 0, builder: fake };
    counter.builder = { build: (input) => ((counter.calls += 1), fake.build(input)) };
    return counter;
  }
  const looksOf = (r: Awaited<ReturnType<typeof buildLooks>>): ShownLook[] => {
    if (!r || !("looks" in r)) throw new Error(JSON.stringify(r));
    return r.looks;
  };
  const setBudget = (dollars: number) =>
    db.from("session_notes").update({ hidden_details: [{ name: "max", value: String(dollars) }], note_text: `Budget: up to $${dollars}` }).eq("session_id", session).eq("kind", "budget").throwOnError();

  it("answers at once when nothing has changed, and Try again fills an empty place (4c)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const first = looksOf(await buildLooks(deps(), guest.id, session));
    expect(first.map((l) => l.slot)).toEqual([1, 2, 3]);
    const counter = counting();
    const again = looksOf(await buildLooks(deps(counter.builder), guest.id, session, undefined, { allowAi: async () => false }));
    expect(again.map((l) => l.id)).toEqual(first.map((l) => l.id));
    expect(counter.calls).toBe(0);

    await db.from("looks").update({ status: "held" }).eq("id", first[1].id).throwOnError();
    const two = looksOf(await buildLooks(deps(counter.builder), guest.id, session));
    expect(two.map((l) => l.slot)).toEqual([1, 3]);
    expect(counter.calls).toBe(0);
    expect(await buildLooks(deps(counter.builder), guest.id, session, undefined, { force: true, allowAi: async () => false })).toEqual({ limited: true });
    const filled = looksOf(await buildLooks(deps(counter.builder), guest.id, session, undefined, { force: true }));
    expect(filled.map((l) => l.slot)).toEqual([1, 2, 3]);
    expect([filled[0].id, filled[2].id]).toEqual([first[0].id, first[2].id]);
    expect(counter.calls).toBe(1);
  });

  it("after a change, keeps the looks that still pass in their places and replaces the rest (Q3 in 4c, R44, R58)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const first = looksOf(await buildLooks(deps(), guest.id, session));
    const totals = first.map((l) => l.total.totalCents);
    const limit = Math.floor((Math.max(...totals) - 1) / 100);
    expect(Math.min(...totals)).toBeLessThanOrEqual(limit * 100);
    await setBudget(limit);
    expect((await currentLooks(deps(), guest.id, session)).every((l) => !l.current)).toBe(true);

    const stages: string[] = [];
    const counter = counting();
    const result = await buildLooks(deps(counter.builder), guest.id, session, (s) => stages.push(s));
    const after = looksOf(result);
    expect(stages[0]).toBe("updating");
    expect(counter.calls).toBeGreaterThan(0);
    for (const look of after) expect(look.total.totalCents).toBeLessThanOrEqual(limit * 100);
    for (const look of first) {
      const now = after.find((l) => l.slot === look.slot);
      if (look.total.totalCents <= limit * 100) expect(now?.id).toBe(look.id);
      else expect(now?.id).not.toBe(look.id);
    }
    // Fewer than 3 under the new budget: the explanation says why (Q2 in 4b).
    if (after.length < 3) expect(result && "noMatch" in result && result.noMatch).toBeTruthy();
    expect(after.every((l) => l.current)).toBe(true);
    // Every look on screen has a passing check on the new requirements.
    const { data: checks } = await db.from("check_results").select("look_id, verdict, versions_checked").in("look_id", after.map((l) => l.id)).throwOnError();
    const key = (await db.from("looks").select("requirements_key").eq("id", after[0].id).single()).data!.requirements_key;
    for (const look of after) expect(checks!.some((c) => c.look_id === look.id && c.verdict === "pass" && (c.versions_checked as { requirements: string }).requirements === key)).toBe(true);
  });

  it("swaps a piece in its place, checked first, never bringing high heels or the same shoes back (R43, S13)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const looks = looksOf(await buildLooks(deps(), guest.id, session));
    let look = looks[0];
    const index = look.items.findIndex((i) => i.group === "shoes");
    const shown = new Set([look.items[index].id]);
    for (let n = 0; n < 10; n++) {
      const result = await swapPiece(deps(), guest.id, session, look.id, index);
      if (!result || !("look" in result)) throw new Error(JSON.stringify(result));
      const shoes = (await createSampleCatalog(db).getProduct(result.look.items[index].id))!;
      expect(shoes.category).toBe("shoes");
      expect(shoes.details.heelCm).toBeLessThanOrEqual(5);
      expect(shoes.id).not.toBe(look.items[index].id);
      expect(result.look.slot).toBe(1);
      expect(result.look.reason).toBe("A fake reason for a swapped look.");
      expect(result.look.items.filter((_, i) => i !== index)).toEqual(look.items.filter((_, i) => i !== index));
      expect((await db.from("looks").select("status").eq("id", look.id).single()).data!.status).toBe("replaced");
      shown.add(shoes.id);
      look = result.look;
    }
    // Pairs shown before don't come back until every pair that fits has had its turn.
    expect(shown.size).toBeGreaterThanOrEqual(4);
    const now = await currentLooks(deps(), guest.id, session);
    expect(now.map((l) => l.id)).toEqual([look.id, looks[1].id, looks[2].id]);
  }, 90_000);

  it("turns a swap away while the look needs a new check, or for the shopper's own piece", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    expect(await swapPiece(deps(), guest.id, session, look.id, 99)).toBeNull();
    expect(await swapPiece(deps(), "00000000-0000-0000-0000-000000000000", session, look.id, 0)).toBeNull();
    await setBudget(340);
    expect(await swapPiece(deps(), guest.id, session, look.id, 0)).toEqual({ stale: true });
  });

  it("looks and their checks are deleted when the session ends (R63)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    await buildLooks(deps(), guest.id, session);
    await db.rpc("delete_session_data", { session }).throwOnError();
    expect((await db.from("looks").select("id").eq("session_id", session)).data).toEqual([]);
    expect((await db.from("check_results").select("id").eq("session_id", session)).data).toEqual([]);
  });
});
