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
// 4d: Behind the scenes (R72). 5a: feedback by Keep and Change, and by voice, jotted under its look (R46, R47).
// 5b: feedback revises its look, with the pieces kept and a change summary (R48, R50).
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
    // The page asks 1.2 seconds after a change, and may wait its turn behind a build (4d).
    await expect(looksOf(page)).toContainText("Confirm the occasion to see looks", { timeout: 10_000 });
    await confirm(page, "Outdoor wedding, November");
    await expect(looksOf(page)).toContainText("Confirm your budget to see looks", { timeout: 10_000 });
    await confirm(page, "Budget: up to $500");
    await expect(panels(page)).toHaveCount(3, { timeout: 20_000 });
    // Nothing is needed any more (found on Sabine's iPhone in 4c).
    await expect(looksOf(page)).not.toContainText("to see looks");
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

  test("Behind the scenes shows what was captured and each check, a blocked candidate only as its reason (R72)", async ({ page }) => {
    await fakeMicrophone(page, "allowed", true);
    await page.goto("/session");
    await page.getByRole("button", { name: "Behind the scenes" }).click();
    const panel = page.getByRole("dialog", { name: "Behind the scenes" });
    await expect(panel).toContainText("Start a conversation, and what the stylist captures and checks appears here.");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect.poll(() => scriptDone(page)).toBe(true);
    await page.getByRole("button", { name: `“${SAMPLE_PHRASES[0]}”` }).click();
    await expect(note(page, "Outdoor wedding, November")).toBeVisible();
    // A tight budget, so the checker blocks some candidates.
    await playInCall(page, { type: "words", speaker: "shopper", text: "Actually, make my budget $250", final: true, turnId: "b1" });
    await expect(note(page, "Budget: up to $250")).toBeVisible();
    await confirm(page, "Outdoor wedding, November");
    await confirm(page, "Budget: up to $250");
    await expect(panels(page).first()).toBeVisible({ timeout: 20_000 });
    // The looks on screen, read before the panel covers the page.
    const shown = await panels(page).getByRole("heading", { level: 3 }).allTextContents();

    await page.getByRole("button", { name: "Behind the scenes" }).click();
    await expect(panel).toContainText(/Right now \d+ of \d+ womenswear sample products fit everything you've asked for\./);
    await expect(panel).toContainText("Captured: Outdoor wedding, November. From what you said. Confirmed by you with a tap.");
    await expect(panel).toContainText("Captured: Elegant. From what you said. Not confirmed yet.");
    await expect(panel).toContainText(/Check passed: Look 1, Test look \d\. It meets Never: high heels/);
    await expect(panel).toContainText(/Check blocked a candidate: \$\d+ over your \$250 limit\./);
    // The blocked looks' names never appear: only shown looks are named.
    for (const name of (await panel.innerText()).match(/Test look \d/g) ?? []) expect(shown).toContain(name);
    await noSeriousA11yProblems(page);
  });

  test("Keep and Change, and spoken feedback, are jotted under the look, and changes revise it (5a, 5b, R46 to R48)", async ({ page }) => {
    // Looks, then two revisions: more than the usual 30 seconds.
    test.slow();
    await weddingLooks(page);
    const first = panels(page).first();
    const tiles = first.getByRole("listitem");
    const read = () => tiles.evaluateAll((els) => els.map((el) => [...el.querySelectorAll("p")].slice(0, 2).map((p) => p.textContent ?? "")));
    const before = await read();
    const [dress, bag] = [before.find(([, kind]) => kind === "Dress")![0], before.find(([, kind]) => kind === "Bag")![0]];
    const feedback = notebookOf(page).getByRole("list", { name: "Feedback on Look 1" });

    // Keep, and pressing it again takes it back. Keep on its own changes nothing.
    await first.getByRole("button", { name: `Keep ${bag}` }).click();
    await expect(first.getByRole("button", { name: `Keeping ${bag}` })).toHaveAttribute("aria-pressed", "true");
    await expect(feedback.getByRole("button", { name: new RegExp(`^Keep the ${bag.toLowerCase()} Confirmed$`, "i") })).toBeVisible();
    await first.getByRole("button", { name: `Keeping ${bag}` }).click();
    await expect(notebookOf(page).getByRole("list", { name: "Feedback on Look 1" })).toHaveCount(0);

    // Change on a kept piece takes back Keep, then revises the look (5b).
    await first.getByRole("button", { name: `Keep ${dress}` }).click();
    await expect(first.getByRole("button", { name: `Keeping ${dress}` })).toHaveAttribute("aria-pressed", "true");
    // Straight away: taps are saved in the order they're made, so Change wins.
    await first.getByRole("button", { name: `Change ${dress}` }).click();
    await expect(feedback.getByRole("button")).toHaveCount(1);
    await expect(feedback).toContainText(/Change the/i);
    await expect(first).toContainText(`Changed: ${dress} to `, { timeout: 20_000 });
    const newDress = (await read()).find(([, kind]) => kind === "Dress")![0];
    expect(newDress).not.toBe(dress);

    // Spoken, about the look on screen: keep the new dress and the bag, and lower heels revises the shoes.
    await first.scrollIntoViewIfNeeded();
    await playInCall(page, { type: "words", speaker: "shopper", text: "Keep the dress and bag, and lower heels please", final: true, turnId: "f1" });
    await expect(feedback).toContainText("Keep the dress and bag", { timeout: 10_000 });
    await expect(feedback).toContainText("Lower heels, this look only");
    await expect(first).toContainText("(you asked for lower heel)", { timeout: 20_000 });
    await expect(first.getByRole("button", { name: `Keeping ${newDress}` })).toBeVisible();
    await expect(first.getByRole("button", { name: `Keeping ${bag}` })).toBeVisible();
    // Feedback never makes the looks need a new check.
    await expect(panels(page).first()).toContainText("Checked against your preferences");
    await expect(page.getByText("Needs a new check")).toHaveCount(0);
    expect((await sent(page, "updateContext")).at(-1)).toContain("Feedback the shopper has given");
    await noSeriousA11yProblems(page);
  });

  test("Change on a piece revises its look: the new piece marked New, the rest kept, and a change summary (5b, R48, R50)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    const first = panels(page).first();
    const tiles = first.getByRole("listitem");
    const read = () => tiles.evaluateAll((els) => els.map((el) => [...el.querySelectorAll("p")].slice(0, 2).map((p) => p.textContent ?? "")));
    const before = await read();
    const at = before.findIndex(([, kind]) => kind === "Shoes");
    const shoes = before[at][0];
    await first.getByRole("button", { name: `Change ${shoes}` }).click();
    await expect(first).toContainText(new RegExp(`Changed: ${shoes.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} to .+\\. Kept: .+\\. New total: \\$`), { timeout: 20_000 });
    const after = await read();
    expect(after[at][0]).not.toBe(shoes);
    expect(after.filter((_, i) => i !== at)).toEqual(before.filter((_, i) => i !== at));
    await expect(tiles.nth(at)).toContainText("New");
    await expect(first).toContainText("Checked against your preferences");
    // The stylist hears what changed, to say it briefly.
    await expect.poll(async () => (await sent(page, "updateContext")).at(-1) ?? "").toContain("revised from the shopper's feedback");
    await noSeriousA11yProblems(page);
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
