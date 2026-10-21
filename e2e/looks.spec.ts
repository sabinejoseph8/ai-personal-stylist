import { expect, type Page, test } from "@playwright/test";
import { SAMPLE_PROFILE } from "../lib/profile";
import { SAMPLE_PHRASES } from "../lib/sample-phrases";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { commandsSent, fakeMicrophone, playInCall, scriptDone } from "./support/microphone";

// 4c: the look panels with the fake engine, notes reader, looks builder and judge (playwright.config.ts):
// what's needed before looks appear (R39), three checked looks with totals and reasons (R40 to R42,
// R55), Swap by touch and by voice (R43), and a changed budget bringing them up to date (R44, R58).
// Phase 4's end-to-end test: with the sample profile, no look shows high heels across 10 swaps (S13).
test.describe("the looks", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  const notebookOf = (page: Page) => page.getByRole("region", { name: "My Styling Notes" });
  const note = (page: Page, text: string) => notebookOf(page).getByRole("button", { name: new RegExp(`^${text.replace(/[$]/g, "\\$")} (To confirm|Confirmed)$`) });
  const looksOf = (page: Page) => page.getByRole("region", { name: "Your looks" });
  const panels = (page: Page) => looksOf(page).getByRole("article");
  const sent = async (page: Page, name: string) => (await commandsSent(page)).filter((c) => c.name === name).map((c) => String(c.value));

  async function confirm(page: Page, text: string) {
    await note(page, text).click();
    await notebookOf(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(note(page, text)).toHaveAccessibleName(`${text} Confirmed`);
  }

  /** A call with the wedding notes, and the occasion and budget confirmed. */
  async function weddingLooks(page: Page) {
    await fakeMicrophone(page, "allowed", true);
    await page.goto("/session");
    await expect(looksOf(page)).toContainText("Looks appear here once you tell the stylist the occasion.");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect.poll(() => scriptDone(page)).toBe(true);
    await page.getByRole("button", { name: `“${SAMPLE_PHRASES[0]}”` }).click();
    await expect(note(page, "Outdoor wedding, November")).toBeVisible();
    await expect(looksOf(page)).toContainText("Confirm the occasion to see looks");
    await confirm(page, "Outdoor wedding, November");
    await expect(looksOf(page)).toContainText("Confirm your budget to see looks");
    await confirm(page, "Budget: up to $500");
    await expect(panels(page)).toHaveCount(3, { timeout: 20_000 });
  }

  /** The heel height of each pair of shoes on screen, from the catalog. */
  async function heelsOnScreen() {
    const { data: looks } = await serverDb().from("looks").select("items").eq("user_id", guest.id).eq("status", "published").throwOnError();
    const ids = (looks ?? []).flatMap((l) => (l.items as { kind: string; productId?: string }[]).flatMap((i) => (i.productId ? [i.productId] : [])));
    const { data } = await serverDb().from("catalog_products").select("category, attributes").in("id", ids).throwOnError();
    return (data ?? []).filter((p) => p.category === "shoes").map((p) => (p.attributes as { heel_cm?: number }).heel_cm);
  }

  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
    // The sample profile, as Use a sample profile saves it (lib/profile-store.ts is server-only).
    const { departments, styleWords, sizes, budget, preferences } = SAMPLE_PROFILE;
    await guest.db
      .from("profiles")
      .upsert({ user_id: guest.id, departments, style_words: styleWords, sizes, budget_meaning: budget?.meaning ?? null, budget_amount_cents: budget ? budget.amount * 100 : null }, { onConflict: "user_id" })
      .throwOnError();
    await guest.db.rpc("replace_saved_preferences", { items: preferences.map((p) => ({ kind: p.kind, words: p.words, rule: p.rule ?? null })) }).throwOnError();
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    const db = serverDb();
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    await db.from("usage").delete().eq("user_id", guest.id).throwOnError();
    await db.from("rate_limits").delete().eq("user_id", guest.id).throwOnError();
    await context.addCookies(shared.cookies);
  });

  test("once the occasion and budget are confirmed, three checked looks appear with totals and reasons (R39 to R42, R55)", async ({ page }) => {
    await weddingLooks(page);
    for (const [i, panel] of (await panels(page).all()).entries()) {
      await expect(panel).toContainText(`Look ${i + 1} of 3`);
      await expect(panel).toContainText("to buy, owned items not included");
      await expect(panel).toContainText("under your $500 limit");
      await expect(panel).toContainText("Checked against your preferences");
      await expect(panel.getByText("Sample product").first()).toBeVisible();
      await expect(panel.getByRole("button", { name: /^Swap / }).first()).toBeEnabled();
    }
    // She's told the looks, and asked to present them in her own words once nobody is talking (Q4 in 4c).
    await expect.poll(() => sent(page, "sendPhrase")).toContain("Can you walk me through the looks you've put together?");
    const context = (await sent(page, "updateContext")).at(-1);
    expect(context).toContain('Look 1, "Test look 1"');
    expect(context).toContain("keep it short: each look's name and one line about it");
    await noSeriousA11yProblems(page);
  });

  test("swapping the shoes ten times never brings high heels, each new pair marked New (R43, S13)", async ({ page }) => {
    test.setTimeout(150_000);
    await weddingLooks(page);
    const first = panels(page).first();
    for (let n = 0; n < 10; n++) {
      const swap = first.getByRole("button", { name: /^Swap / }).nth(1);
      const before = await swap.getAttribute("aria-label");
      await swap.click();
      await expect(first.getByRole("button", { name: /^Swap / }).nth(1)).not.toHaveAttribute("aria-label", before!, { timeout: 15_000 });
      await expect(first.getByText("New", { exact: true })).toBeVisible();
      for (const heel of await heelsOnScreen()) expect(heel).toBeLessThanOrEqual(5);
    }
    await expect(first).toContainText("Checked against your preferences");
  });

  test("saying \"show me different shoes\" swaps them in the look on screen (Q2 in 4c)", async ({ page }) => {
    await weddingLooks(page);
    const first = panels(page).first();
    await first.scrollIntoViewIfNeeded();
    const before = await first.getByRole("button", { name: /^Swap / }).nth(1).getAttribute("aria-label");
    await playInCall(page, { type: "words", speaker: "shopper", text: "Can you show me different shoes", final: true, turnId: "s1" });
    await expect(first.getByText("New", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(first.getByRole("button", { name: /^Swap / }).nth(1)).not.toHaveAttribute("aria-label", before!);
  });

  test("a changed budget brings the looks up to date, and every one fits it (R44, R58)", async ({ page }) => {
    await weddingLooks(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "Actually, make my budget $350", final: true, turnId: "b1" });
    await expect(notebookOf(page).getByText("Budget: up to $350", { exact: true })).toBeVisible();
    // Still confirmed after a clear correction, so the looks are checked again on the new budget.
    await expect(panels(page).first()).toContainText(/Needs a new check|under your \$350 limit/, { timeout: 15_000 });
    await expect(async () => {
      const all = await panels(page).all();
      expect(all.length).toBeGreaterThan(0);
      for (const panel of all) {
        await expect(panel).toContainText(/under your \$350 limit|Right at your \$350 limit/);
        await expect(panel).toContainText("Checked against your preferences");
      }
    }).toPass({ timeout: 30_000 });
    // She says what changed (R44).
    await expect.poll(() => sent(page, "sendPhrase")).toContain("What changed in my looks?");
    expect((await sent(page, "updateContext")).at(-1)).toContain("After the shopper's change");
  });
});
