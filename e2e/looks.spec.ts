import { expect, type Page, test } from "@playwright/test";
import { SAMPLE_PROFILE } from "../lib/profile";
import { SAMPLE_PHRASES } from "../lib/sample-phrases";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { fitsAtDoubleText, noSeriousA11yProblems, smallTouchTargets } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { commandsSent, fakeMicrophone, playInCall, scriptDone } from "./support/microphone";
import { openFromMenu } from "./support/menu";

// 4c: the look panels with the fake engine, notes reader, looks builder and judge (playwright.config.ts):
// what's needed before looks appear (R39), three checked looks with totals and reasons (R40 to R42,
// R55), Swap by touch and by voice (R43), and a changed budget bringing them up to date (R44, R58).
// Phase 4's end-to-end test: with the sample profile, no look shows high heels across 10 swaps (S13).
// 4d: Behind the scenes (R72). 5a: feedback by Keep and Change, and by voice, jotted under its look (R46, R47).
// 5b: feedback revises its look, with the pieces kept and a change summary (R48, R50). 5c: "This session
// only" exceptions (R57, S14), Undo feedback and Compare (R51). 6a: Save look and Saved looks (R60), and the
// demo bag with Checkout disabled (R61, R62, S16).
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
    // In a call, with notes and looks on screen: 44 px touch targets and 200% text (7a, R69).
    expect(await smallTouchTargets(page)).toEqual([]);
    await fitsAtDoubleText(page);
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
    await openFromMenu(page, "Behind the scenes");
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

    await openFromMenu(page, "Behind the scenes");
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

  test("asking for high heels with Never: high heels saved: the card asks first, Allow jots This session only, Remove takes it back (5c, R57, S14)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h1" });
    const card = looksOf(page).getByRole("group", { name: "Allow for this session?" });
    await expect(card).toContainText("Your profile says Never: high heels. Allow high heels for this session?", { timeout: 10_000 });
    // The stylist says the question word for word, and is told to wait for the answer (found on Sabine's
    // iPhone in 5c, A.3), and the request isn't jotted as a note.
    const question = "Your profile says never high heels. Shall I allow high heels for this session only, or keep your preference?";
    await expect.poll(() => sent(page, "say"), { timeout: 15_000 }).toContain(question);
    await expect.poll(async () => (await sent(page, "updateContext")).at(-1) ?? "").toContain("Wait for their answer");
    await expect(notebookOf(page).getByText(/high heels/i)).toHaveCount(1);
    // While her question waits, nothing else is said: a looks update after a budget change waits until
    // it's answered (found on Sabine's iPhone in 5c: she answered such a line with "Absolutely").
    const changed = async () => (await sent(page, "sendPhrase")).filter((t) => t === "What changed in my looks?").length;
    const before = await changed();
    await playInCall(page, { type: "words", speaker: "shopper", text: "Actually, make my budget $350", final: true, turnId: "b9" });
    await expect(panels(page).first()).toContainText(/under your \$350 limit/, { timeout: 20_000 });
    await page.waitForTimeout(7_000);
    expect(await changed()).toBe(before);
    await card.getByRole("button", { name: "Allow for this session" }).click();
    await expect.poll(changed, { timeout: 15_000 }).toBeGreaterThan(before);
    const exceptions = notebookOf(page).getByRole("list", { name: "This session only" });
    await expect(exceptions).toContainText("High heels allowed for this session. Your profile still says Never: high heels.");
    // What was asked for is jotted in ink, so the looks change to include it (fix plan 3, Q1).
    await expect(note(page, "High heels")).toHaveAccessibleName("High heels Confirmed");
    await expect(card).toHaveCount(0);
    // The profile still says Never: high heels (S14).
    await expect(notebookOf(page).getByRole("list", { name: "Saved preferences" })).toContainText("Never: high heels");
    await noSeriousA11yProblems(page);
    await exceptions.getByRole("button", { name: "Remove" }).click();
    await expect(exceptions).toHaveCount(0);
    await expect(note(page, "High heels")).toHaveCount(0);

    // Asked again, she asks in her own reply this time, so the app doesn't ask on top of her (fix plan 3).
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h2" });
    await playInCall(page, { type: "words", speaker: "stylist", text: question, final: true, turnId: "s2" });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(7_000);
    expect((await sent(page, "say")).filter((line) => line === question)).toHaveLength(1);
    // A spoken yes does what the button does (A.3 fix, Q1).
    await playInCall(page, { type: "words", speaker: "shopper", text: "Yes, allow it", final: true, turnId: "h3" });
    await expect(exceptions).toContainText("High heels allowed for this session.", { timeout: 10_000 });
    await expect(card).toHaveCount(0);
    await expect(note(page, "High heels")).toHaveAccessibleName("High heels Confirmed");
  });

  test("End clears the question and everything else the page held, so nothing carries into the next session (full code review, A4)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h1" });
    const card = looksOf(page).getByRole("group", { name: "Allow for this session?" });
    await expect(card).toBeVisible({ timeout: 10_000 });
    const question = "Your profile says never high heels. Shall I allow high heels for this session only, or keep your preference?";
    await expect.poll(() => sent(page, "say"), { timeout: 15_000 }).toContain(question);
    await page.getByRole("button", { name: "End", exact: true }).click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByRole("button", { name: "Start conversation" })).toBeVisible();
    await expect(card).toHaveCount(0);
    // The next session starts clean: no card, her question isn't said again, and nothing she's told
    // carries the old question or the old notes. (The fake call's log starts afresh with the new call.)
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    await expect.poll(() => scriptDone(page)).toBe(true);
    await playInCall(page, { type: "words", speaker: "shopper", text: "Hello again", final: true, turnId: "h9" });
    await expect.poll(async () => (await sent(page, "updateContext")).length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(7_000);
    await expect(card).toHaveCount(0);
    expect((await sent(page, "say")).filter((line) => line === question)).toHaveLength(0);
    const told = await sent(page, "updateContext");
    for (const context of told) {
      expect(context).not.toContain("Wait for their answer");
      expect(context).not.toContain("Outdoor wedding");
    }
  });

  test("Keep my preference tells her the answer was no, so she neither waits nor asks again (full code review, A8)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h1" });
    const card = looksOf(page).getByRole("group", { name: "Allow for this session?" });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await sent(page, "updateContext")).at(-1) ?? "").toContain("Wait for their answer");
    await card.getByRole("button", { name: "Keep my preference" }).click();
    await expect(card).toHaveCount(0);
    await expect.poll(async () => (await sent(page, "updateContext")).at(-1) ?? "").toContain("Kept: asked whether to allow high heels for this session, the shopper said no.");
    expect((await sent(page, "updateContext")).at(-1)).not.toContain("Wait for their answer");
    // Allowed after all: the kept line goes.
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h2" });
    await card.getByRole("button", { name: "Allow for this session" }).click({ timeout: 10_000 });
    await expect.poll(async () => (await sent(page, "updateContext")).at(-1) ?? "").toContain("This session only: the shopper allowed");
    expect((await sent(page, "updateContext")).at(-1)).not.toContain("Kept:");
  });

  test("asking again for high heels once allowed: jotted in ink with no card, though its note was removed (fix plan 5)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h1" });
    const card = looksOf(page).getByRole("group", { name: "Allow for this session?" });
    await card.getByRole("button", { name: "Allow for this session" }).click({ timeout: 10_000 });
    await expect(note(page, "High heels")).toHaveAccessibleName("High heels Confirmed");
    // Remove on the note takes back the request, not the permission (Sabine's answer to Q2).
    await note(page, "High heels").click();
    await notebookOf(page).getByRole("list", { name: "Notes" }).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(note(page, "High heels")).toHaveCount(0, { timeout: 10_000 });
    const exceptions = notebookOf(page).getByRole("list", { name: "This session only" });
    await expect(exceptions).toContainText("High heels allowed for this session.");
    // Asked for again, it's jotted in ink straight away, with no card or question (Q1). Found on Sabine's
    // iPhone in 5c, A.7: it was taken for Must have: sleeves, and the card asked to go without sleeves.
    const said = (await sent(page, "say")).length;
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h2" });
    await expect(note(page, "High heels")).toHaveAccessibleName("High heels Confirmed", { timeout: 10_000 });
    await page.waitForTimeout(7_000);
    await expect(card).toHaveCount(0);
    await expect(exceptions.getByRole("listitem")).toHaveCount(1);
    expect(await sent(page, "say")).toHaveLength(said);
  });

  test("once heels are allowed, each look's shoes change in place, and her looks line waits for the answer to her question (fix plan 6)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    const names = async () => Promise.all((await panels(page).all()).map((p) => p.getByRole("listitem").evaluateAll((els) => els.map((el) => el.querySelector("p")?.textContent ?? ""))));
    const before = await names();
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h1" });
    const card = looksOf(page).getByRole("group", { name: "Allow for this session?" });
    const changed = async () => (await sent(page, "sendPhrase")).filter((t) => t === "What changed in my looks?").length;
    const lines = await changed();
    await card.getByRole("button", { name: "Allow for this session" }).click({ timeout: 10_000 });
    // She asks the shopper something just as the looks change (found on Sabine's iPhone in 5c, A.5).
    await playInCall(page, { type: "words", speaker: "stylist", text: "Lovely! What heel height would you like?", final: true, turnId: "s1" });
    const asked = Date.now();
    // Only the shoes change, in place (Sabine's answer to Q1).
    await expect(async () => {
      const all = await panels(page).all();
      expect(all).toHaveLength(3);
      for (const panel of all) await expect(panel).toContainText("(you asked for high heels)");
    }).toPass({ timeout: 30_000 });
    const after = await names();
    for (const [i, look] of after.entries()) expect(look.filter((name) => !before[i].includes(name))).toHaveLength(1);
    // Her looks line waits for the shopper's answer.
    await page.waitForTimeout(Math.max(0, 9_000 - (Date.now() - asked)));
    expect(await changed()).toBe(lines);
    await playInCall(page, { type: "words", speaker: "shopper", text: "Something not too high", final: true, turnId: "h2" });
    await expect.poll(changed, { timeout: 15_000 }).toBeGreaterThan(lines);
  });

  test("after Remove, she's told heels were taken back, and saying they're allowed doesn't stop the question (fix plan 7)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h1" });
    const card = looksOf(page).getByRole("group", { name: "Allow for this session?" });
    await card.getByRole("button", { name: "Allow for this session" }).click({ timeout: 10_000 });
    const exceptions = notebookOf(page).getByRole("list", { name: "This session only" });
    await exceptions.getByRole("button", { name: "Remove" }).click({ timeout: 10_000 });
    await expect(exceptions).toHaveCount(0);
    // Found on Sabine's iPhone in 5c, A.9: with the permission's line just gone, she said heels were allowed.
    await expect.poll(async () => (await sent(page, "updateContext")).at(-1) ?? "").toContain("Taken back: the shopper took back allowing high heels.");
    const question = "Your profile says never high heels. Shall I allow high heels for this session only, or keep your preference?";
    const asked = async () => (await sent(page, "say")).filter((line) => line === question).length;
    const before = await asked();
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h2" });
    await expect(card).toBeVisible({ timeout: 10_000 });
    // Her reply says it's allowed rather than asking: the app asks, word for word.
    await playInCall(page, { type: "words", speaker: "stylist", text: "High heels are allowed for this session.", final: true, turnId: "s2" });
    await expect.poll(asked, { timeout: 15_000 }).toBe(before + 1);
  });

  test("a spoken yes read twice jots High heels once, so removing it and asking again brings the heels back (fix plan 8)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h1" });
    const card = looksOf(page).getByRole("group", { name: "Allow for this session?" });
    await expect(card).toBeVisible({ timeout: 10_000 });
    // The end of the turn read twice at once (found on Sabine's iPhone in 5c, A.7: "High heels" was jotted twice).
    await Promise.all([
      playInCall(page, { type: "words", speaker: "shopper", text: "Yes, allow it", final: true, turnId: "h2" }),
      playInCall(page, { type: "words", speaker: "shopper", text: "Yes, allow it", final: true, turnId: "h2" }),
    ]);
    await expect(note(page, "High heels")).toHaveAccessibleName("High heels Confirmed", { timeout: 10_000 });
    await expect(async () => {
      for (const panel of await panels(page).all()) await expect(panel).toContainText("(you asked for high heels)");
    }).toPass({ timeout: 30_000 });
    await page.waitForTimeout(3_000);
    await expect(note(page, "High heels")).toHaveCount(1);
    await note(page, "High heels").click();
    await notebookOf(page).getByRole("list", { name: "Notes" }).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(note(page, "High heels")).toHaveCount(0, { timeout: 10_000 });
    await expect(async () => {
      for (const panel of await panels(page).all()) await expect(panel).not.toContainText("(you asked for high heels)");
    }).toPass({ timeout: 30_000 });
    // Asked for again: jotted, and the heels come back.
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h3" });
    await expect(note(page, "High heels")).toHaveAccessibleName("High heels Confirmed", { timeout: 10_000 });
    await expect(async () => {
      for (const panel of await panels(page).all()) await expect(panel).toContainText("(you asked for high heels)");
    }).toPass({ timeout: 30_000 });
  });

  test("Change under the shoes once high heels are asked for brings other high heels (fix plan 9)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "I'd love some high heels", final: true, turnId: "h1" });
    const card = looksOf(page).getByRole("group", { name: "Allow for this session?" });
    await card.getByRole("button", { name: "Allow for this session" }).click({ timeout: 10_000 });
    const first = panels(page).first();
    await expect(first).toContainText("(you asked for high heels)", { timeout: 30_000 });
    const tiles = first.getByRole("listitem");
    const read = () => tiles.evaluateAll((els) => els.map((el) => [...el.querySelectorAll("p")].slice(0, 2).map((p) => p.textContent ?? "")));
    const before = await read();
    const shoes = before.find(([, kind]) => kind === "Shoes")![0];
    // Found on Sabine's iPhone in 5c, B.1: Change brought white sneakers, and in her session the look stayed.
    await first.getByRole("button", { name: `Change ${shoes}` }).click();
    await expect(first).toContainText(new RegExp(`Changed: ${shoes} to .+ \\(you asked for high heels\\)`), { timeout: 30_000 });
  });

  test("Undo feedback brings back the look before the revision, and Compare can bring the revision back (5c, R51)", async ({ page }) => {
    test.slow();
    await weddingLooks(page);
    const first = panels(page).first();
    const tiles = first.getByRole("listitem");
    const read = () => tiles.evaluateAll((els) => els.map((el) => el.querySelector("p")?.textContent ?? ""));
    const before = await read();
    const at = (await tiles.evaluateAll((els) => els.map((el) => el.querySelectorAll("p")[1]?.textContent ?? ""))).indexOf("Shoes");
    await first.getByRole("button", { name: `Change ${before[at]}` }).click();
    await expect(first).toContainText(`Changed: ${before[at]} to `, { timeout: 20_000 });
    const revised = await read();

    await first.getByRole("button", { name: "Undo feedback" }).click();
    await expect.poll(read, { timeout: 15_000 }).toEqual(before);
    await expect(first).not.toContainText("Changed:");
    await expect(notebookOf(page).getByRole("list", { name: "Feedback on Look 1" })).toHaveCount(0);

    await first.getByRole("button", { name: "Compare" }).click();
    const sheet = page.getByRole("dialog", { name: "Compare Look 1" });
    await expect(sheet.getByRole("list", { name: "Differences" })).toContainText("Different shoes");
    await noSeriousA11yProblems(page);
    await sheet.getByRole("button", { name: "Use this look" }).click();
    await expect(sheet).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(read, { timeout: 15_000 }).toEqual(revised);
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

  test("Save look reads Saved, and Saved looks opens it after a check and removes it when asked (6a, R60)", async ({ page }) => {
    const db = serverDb();
    await db.from("saved_looks").delete().eq("user_id", guest.id).throwOnError();
    await page.goto("/saved-looks");
    await expect(page.getByText("No saved looks yet")).toBeVisible();
    await weddingLooks(page);
    const first = panels(page).first();
    const name = (await first.getByRole("heading").textContent())!;
    await first.getByRole("button", { name: "Save look" }).click();
    await expect(page.getByText("Look saved").first()).toBeVisible();
    await expect(first.getByRole("button", { name: "Saved" })).toBeDisabled();
    // Open checks it against the saved profile (Q1): a $500 budget, so the $500 looks fit.
    await db.from("profiles").update({ budget_amount_cents: 50000 }).eq("user_id", guest.id).throwOnError();
    try {
      await openFromMenu(page, "Saved looks");
      const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
      await expect(card).toContainText(/Saved \d+ \w+/);
      await card.getByRole("button", { name: "Open" }).click();
      await expect(card).toContainText("Checked against your preferences", { timeout: 15_000 });
      await expect(card).toContainText("to buy, owned items not included");
      await noSeriousA11yProblems(page);
      await card.getByRole("button", { name: `Remove ${name}` }).click();
      await page.getByRole("button", { name: "Remove look" }).click();
      await expect(page.getByText("No saved looks yet")).toBeVisible();
    } finally {
      await db.from("profiles").update({ budget_amount_cents: 40000 }).eq("user_id", guest.id).throwOnError();
    }
  });

  test("Add to bag puts a look's sample products in the demo bag in a size, and Checkout stays disabled (6a, R61, R62, S16)", async ({ page }) => {
    await serverDb().from("bag_items").delete().eq("user_id", guest.id).throwOnError();
    await page.goto("/bag");
    await expect(page.getByText("Your demo bag is empty. Add pieces from a look.")).toBeVisible();
    await weddingLooks(page);
    await panels(page).first().getByRole("button", { name: "Add to bag" }).click();
    const sheet = page.getByRole("dialog", { name: "Add Look 1 to your bag" });
    await expect(sheet).toContainText("Demo only: these sample products can't be bought.");
    // Sizes start on the profile's (dress 8, shoes 7), or a piece's only size; any other is picked here.
    for (const select of await sheet.getByRole("combobox").all()) {
      if (!(await select.inputValue())) await select.selectOption({ index: 1 });
    }
    const count = (await sheet.getByRole("checkbox").all()).length;
    expect(count).toBeGreaterThan(1);
    await sheet.getByRole("button", { name: "Add to bag" }).click();
    await expect(page.getByText("Added to bag").first()).toBeVisible();
    await openFromMenu(page, `Demo bag (${count})`);

    const bag = page.getByRole("list", { name: "Pieces in your demo bag" });
    await expect(bag.getByRole("listitem")).toHaveCount(count);
    await expect(page.getByRole("status").filter({ hasText: "Demo only: these sample products can't be bought." }).first()).toBeVisible();
    await expect(bag.getByText("Sample product")).toHaveCount(count);
    await expect(page.getByRole("button", { name: "Checkout" })).toBeDisabled();
    await noSeriousA11yProblems(page);
    // The server refuses checkout too.
    const refused = await page.request.post("/api/bag/checkout");
    expect(refused.status()).toBe(403);
    // Remove takes one piece out.
    await bag.getByRole("button", { name: /^Remove / }).first().click();
    await expect(bag.getByRole("listitem")).toHaveCount(count - 1);
  });
});
