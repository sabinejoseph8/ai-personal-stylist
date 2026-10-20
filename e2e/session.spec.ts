import { expect, type Page, test } from "@playwright/test";
import { SAMPLE_PHRASES } from "../lib/sample-phrases";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { commandsSent, fakeMicrophone, playInCall, scriptDone } from "./support/microphone";

// 2a and 2b: the stylist stage with the fake engine (playwright.config.ts): the microphone card (R6),
// Start conversation, End and resuming (R12), her state in words (R8), interrupting (R7), Mute and
// tap to try (R70).
test.describe("the stylist stage", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  const sessions = async () => (await serverDb().from("sessions").select("id, status").eq("user_id", guest.id)).data ?? [];
  const state = (page: Page) => page.locator("p[aria-live]");

  /** Opens the session page and starts a call, with the microphone already allowed. */
  async function inCall(page: Page) {
    await fakeMicrophone(page, "allowed", true);
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    // Her greeting plays first; on a slow machine it can still be on its way after Listening shows.
    await expect.poll(() => scriptDone(page)).toBe(true);
    await expect(state(page)).toHaveText("Listening");
  }

  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    const db = serverDb();
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    await db.from("usage").delete().eq("user_id", guest.id).throwOnError();
    await db.from("rate_limits").delete().eq("user_id", guest.id).throwOnError();
    await context.addCookies(shared.cookies);
  });

  test("explains the microphone before asking, then starts the conversation (R6, R8)", async ({ page }) => {
    await fakeMicrophone(page, "allowed");
    await page.goto("/session");
    await expect(state(page)).toHaveText("Ready");
    await noSeriousA11yProblems(page);
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("heading", { name: "Talk with your stylist" })).toBeVisible();
    await expect(page.getByText("Only your words are used, to jot your notes, and no audio is kept.")).toBeVisible();
    await noSeriousA11yProblems(page);
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    await expect(state(page)).toHaveText(/^(Speaking|Listening)$/);
    await noSeriousA11yProblems(page);
  });

  test("Not now explains that the conversation can't start without the microphone (R6)", async ({ page }) => {
    await fakeMicrophone(page, "allowed");
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByText("Without the microphone, the stylist can't hear you, so the conversation can't start.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start conversation" })).toBeVisible();
    expect(await sessions()).toEqual([]);
  });

  test("a blocked microphone shows Microphone needed, and no call starts (R6)", async ({ page }) => {
    await fakeMicrophone(page, "blocked");
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(state(page)).toHaveText("Microphone needed");
    await expect(page.getByText("The stylist needs your microphone to hear you")).toBeVisible();
    await expect(page.getByText(/tap aA in Safari's address bar/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(await sessions()).toEqual([]);
  });

  test("a microphone that stops working mid-call pauses the conversation (R6)", async ({ page }) => {
    await inCall(page);
    await playInCall(page, { type: "microphone", problem: "failed" });
    await expect(state(page)).toHaveText("Microphone needed");
    await expect(page.getByText(/Your microphone isn't working/)).toBeVisible();
    await expect.poll(sessions).toEqual([expect.objectContaining({ status: "paused" })]);
  });

  test("goes straight to Listening when the shopper talks over her (R7)", async ({ page }) => {
    await inCall(page);
    await playInCall(page, { type: "stylist-speaking", speaking: true });
    await expect(state(page)).toHaveText("Speaking");
    await playInCall(page, { type: "shopper-speaking", speaking: true });
    await expect(state(page)).toHaveText("Listening");
    await playInCall(page, { type: "shopper-speaking", speaking: false });
    await expect(state(page)).toHaveText("Thinking");
  });

  test("Mute shows Muted, and mutes the call", async ({ page }) => {
    await inCall(page);
    await page.getByRole("button", { name: "Mute", exact: true }).click();
    await expect(page.getByRole("button", { name: "Muted" })).toHaveAttribute("aria-pressed", "true");
    await expect(state(page)).toHaveText("Muted");
    expect(await commandsSent(page)).toContainEqual({ name: "setMuted", value: true });
    await page.getByRole("button", { name: "Muted" }).click();
    await expect(state(page)).toHaveText("Listening");
  });

  test("offers three phrases to try, sends a tapped one as if spoken, then hides them (R70)", async ({ page }) => {
    await inCall(page);
    for (const phrase of SAMPLE_PHRASES) await expect(page.getByRole("button", { name: `“${phrase}”` })).toBeVisible();
    await page.getByRole("button", { name: `“${SAMPLE_PHRASES[0]}”` }).click();
    expect(await commandsSent(page)).toContainEqual({ name: "sendPhrase", value: SAMPLE_PHRASES[0] });
    await expect(page.getByText("Try saying")).toBeHidden();
    await expect(state(page)).toHaveText("Thinking");
  });

  test("the wedding phrase jots the R18 notes while she listens, and asks dress or pantsuit (R17 to R19)", async ({ page }) => {
    await inCall(page);
    await expect(page.getByText("Notes appear here as you talk.")).toBeVisible();
    await page.getByRole("button", { name: `“${SAMPLE_PHRASES[0]}”` }).click();
    const notebook = page.getByRole("region", { name: "My Styling Notes" });
    for (const note of ["Outdoor wedding, November", "Elegant", "Emerald green, preferred", "Budget: up to $500"]) {
      await expect(notebook.getByText(note, { exact: true })).toBeVisible();
    }
    await expect(notebook.getByText("To confirm")).toHaveCount(4);
    const replies = page.getByRole("group", { name: "Quick replies: Dress or pantsuit?" });
    await expect(replies.getByRole("button")).toHaveText(["Dress", "Pantsuit", "Not sure yet"]);
    await expect
      .poll(async () => (await commandsSent(page)).filter((c) => c.name === "updateContext").map((c) => String(c.value)).join("\n"))
      .toContain("Budget: up to $500");
    await noSeriousA11yProblems(page);

    await replies.getByRole("button", { name: "Pantsuit" }).click();
    await expect(notebook.getByText("Pantsuit", { exact: true })).toBeVisible();
    await expect(replies).toBeHidden();
    expect(await commandsSent(page)).toContainEqual({ name: "sendPhrase", value: "Pantsuit" });
  });

  test("a spoken correction replaces the budget (R21)", async ({ page }) => {
    await inCall(page);
    await playInCall(page, { type: "words", speaker: "shopper", text: "My budget is $500", final: true, turnId: "1" });
    const notebook = page.getByRole("region", { name: "My Styling Notes" });
    await expect(notebook.getByText("Budget: up to $500", { exact: true })).toBeVisible();
    await playInCall(page, { type: "words", speaker: "shopper", text: "Actually, make my budget $350", final: true, turnId: "2" });
    await expect(notebook.getByText("Budget: up to $350", { exact: true })).toBeVisible();
    await expect(notebook.getByText("Budget: up to $500", { exact: true })).toBeHidden();
  });

  test("words turned away by the rate limit at the end of a turn are sent again, not lost", async ({ page }) => {
    await inCall(page);
    let refused = 0;
    await page.route("**/words", (route) => (refused++ < 1 ? route.fulfill({ status: 429, json: { error: "Too many updates at once." } }) : route.fallback()));
    await playInCall(page, { type: "words", speaker: "shopper", text: "Actually, make my budget $350", final: true, turnId: "1" });
    await expect(page.getByRole("region", { name: "My Styling Notes" }).getByText("Budget: up to $350", { exact: true })).toBeVisible();
    expect(refused).toBeGreaterThan(1);
  });

  test("shows Notes paused when the notes can't be reached (R25)", async ({ page }) => {
    await inCall(page);
    await page.route("**/words", (route) => route.abort("internetdisconnected"));
    await playInCall(page, { type: "words", speaker: "shopper", text: "Something elegant", final: true, turnId: "1" });
    await expect(page.getByText("Notes paused")).toBeVisible();
  });

  test("End asks first: Keep talking carries on, End session ends it (R12)", async ({ page }) => {
    await inCall(page);
    await page.getByRole("button", { name: "End", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "End this session?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep talking" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "End", exact: true }).click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText("Conversation ended.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start conversation" })).toBeVisible();
    expect(await sessions()).toEqual([expect.objectContaining({ status: "ended" })]);
  });

  test("offers to resume the same session after leaving the page, without asking about the microphone again (R12)", async ({ page }) => {
    await inCall(page);
    const first = (await sessions())[0].id;
    await page.reload();
    await page.getByRole("button", { name: "Resume conversation" }).click();
    await expect(page.getByRole("heading", { name: "Talk with your stylist" })).toBeHidden();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    expect(await sessions()).toEqual([{ id: first, status: "active" }]);
  });
});
