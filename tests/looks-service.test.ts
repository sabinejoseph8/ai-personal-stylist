import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { createFakeLooksBuilder, type LooksBuilder } from "@/core/looks/builder";
import { type LookItem, REPEATS_SHOWN } from "@/core/looks/look";
import { createFakeJudge, type Judge } from "@/core/looks/judge";
import { behindTheScenesFor } from "@/lib/behind-the-scenes";
import { allowException, removeException, saveExceptionToProfile } from "@/lib/exceptions-service";
import { lookRequirements } from "@/lib/looks-inputs";
import { feedbackByTouch, jotWanted, takeBackFeedback, touchSessionNote } from "@/lib/notes-service";
import { SessionEndedError } from "@/lib/notes-store";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { buildLooks, currentLooks, lookHistory, type LooksDeps, restoreLook, type ShownLook, swapPiece } from "@/lib/looks-service";
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
    const counter = counting();
    const result = await buildLooks(deps(counter.builder), guest.id, session);
    if (!result || !("looks" in result)) throw new Error(JSON.stringify(result));
    expect(result.looks.length).toBeLessThan(3);
    expect(result.noMatch?.message).toMatch(/^Only \d (dresses|shoes) fit under your \$90 limit\.$/);
    expect(result.noMatch?.choices).toContain("Raise the budget");
    // No dress fits under $90 with even the cheapest shoes, so no look can be made: the builder is never
    // asked, not even by Try again (looks speed plan).
    expect(counter.calls).toBe(0);
    await buildLooks(deps(counter.builder), guest.id, session, undefined, { force: true });
    expect(counter.calls).toBe(0);
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
    let judged = 0;
    const judgedBefore: number[] = [];
    const sameDress: LooksBuilder = {
      async build(input) {
        judgedBefore.push(judged);
        const { looks } = await fake.build(input);
        // Every look, in every round, gets the first look's dress.
        const first = (dress ??= looks[0].items[0]);
        return { looks: looks.map((l) => ({ ...l, items: [first, ...l.items.slice(1)] })), costUsd: 0 };
      },
    };
    const judge = createFakeJudge();
    const counted: Judge = { judge: (input) => ((judged += 1), judge.judge(input)) };
    const result = await buildLooks({ ...deps(sameDress), judge: counted }, guest.id, session);
    if (!result || !("looks" in result)) throw new Error(JSON.stringify(result));
    expect(result.looks).toHaveLength(1);
    expect(result.noMatch).not.toBeNull();
    // Only the first round is judged: later repeats of the shown dress aren't worth paying for.
    expect(judgedBefore.length).toBeGreaterThan(1);
    expect(judgedBefore[1]).toBeGreaterThan(0);
    expect(judged).toBe(judgedBefore[1]);
    const { data: checks } = await db.from("check_results").select("reasons").eq("session_id", session).throwOnError();
    expect(checks!.filter((c) => JSON.stringify(c.reasons).includes(REPEATS_SHOWN)).length).toBeGreaterThan(0);
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

  it("with no look passing, asking again builds again only after a change or Try again (Phase 4 code review)", async () => {
    await db
      .from("session_notes")
      .insert([note("occasion", "Outdoor wedding, November", "confirmed"), note("budget", "Budget: up to $350", "confirmed", [["max", "350"]])])
      .throwOnError();
    const counter = counting();
    // The stylist's judgment turns every candidate down, so none passes.
    const never: Judge = { judge: async () => ({ verdict: "conflict", reasons: [{ about: "Outdoor wedding, November", ok: false, why: "Not right for it" }], costUsd: 0 }) };
    const failing = () => ({ ...deps(counter.builder), judge: never });
    const first = await buildLooks(failing(), guest.id, session);
    expect(looksOf(first)).toHaveLength(0);
    const calls = counter.calls;
    expect(calls).toBeGreaterThan(0);
    // Nothing changed: the same explanation, at no cost.
    expect(await buildLooks(failing(), guest.id, session)).toEqual(first);
    expect(counter.calls).toBe(calls);
    await buildLooks(failing(), guest.id, session, undefined, { force: true });
    expect(counter.calls).toBeGreaterThan(calls);
    const forced = counter.calls;
    await setBudget(340);
    await buildLooks(failing(), guest.id, session);
    expect(counter.calls).toBeGreaterThan(forced);
  }, 60_000);

  it("a swap waits for a build in progress, so they never fill the same place (Phase 4 code review)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    await db.rpc("claim_looks_build", { session }).throwOnError();
    let done = false;
    const swapping = swapPiece(deps(), guest.id, session, look.id, look.items.findIndex((i) => i.group === "shoes")).then((r) => ((done = true), r));
    await new Promise((r) => setTimeout(r, 2500));
    expect(done).toBe(false);
    await db.rpc("release_looks_build", { session }).throwOnError();
    const result = await swapping;
    expect(result && "look" in result).toBe(true);
  }, 60_000);

  it("builds once when two requests arrive together: the second waits, then answers from the first (found in 4d)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const fake = createFakeLooksBuilder();
    let calls = 0;
    const slow: LooksBuilder = {
      async build(input) {
        calls++;
        await new Promise((r) => setTimeout(r, 1500));
        return fake.build(input);
      },
    };
    const stages: string[] = [];
    const [a, b] = await Promise.all([buildLooks(deps(slow), guest.id, session), buildLooks(deps(slow), guest.id, session, (s) => stages.push(s))]);
    expect(calls).toBe(1);
    expect(looksOf(a).map((l) => l.id)).toEqual(looksOf(b).map((l) => l.id));
    const { data: published } = await db.from("looks").select("id").eq("session_id", session).eq("status", "published").throwOnError();
    expect(published).toHaveLength(3);
    expect((await db.from("sessions").select("looks_busy_until").eq("id", session).single()).data!.looks_busy_until).toBeNull();
  }, 60_000);

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
  }, 60_000);

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

  it("when no replacement passes, the piece stays, and Swap again doesn't pay to check the same ones (found on Sabine's iPhone in 4d)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    const index = look.items.findIndex((i) => i.group === "shoes");
    // A judge that blocks every swapped look.
    let judged = 0;
    const strict: Judge = {
      async judge(input) {
        if (!input.withReason) return createFakeJudge().judge(input);
        judged++;
        return { verdict: "conflict", reasons: [{ about: "Outdoor wedding, November", ok: false, why: "Too casual" }], costUsd: 0 };
      },
    };
    const withStrict = { ...deps(), judge: strict };
    const first = await swapPiece(withStrict, guest.id, session, look.id, index);
    expect(first).toEqual({ none: "No other shoes fit everything you've asked for, so these stay." });
    expect(judged).toBeGreaterThan(0);
    const checked = judged;
    expect(await swapPiece(withStrict, guest.id, session, look.id, index)).toEqual(first);
    expect(judged).toBe(checked);
    // Each piece is remembered apart: no bag passes either, and the shoes still aren't checked again.
    const bag = look.items.findIndex((i) => i.group === "bag");
    if (bag >= 0) {
      await swapPiece(withStrict, guest.id, session, look.id, bag);
      const afterBag = judged;
      expect(await swapPiece(withStrict, guest.id, session, look.id, index)).toEqual(first);
      expect(judged).toBe(afterBag);
    }
    expect((await currentLooks(deps(), guest.id, session))[0].id).toBe(look.id);

    // A change to the requirements starts afresh: after the looks are brought up to date, they're checked again.
    await setBudget(450);
    await buildLooks(deps(), guest.id, session);
    const now = (await currentLooks(deps(), guest.id, session))[0];
    await swapPiece(withStrict, guest.id, session, now.id, now.items.findIndex((i) => i.group === "shoes"));
    expect(judged).toBeGreaterThan(checked);
  }, 60_000);

  it("turns a swap away while the look needs a new check, or for the shopper's own piece", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    expect(await swapPiece(deps(), guest.id, session, look.id, 99)).toBeNull();
    expect(await swapPiece(deps(), "00000000-0000-0000-0000-000000000000", session, look.id, 0)).toBeNull();
    await setBudget(340);
    expect(await swapPiece(deps(), guest.id, session, look.id, 0)).toEqual({ stale: true });
  });

  it("Behind the scenes tells the session's story in plain words, for its own guest only (4d, R72)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const catalog = createSampleCatalog(db);
    const heels = (await catalog.search({ department: "womenswear", limit: 1000 })).find((p) => p.category === "shoes" && (p.details.heelCm ?? 0) > 5)!;
    const fake = createFakeLooksBuilder();
    // The last candidate gets high heels, so the checker blocks it.
    const withHeels: LooksBuilder = {
      async build(input) {
        const { looks } = await fake.build(input);
        looks[looks.length - 1].items[1] = { kind: "product", productId: heels.id };
        return { looks, costUsd: 0 };
      },
    };
    const [first] = looksOf(await buildLooks(deps(withHeels), guest.id, session));
    const swapped = await swapPiece(deps(), guest.id, session, first.id, first.items.findIndex((i) => i.group === "shoes"));
    if (!swapped || !("look" in swapped)) throw new Error(JSON.stringify(swapped));
    await setBudget(400);
    await buildLooks(deps(), guest.id, session);

    const entries = (await behindTheScenesFor({ db, catalog }, guest.id, session))!;
    const texts = entries.map((e) => e.text);
    expect(entries[0].kind).toBe("products");
    expect(texts[0]).toMatch(/^Right now \d+ of \d+ womenswear sample products fit everything you've asked for\. Left out: .*for Never: high heels/);
    expect(texts).toContain("Captured: Outdoor wedding, November. From what you said. Confirmed by you.");
    expect(texts.some((t) => /^Check passed: Look 1, Test look \d\. It meets Never: high heels; Must have: sleeves; your budget/.test(t))).toBe(true);
    expect(texts.some((t) => t.startsWith(`Check blocked a candidate: ${heels.name}: `) && t.includes("Never: high heels"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Swap in Look 1: ") && t.endsWith(", and passed the check."))).toBe(true);
    expect(texts.filter((t) => t.startsWith("Swap in Look 1: "))).toHaveLength(1);
    expect(texts.filter((t) => t.startsWith("Checked again after your change: Look")).length).toBeGreaterThanOrEqual(3);
    // Newest first, after the products line.
    const times = entries.slice(1).map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // Never a photo, a link or another guest's session.
    expect(JSON.stringify(entries)).not.toMatch(/https?:|\.jpg|guest-photos/);
    expect(await behindTheScenesFor({ db, catalog }, "00000000-0000-0000-0000-000000000000", session)).toBeNull();
  }, 60_000);

  it("Keep and Change by touch jot feedback under the look, and never make the looks need a new check (5a)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const catalog = createSampleCatalog(db);
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    const shoes = look.items.findIndex((i) => i.group === "shoes");
    const keep = await feedbackByTouch({ db, catalog }, guest.id, session, { lookId: look.id, index: 0, act: "keep", on: true });
    expect(keep?.notes.filter((n) => n.feedback).map((n) => [n.text, n.status, n.feedback])).toEqual([
      [`Keep the ${look.items[0].name.charAt(0).toLowerCase()}${look.items[0].name.slice(1)}`, "confirmed", { look: look.slot, items: [look.items[0].id], act: "keep", scope: "item" }],
    ]);
    const change = await feedbackByTouch({ db, catalog }, guest.id, session, { lookId: look.id, index: shoes, act: "change", on: true });
    expect(change?.notes.filter((n) => n.feedback).map((n) => n.feedback!.act)).toEqual(["keep", "change"]);
    const off = await feedbackByTouch({ db, catalog }, guest.id, session, { lookId: look.id, index: 0, act: "keep", on: false });
    expect(off?.notes.filter((n) => n.feedback).map((n) => n.feedback!.act)).toEqual(["change"]);
    // Feedback revises its look (5b), it isn't a requirement: the looks stay current, and Change swaps the piece without the builder.
    expect((await currentLooks(deps(), guest.id, session)).every((l) => l.current)).toBe(true);
    const counter = counting();
    await buildLooks(deps(counter.builder), guest.id, session);
    expect(counter.calls).toBe(0);
    // Not for another guest, and not for an index that isn't an item.
    expect(await feedbackByTouch({ db, catalog }, "00000000-0000-0000-0000-000000000000", session, { lookId: look.id, index: 0, act: "keep", on: true })).toBeNull();
    expect(await feedbackByTouch({ db, catalog }, guest.id, session, { lookId: look.id, index: 11, act: "keep", on: true })).toBeNull();
    const entries = (await behindTheScenesFor({ db, catalog }, guest.id, session))!;
    expect(entries.some((e) => e.text.startsWith(`Feedback on Look ${look.slot}: Change the `) && e.text.endsWith("Confirmed with a tap."))).toBe(true);
  }, 60_000);

  /** A feedback line under the look in place `slot`, as the notes reader or a tap jots it (5a). */
  const feedback = (text: string, slot: number, act: string, items: string[], scope = "item", about = "") =>
    note("feedback", text, "confirmed", [["look", String(slot)], ["items", items.join(",")], ["act", act], ["scope", scope], ...(about ? [["about", about] as [string, string]] : [])]);
  const stagesOf = () => {
    const stages: string[] = [];
    return { stages, emit: (state: string, slots?: number[]) => void stages.push(slots ? `${state} ${slots.join(",")}` : state) };
  };
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  it("revises a look from feedback: 'Not these shoes' changes only that pair, in that look, and never brings it back (5b, R48, R50)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const first = looksOf(await buildLooks(deps(), guest.id, session));
    const [look] = first;
    const at = look.items.findIndex((i) => i.group === "shoes");
    const shoes = look.items[at];
    await db.from("session_notes").insert(feedback("Not these shoes", look.slot, "dislike", [shoes.id])).throwOnError();
    const { stages, emit } = stagesOf();
    const after = looksOf(await buildLooks(deps(), guest.id, session, emit));
    expect(stages).toContain(`revising ${look.slot}`);
    const revised = after.find((l) => l.slot === look.slot)!;
    expect(revised.id).not.toBe(look.id);
    expect(revised.items[at].id).not.toBe(shoes.id);
    expect(revised.items.filter((_, i) => i !== at).map((i) => i.id)).toEqual(look.items.filter((_, i) => i !== at).map((i) => i.id));
    expect(revised.changed).toEqual([at]);
    expect(revised.change).toMatch(new RegExp(`^Changed: ${esc(shoes.name)} to ${esc(revised.items[at].name)}\\. Kept: .+\\. New total: \\$\\d+, .+\\.$`));
    // The other looks are as they were, and asking again revises nothing more.
    expect(after.filter((l) => l.slot !== look.slot).map((l) => l.id)).toEqual(first.filter((l) => l.slot !== look.slot).map((l) => l.id));
    const again = stagesOf();
    expect(looksOf(await buildLooks(deps(), guest.id, session, again.emit)).map((l) => l.id)).toEqual(after.map((l) => l.id));
    expect(again.stages).toEqual([]);
    // Swap in that look never brings the turned-down pair back.
    for (let n = 0; n < 3; n++) {
      const current = (await currentLooks(deps(), guest.id, session)).find((l) => l.slot === look.slot)!;
      expect(current.items[at].id).not.toBe(shoes.id);
      const swapped = await swapPiece(deps(), guest.id, session, current.id, at);
      if (!swapped || !("look" in swapped)) break;
      expect(swapped.look.change ?? null).toBeNull();
    }
  }, 120_000);

  it("feedback for every look ('no high heels in any look') is a requirement for all of them, not a revision of one (5b, R48)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const first = looksOf(await buildLooks(deps(), guest.id, session));
    const heard: string[][] = [];
    const judge = createFakeJudge();
    const spying: Judge = { judge: (input) => (heard.push(input.notes), judge.judge(input)) };
    await db.from("session_notes").insert(feedback("No high heels in any look", 2, "change", [], "session", "high heel")).throwOnError();
    const { stages, emit } = stagesOf();
    const after = looksOf(await buildLooks({ ...deps(), judge: spying }, guest.id, session, emit));
    expect(stages).toContain("updating");
    expect(stages.some((s) => s.startsWith("revising"))).toBe(false);
    expect(heard.length).toBeGreaterThanOrEqual(first.length);
    expect(heard.every((notes) => notes.includes("No high heels in any look"))).toBe(true);
    expect(after.every((l) => l.current)).toBe(true);
  }, 60_000);

  it("kept pieces stay through 3 rounds of changes (5b, R49, S12)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    const at = look.items.findIndex((i) => i.group === "shoes");
    const kept = look.items.filter((_, i) => i !== at).map((i) => i.id);
    await db.from("session_notes").insert(feedback("Keep the dress and bag", look.slot, "keep", kept)).throwOnError();
    const shown = [look.items[at].id];
    let current = look;
    for (let round = 1; round <= 3; round++) {
      await db.from("session_notes").insert(feedback(`Change the shoes, round ${round}`, look.slot, "change", [current.items[at].id])).throwOnError();
      current = looksOf(await buildLooks(deps(), guest.id, session)).find((l) => l.slot === look.slot)!;
      expect(current.items.filter((_, i) => i !== at).map((i) => i.id)).toEqual(kept);
      expect(shown).not.toContain(current.items[at].id);
      shown.push(current.items[at].id);
      expect(current.total.fits).toBe(true);
    }
  }, 120_000);

  it("drops a revision built on an old budget, and the look then fits the new one (5b, R52, S15)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    const at = look.items.findIndex((i) => i.group === "shoes");
    await db.from("session_notes").insert(feedback("Change the shoes", look.slot, "change", [look.items[at].id])).throwOnError();
    const judge = createFakeJudge();
    let changed = false;
    const changing: Judge = {
      async judge(input) {
        if (!changed) {
          changed = true;
          await setBudget(300);
        }
        return judge.judge(input);
      },
    };
    expect(await buildLooks({ ...deps(), judge: changing }, guest.id, session)).toEqual({ stale: true });
    const { data: shownRevisions } = await db.from("looks").select("id").eq("revision_of", look.id).eq("status", "published").throwOnError();
    expect(shownRevisions).toEqual([]);
    // Asked again on the newest: the look in that place fits $300.
    const after = looksOf(await buildLooks(deps(), guest.id, session)).find((l) => l.slot === look.slot)!;
    expect(after.current).toBe(true);
    expect(after.total.fits).toBe(true);
    expect(after.total.comparison).toMatch(/\$300 limit/);
  }, 90_000);

  it("when no revision passes, the look stays with a note, isn't tried again, and the profile never changes (5b, R48, R53)", async () => {
    const profileBefore = await Promise.all([
      db.from("saved_preferences").select("*").eq("user_id", guest.id).order("id").throwOnError(),
      db.from("profiles").select("departments, style_words, sizes, budget_amount_cents, budget_meaning, budget_max_cents").eq("user_id", guest.id).throwOnError(),
    ]);
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    const at = look.items.findIndex((i) => i.group === "shoes");
    await db.from("session_notes").insert(feedback("Not these shoes", look.slot, "dislike", [look.items[at].id])).throwOnError();
    let judged = 0;
    const never: Judge = { judge: async () => (judged++, { verdict: "conflict", reasons: [{ about: "Outdoor wedding, November", ok: false, why: "Not right for it" }], costUsd: 0 }) };
    const after = looksOf(await buildLooks({ ...deps(), judge: never }, guest.id, session)).find((l) => l.slot === look.slot)!;
    expect(after.id).toBe(look.id);
    expect(after.note).toBe("No other shoes fit everything you've asked for, so these stay.");
    const tried = judged;
    expect(tried).toBeGreaterThan(0);
    await buildLooks({ ...deps(), judge: never }, guest.id, session);
    expect(judged).toBe(tried);
    const profileAfter = await Promise.all([
      db.from("saved_preferences").select("*").eq("user_id", guest.id).order("id").throwOnError(),
      db.from("profiles").select("departments, style_words, sizes, budget_amount_cents, budget_meaning, budget_max_cents").eq("user_id", guest.id).throwOnError(),
    ]);
    expect(profileAfter.map((r) => r.data)).toEqual(profileBefore.map((r) => r.data));
  }, 60_000);

  it("a session exception lets a saved preference be broken for this session only, ends with the session, and never changes the profile (5c, R57)", async () => {
    const prefs = () => db.from("saved_preferences").select("id, kind, words, rule").eq("user_id", guest.id).order("id").throwOnError();
    const before = (await prefs()).data!;
    const heels = before.find((p) => p.kind === "never")!;
    const likes = before.find((p) => p.kind === "likes")!;
    const ruled = async () => (await lookRequirements(db, guest.id, session)).rules.some((r) => r.id === heels.id);
    expect(await ruled()).toBe(true);
    await db.from("session_notes").insert(wedding()).throwOnError();
    looksOf(await buildLooks(deps(), guest.id, session));

    const allowed = [{ id: heels.id, kind: "never", words: "high heels", text: "High heels allowed for this session. Your profile still says Never: high heels." }];
    expect(await allowException(db, guest.id, session, heels.id)).toEqual(allowed);
    expect(await allowException(db, guest.id, session, heels.id)).toEqual(allowed);
    expect(await ruled()).toBe(false);
    // The looks are checked again on the new requirements.
    const { stages, emit } = stagesOf();
    looksOf(await buildLooks(deps(), guest.id, session, emit));
    expect(stages).toContain("updating");
    // Not for another guest, and not for a Like.
    expect(await allowException(db, "00000000-0000-0000-0000-000000000000", session, heels.id)).toBeNull();
    expect(await allowException(db, guest.id, session, likes.id)).toBeNull();
    // Remove: it limits the looks again.
    expect(await removeException(db, guest.id, session, heels.id)).toEqual([]);
    expect(await ruled()).toBe(true);
    // An exception ends with the session, and the profile never changed (Phase 5 automated test).
    await allowException(db, guest.id, session, heels.id);
    await db.rpc("delete_session_data", { session }).throwOnError();
    expect((await db.from("session_exceptions").select("id").eq("session_id", session)).data).toEqual([]);
    expect((await prefs()).data).toEqual(before);
  }, 60_000);

  it("once high heels are asked for and allowed, only each look's shoes change to heels; taken back, they change back (fix plan 3 Q1, fix plan 6 Q1)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const catalog = createSampleCatalog(db);
    const heelsOn = async (looks: ShownLook[]) =>
      Promise.all(looks.map(async (l) => (await catalog.getProduct(l.items.find((i) => i.group === "shoes")!.id))?.details.heelCm ?? 0));
    // The pieces other than the shoes, by place: they stay as they were.
    const rest = (looks: ShownLook[]) => looks.map((l) => [l.slot, l.items.filter((i) => i.group !== "shoes").map((i) => i.id)]);
    const build = async () => {
      const stages: string[] = [];
      const looks = looksOf(await buildLooks(deps(), guest.id, session, (stage) => stages.push(stage)));
      return { looks, stages };
    };
    const before = (await build()).looks;
    expect(before).toHaveLength(3);
    expect((await heelsOn(before)).every((h) => h <= 5)).toBe(true);
    const heels = (await db.from("saved_preferences").select("id, kind, words").eq("user_id", guest.id).eq("kind", "never").single().throwOnError()).data!;
    const pref = { id: heels.id, kind: "never" as const, words: "high heels" };
    await allowException(db, guest.id, session, heels.id);
    const jotted = await jotWanted({ db }, guest.id, session, pref);
    const asked = jotted!.notes.find((n) => n.text === "High heels")!;
    expect(asked.status).toBe("confirmed");

    // Each look keeps its other pieces and gets high heels, like Change, with no whole new look built
    // (found on Sabine's iPhone in 5c, A.5: three new looks took 1 to 2 minutes).
    const after = await build();
    expect(after.stages).not.toContain("building");
    expect(after.stages).toContain("revising");
    expect((await heelsOn(after.looks)).every((h) => h > 5)).toBe(true);
    expect(rest(after.looks)).toEqual(rest(before));
    expect(after.looks.every((l) => l.change?.includes("(you asked for high heels)"))).toBe(true);
    // Asking again changes nothing more.
    const again = await build();
    expect(again.looks.map((l) => l.id)).toEqual(after.looks.map((l) => l.id));

    // The note removed (Sabine's answer to Q2 of fix plan 5): heels stay allowed, and the shoes change back.
    await touchSessionNote({ db }, guest.id, session, asked.id, "remove");
    const back = await build();
    expect(back.stages).not.toContain("building");
    expect((await heelsOn(back.looks)).every((h) => h <= 5)).toBe(true);
    expect(rest(back.looks)).toEqual(rest(before));

    // Asked and allowed again, then Remove on the "This session only" line, which takes the note back too:
    // Never: high heels applies again, and only the shoes change.
    await jotWanted({ db }, guest.id, session, pref);
    expect((await heelsOn((await build()).looks)).every((h) => h > 5)).toBe(true);
    await removeException(db, guest.id, session, heels.id);
    await jotWanted({ db }, guest.id, session, pref, false);
    const removed = await build();
    expect(removed.stages).not.toContain("building");
    expect((await heelsOn(removed.looks)).every((h) => h <= 5)).toBe(true);
    expect(rest(removed.looks)).toEqual(rest(before));
  }, 120_000);

  it("a build stops once the session ends, and saves nothing more (5c fix 6)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    // The session ends while the looks builder is working (Sabine ended one during a 30-second build).
    const fake = createFakeLooksBuilder();
    const ending: LooksBuilder = {
      build: async (input) => {
        await db.from("sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", session).throwOnError();
        return fake.build(input);
      },
    };
    await expect(buildLooks(deps(ending), guest.id, session)).rejects.toBeInstanceOf(SessionEndedError);
    const { data } = await db.from("looks").select("id").eq("session_id", session).throwOnError();
    expect(data).toEqual([]);
  });

  it("Save to my profile takes the preference off the profile, with its exception (5c, Q2)", async () => {
    try {
      const heels = (await db.from("saved_preferences").select("id").eq("user_id", guest.id).eq("kind", "never").single().throwOnError()).data!;
      // Only for a preference allowed in this session.
      expect(await saveExceptionToProfile(db, guest.id, session, heels.id)).toBeNull();
      await allowException(db, guest.id, session, heels.id);
      const saved = await saveExceptionToProfile(db, guest.id, session, heels.id);
      expect(saved?.exceptions).toEqual([]);
      expect(saved?.preferences).toEqual(["Must have: sleeves", "Likes: earth tones"]);
      expect((await db.from("saved_preferences").select("id").eq("id", heels.id)).data).toEqual([]);
    } finally {
      await savePreferences(guest.db, SAMPLE_PROFILE.preferences);
    }
  }, 60_000);

  it("Undo feedback brings back the look before the revision, checked first, and takes back its feedback (5c, R51)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    const at = look.items.findIndex((i) => i.group === "shoes");
    await db.from("session_notes").insert(feedback("Not these shoes", look.slot, "dislike", [look.items[at].id])).throwOnError();
    const revised = looksOf(await buildLooks(deps(), guest.id, session)).find((l) => l.slot === look.slot)!;
    expect(revised.canUndo).toBe(true);
    expect(revised.earlier).toBe(true);
    // Compare lists the earlier version and what's different.
    const history = await lookHistory(deps(), guest.id, session, revised.id);
    expect(history?.earlier.map((e) => [e.items.map((i) => i.id), e.differences])).toEqual([[look.items.map((i) => i.id), ["Different shoes"]]]);

    const undone = await restoreLook(deps(), guest.id, session, revised.id, { undo: true });
    if (!undone || !("look" in undone)) throw new Error(JSON.stringify(undone));
    expect(undone.look.items.map((i) => i.id)).toEqual(look.items.map((i) => i.id));
    expect(undone.look.id).not.toBe(look.id);
    expect(undone.takeBack).toHaveLength(1);
    const notes = await takeBackFeedback({ db }, guest.id, session, undone.takeBack);
    expect(notes?.notes.some((n) => n.text === "Not these shoes")).toBe(false);
    // The look that came back isn't revised again, and it can be compared with the revision.
    const after = looksOf(await buildLooks(deps(), guest.id, session)).find((l) => l.slot === look.slot)!;
    expect(after.id).toBe(undone.look.id);
    expect(after.canUndo).toBe(false);
    expect((await lookHistory(deps(), guest.id, session, after.id))?.earlier[0].items[at].id).toBe(revised.items[at].id);
  }, 90_000);

  it("an earlier look that no longer fits stays out, and the answer says why (5c, R51)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    const at = look.items.findIndex((i) => i.group === "shoes");
    const old = look.items[at].id;
    await db.from("session_notes").insert(feedback("Not these shoes", look.slot, "dislike", [old])).throwOnError();
    const revised = looksOf(await buildLooks(deps(), guest.id, session)).find((l) => l.slot === look.slot)!;
    // The judgment step now turns the old shoes down.
    const judge = createFakeJudge();
    const picky: Judge = { judge: (input) => (input.items.some((i) => "product" in i && i.product.id === old) ? Promise.resolve({ verdict: "conflict", reasons: [{ about: "Elegant", ok: false, why: "The shoes aren't elegant" }], costUsd: 0 }) : judge.judge(input)) };
    const answer = await restoreLook({ ...deps(), judge: picky }, guest.id, session, revised.id, { undo: true });
    expect(answer).toEqual({ none: "That earlier look no longer fits everything you've asked for (The shoes aren't elegant), so this one stays." });
    expect((await currentLooks(deps(), guest.id, session)).find((l) => l.slot === look.slot)?.id).toBe(revised.id);
    // Undo is only for a revision, and a look that isn't the guest's isn't found.
    expect(await restoreLook(deps(), guest.id, session, look.id, { undo: true })).toEqual({ stale: true });
    expect(await restoreLook(deps(), "00000000-0000-0000-0000-000000000000", session, revised.id, { undo: true })).toBeNull();
  }, 90_000);

  it("when the checks can't run, the look says so and tries again next time (5c, Q4)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    const [look] = looksOf(await buildLooks(deps(), guest.id, session));
    const at = look.items.findIndex((i) => i.group === "shoes");
    await db.from("session_notes").insert(feedback("Not these shoes", look.slot, "dislike", [look.items[at].id])).throwOnError();
    let judged = 0;
    const failing: Judge = { judge: async () => (judged++, { verdict: "needs_clarification", reasons: [{ about: "Judgment", ok: false, why: "The check couldn't be completed" }], costUsd: 0 }) };
    const after = looksOf(await buildLooks({ ...deps(), judge: failing }, guest.id, session)).find((l) => l.slot === look.slot)!;
    expect(after.note).toBe("The new shoes couldn't be checked just now, so these stay. Try again in a moment.");
    const tried = judged;
    const again = looksOf(await buildLooks(deps(), guest.id, session)).find((l) => l.slot === look.slot)!;
    expect(judged).toBe(tried);
    expect(again.id).not.toBe(look.id);
    expect(again.note).toBeNull();
  }, 90_000);

  it("looks and their checks are deleted when the session ends (R63)", async () => {
    await db.from("session_notes").insert(wedding()).throwOnError();
    await buildLooks(deps(), guest.id, session);
    await db.rpc("delete_session_data", { session }).throwOnError();
    expect((await db.from("looks").select("id").eq("session_id", session)).data).toEqual([]);
    expect((await db.from("check_results").select("id").eq("session_id", session)).data).toEqual([]);
  });
});
