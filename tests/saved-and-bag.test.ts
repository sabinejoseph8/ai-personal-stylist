import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { createFakeLooksBuilder } from "@/core/looks/builder";
import { createFakeJudge, type Judge } from "@/core/looks/judge";
import { MAX_SAVED_LOOKS } from "@/core/looks/saved";
import type { ShownLook } from "@/core/looks/shown";
import { addToBag, changeSize, listBag, removeFromBag } from "@/lib/bag-service";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { buildLooks, type LooksDeps } from "@/lib/looks-service";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import { listSaved, openSaved, removeSaved, saveLook } from "@/lib/saved-looks-service";
import { POST as checkout } from "@/app/api/bag/checkout/route";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 6a: saved looks and the demo bag (R60 to R62), against the database with the fake builder and judge.
// Phase 6 automated test: the bag refuses owned items and items without a passing check, and the server
// refuses checkout. Save look and Add to bag take only a look whose check passed on the current
// requirements (Sabine's answer to Q3); Open checks a saved look against the saved profile (Q1).

describe.skipIf(!canRunDatabaseTests)("saved looks and the demo bag", () => {
  const db = serverDb();
  let guest: TestGuest;
  let other: TestGuest;
  let session: string;
  const guard = createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd: 1, monthlyClaudeUsd: 1e6, monthlyOpenaiUsd: 1e6, monthlyVideoSeconds: 1e9 });
  const deps = (judge: Judge = createFakeJudge()): LooksDeps => ({ db, catalog: createSampleCatalog(db), guard, builder: createFakeLooksBuilder(), judge });
  const note = (kind: string, text: string, details: [string, string][] = []) => ({
    user_id: guest.id,
    session_id: session,
    kind,
    note_text: text,
    status: "confirmed",
    hidden_details: details.map(([name, value]) => ({ name, value })),
    source: "voice",
  });
  const looksNow = async (): Promise<ShownLook[]> => {
    const r = await buildLooks(deps(), guest.id, session);
    if (!r || !("looks" in r)) throw new Error(JSON.stringify(r));
    return r.looks;
  };
  const products = (look: ShownLook) => look.items.filter((i) => !i.owned);

  beforeAll(async () => {
    [guest, other] = await Promise.all([createTestGuest(), createTestGuest()]);
    const { budget, preferences, ...shopping } = SAMPLE_PROFILE;
    await saveShopping(guest.db, guest.id, shopping);
    await saveBudget(guest.db, guest.id, budget);
    await savePreferences(guest.db, preferences);
  }, 30_000);
  beforeEach(async () => {
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    await db.from("saved_looks").delete().eq("user_id", guest.id).throwOnError();
    await db.from("bag_items").delete().eq("user_id", guest.id).throwOnError();
    session = (await db.from("sessions").insert({ user_id: guest.id, status: "active" }).select("id").single().throwOnError()).data!.id;
    await db
      .from("session_notes")
      .insert([
        note("occasion", "Outdoor wedding, November", [["event", "wedding"], ["month", "november"]]),
        note("budget", "Budget: up to $350", [["max", "350"]]),
        note("outfit", "Dress", [["outfit", "dress"]]),
      ])
      .throwOnError();
  });
  afterAll(async () => Promise.all([guest?.remove(), other?.remove()]));

  it("Save look keeps a checked look once, and the list shows it (R60)", async () => {
    const [look] = await looksNow();
    expect(look.items.some((i) => i.sizes?.length)).toBe(true);
    const first = await saveLook(deps(), guest.id, session, look.id);
    const again = await saveLook(deps(), guest.id, session, look.id);
    if (!first || !("saved" in first)) throw new Error(JSON.stringify(first));
    expect(again).toEqual(first);
    const list = await listSaved(db, guest.id);
    expect(list.map((l) => l.id)).toEqual([first.saved.id]);
    expect(list[0].name).toBe(look.name);
    expect(list[0].items.map((i) => i.id)).toEqual(look.items.map((i) => i.id));
    // Not the guest's look, or not on screen: nothing to save.
    expect(await saveLook(deps(), other.id, session, look.id)).toBeNull();
    expect(await removeSaved(db, other.id, first.saved.id)).toBe(false);
    expect(await removeSaved(db, guest.id, first.saved.id)).toBe(true);
    expect(await listSaved(db, guest.id)).toEqual([]);
  }, 60_000);

  it("a look that needs a new check can't be saved or go in the bag (R54, Q3)", async () => {
    const [look] = await looksNow();
    await db.from("looks").update({ status: "needs_check" }).eq("id", look.id).throwOnError();
    expect(await saveLook(deps(), guest.id, session, look.id)).toEqual({ stale: true });
    const [p] = products(look);
    expect(await addToBag(deps(), guest.id, session, look.id, [{ productId: p.id, size: p.sizes![0] }])).toEqual({ stale: true });
    // A published look whose check didn't pass isn't taken either.
    await db.from("looks").update({ status: "published" }).eq("id", look.id).throwOnError();
    await db.from("check_results").update({ verdict: "conflict" }).eq("look_id", look.id).throwOnError();
    expect(await addToBag(deps(), guest.id, session, look.id, [{ productId: p.id, size: p.sizes![0] }])).toEqual({ stale: true });
    expect(await listBag(deps(), guest.id)).toEqual([]);
  }, 60_000);

  it("stops at 30 saved looks", async () => {
    const [look] = await looksNow();
    const copy = { name: "Old", reason: "", refs: [], items: [], owned: [], totalCents: 0 };
    await db
      .from("saved_looks")
      .insert(Array.from({ length: MAX_SAVED_LOOKS }, (_, n) => ({ user_id: guest.id, look: copy, items_key: `old:${n}` })))
      .throwOnError();
    expect(await saveLook(deps(), guest.id, session, look.id)).toEqual({ full: true });
  }, 60_000);

  it("Open checks a saved look against the saved profile first, and says why when it no longer fits (R60, Q1)", async () => {
    const [look] = await looksNow();
    const saved = await saveLook(deps(), guest.id, session, look.id);
    if (!saved || !("saved" in saved)) throw new Error(JSON.stringify(saved));
    const opened = await openSaved(deps(), guest.id, saved.saved.id);
    if (!opened || !("look" in opened)) throw new Error(JSON.stringify(opened));
    expect(opened.look.items.map((i) => i.id)).toEqual(look.items.map((i) => i.id));
    expect(opened.look.total.totalCents).toBe(look.total.totalCents);
    // The judgment step now turns it down.
    const picky: Judge = { judge: async () => ({ verdict: "conflict", reasons: [{ about: "Elegant", ok: false, why: "Not elegant enough" }], costUsd: 0 }) };
    expect(await openSaved(deps(picky), guest.id, saved.saved.id)).toEqual({ none: "This look no longer fits your preferences (Not elegant enough)." });
    // The day's AI is used up: it says so, and shows nothing unchecked.
    const noAi: LooksDeps = { ...deps(), guard: { ...guard, checkAi: async () => ({ ok: false as const, reason: "daily_ai_used" as const }) } };
    expect(await openSaved(noAi, guest.id, saved.saved.id)).toEqual({ none: "You've reached today's limit for the demo, so it can't be checked again today." });
    // The hourly allowance says no: limited.
    expect(await openSaved(deps(), guest.id, saved.saved.id, { allowAi: async () => false })).toEqual({ limited: true });
    expect(await openSaved(deps(), other.id, saved.saved.id)).toBeNull();
  }, 60_000);

  it("Add to bag takes the look's sample products in a size they come in, once each, and checkout is refused (R61, R62)", async () => {
    const [look] = await looksNow();
    const [a, b] = products(look);
    const sizeOf = (i: typeof a) => i.size ?? i.sizes![0];
    const added = await addToBag(deps(), guest.id, session, look.id, [
      { productId: a.id, size: sizeOf(a) },
      { productId: b.id, size: sizeOf(b) },
    ]);
    if (!added || !("items" in added)) throw new Error(JSON.stringify(added));
    expect(added.items.map((i) => i.productId).sort()).toEqual([a.id, b.id].sort());
    // Every row records the passing check that let it in.
    const { data: rows } = await db.from("bag_items").select("check_result_id").eq("user_id", guest.id).throwOnError();
    expect(rows!.every((r) => r.check_result_id)).toBe(true);
    // Adding it again changes nothing but the size.
    const again = await addToBag(deps(), guest.id, session, look.id, [{ productId: a.id, size: a.sizes!.at(-1)! }]);
    if (!again || !("items" in again)) throw new Error(JSON.stringify(again));
    expect(again.items).toHaveLength(2);
    expect(again.items.find((i) => i.productId === a.id)?.size).toBe(a.sizes!.at(-1));
    // The same product twice in one request: one row, in the last size (6d review).
    const twice = await addToBag(deps(), guest.id, session, look.id, [
      { productId: a.id, size: a.sizes!.at(-1)! },
      { productId: a.id, size: a.sizes![0] },
    ]);
    if (!twice || !("items" in twice)) throw new Error(JSON.stringify(twice));
    expect(twice.items.filter((i) => i.productId === a.id)).toHaveLength(1);
    expect(twice.items.find((i) => i.productId === a.id)?.size).toBe(a.sizes![0]);
    // A size it doesn't come in, a piece not in the look.
    expect(await addToBag(deps(), guest.id, session, look.id, [{ productId: a.id, size: "XXXL" }])).toEqual({ refused: "size" });
    expect(await addToBag(deps(), guest.id, session, look.id, [{ productId: "00000000-0000-0000-0000-000000000000", size: "M" }])).toEqual({ refused: "not_in_look" });
    // Change a size, and remove a piece, for the guest's own bag only.
    const item = again.items.find((i) => i.productId === b.id)!;
    expect(await changeSize(deps(), guest.id, item.id, "XXXL")).toBe(false);
    expect(await changeSize(deps(), other.id, item.id, item.sizes[0])).toBeNull();
    const changed = await changeSize(deps(), guest.id, item.id, item.sizes[0]);
    expect(changed && changed.find((i) => i.id === item.id)?.size).toBe(item.sizes[0]);
    expect(await removeFromBag(db, other.id, item.id)).toBe(false);
    expect(await removeFromBag(db, guest.id, item.id)).toBe(true);
    expect(await listBag(deps(), guest.id)).toHaveLength(1);
    // Checkout: always refused by the server.
    const res = await checkout();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Demo only: these sample products can't be bought." });
  }, 60_000);

  it("the shopper's own pieces can't go in the bag, and a saved look keeps them by name (R61, Q2)", async () => {
    const { data: item } = await db.from("wardrobe_items").insert({ user_id: guest.id, name: "Navy wool blazer", category: "outerwear", styling: true, draft: false }).select("id").single().throwOnError();
    const [look] = await looksNow();
    // Put the wardrobe piece in the look, with a passing check of the look as it is now.
    const { data: row } = await db.from("looks").select("items, requirements_key").eq("id", look.id).single().throwOnError();
    await db.from("looks").update({ items: [...row!.items, { kind: "wardrobe", itemId: item!.id }] }).eq("id", look.id).throwOnError();
    await db.rpc("record_check", { look: look.id, verdict: "pass", reasons: [], requirements_key: row!.requirements_key }).throwOnError();
    expect(await addToBag(deps(), guest.id, session, look.id, [{ productId: item!.id, size: "M" }])).toEqual({ refused: "owned" });
    const saved = await saveLook(deps(), guest.id, session, look.id);
    if (!saved || !("saved" in saved)) throw new Error(JSON.stringify(saved));
    expect(saved.saved.items.find((i) => i.id === item!.id)).toMatchObject({ owned: true, name: "Navy wool blazer" });
  }, 60_000);

  it("guests read only their own saved looks and bag, and can't write either (review batch 5, E2)", async () => {
    const [look] = await looksNow();
    const saved = await saveLook(deps(), guest.id, session, look.id);
    const [p] = products(look);
    await addToBag(deps(), guest.id, session, look.id, [{ productId: p.id, size: p.size ?? p.sizes![0] }]);
    expect(saved && "saved" in saved).toBe(true);
    expect((await guest.db.from("saved_looks").select("id")).data).toHaveLength(1);
    expect((await guest.db.from("bag_items").select("id")).data).toHaveLength(1);
    expect((await other.db.from("saved_looks").select("id")).data).toEqual([]);
    expect((await other.db.from("bag_items").select("id")).data).toEqual([]);
    expect((await guest.db.from("saved_looks").insert({ user_id: guest.id, look: {}, items_key: "planted" })).error).not.toBeNull();
    expect((await guest.db.from("bag_items").insert({ user_id: guest.id, product_id: p.id, size: "M" })).error).not.toBeNull();
  }, 60_000);
});
