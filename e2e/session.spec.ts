import { expect, type Page, test } from "@playwright/test";
import { SAMPLE_PHRASES } from "../lib/sample-phrases";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { commandsSent, fakeMicrophone, playInCall, scriptDone } from "./support/microphone";

// 2a to 2d: the styling session with the fake engine and notes reader (playwright.config.ts): the
// microphone card (R6), Start conversation, End and resuming (R12), her state in words (R8),
// interrupting (R7), Mute, tap to try (R70), live notes (R17 to R21) and the notebook (R15, R16, R20,
// R23 to R25, R68).
test.describe("the stylist stage", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  const sessions = async () => (await serverDb().from("sessions").select("id, status").eq("user_id", guest.id)).data ?? [];
  const state = (page: Page) => page.getByRole("region", { name: "Your stylist" }).locator("p[aria-live]");

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
    await db.from("saved_preferences").delete().eq("user_id", guest.id).throwOnError();
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
    await expect(notebook.getByText("To confirm", { exact: true })).toHaveCount(4);
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

  // 2d: the notebook.
  const notebookOf = (page: Page) => page.getByRole("region", { name: "My Styling Notes" });
  /** A jotted note's tap target, named by its words and then its status. */
  const note = (page: Page, text: string) => notebookOf(page).getByRole("button", { name: new RegExp(`^${text} (To confirm|Confirmed)$`) });

  /** In a call, with the wedding phrase's four notes jotted (R18). */
  async function weddingNotes(page: Page) {
    await inCall(page);
    await page.getByRole("button", { name: `“${SAMPLE_PHRASES[0]}”` }).click();
    await expect(note(page, "Emerald green, preferred")).toBeVisible();
    return notebookOf(page);
  }

  test("saved preferences sit at the top of the notebook, under the hint line (R15, R24, R25)", async ({ page }) => {
    await serverDb().from("saved_preferences").insert({ user_id: guest.id, kind: "never", words: "high heels" }).throwOnError();
    await fakeMicrophone(page, "allowed");
    await page.goto("/session");
    const notebook = notebookOf(page);
    await expect(notebook.getByText("Notes appear here as you talk. Tap a note to confirm or remove it, or say a correction.")).toBeVisible();
    const preferences = notebook.getByRole("list", { name: "Saved preferences" });
    await expect(preferences).toContainText("Never: high heels");
    await expect(preferences).toContainText("Saved preference");
    await expect(notebook.getByRole("list", { name: "Notes" }).getByRole("listitem")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "From your profile" })).toBeVisible();
    await noSeriousA11yProblems(page);
  });

  test("a tapped Confirm turns a note to ink within a second, with focus on Confirm and then back on the note (R20, S7)", async ({ page }) => {
    const notebook = await weddingNotes(page);
    await note(page, "Elegant").click();
    await expect(note(page, "Elegant")).toHaveAttribute("aria-expanded", "true");
    const confirm = notebook.getByRole("button", { name: "Confirm", exact: true });
    await expect(confirm).toBeFocused();
    await noSeriousA11yProblems(page);
    await confirm.click();
    await expect(note(page, "Elegant")).toHaveAccessibleName("Elegant Confirmed", { timeout: 1000 });
    await expect(note(page, "Elegant")).toBeFocused();
    await expect
      .poll(async () => (await serverDb().from("session_notes").select("status").eq("user_id", guest.id).eq("note_text", "Elegant")).data?.[0]?.status)
      .toBe("confirmed");
    // A confirmed note only offers Remove, and Escape closes the buttons.
    await note(page, "Elegant").click();
    await expect(notebook.getByRole("button", { name: "Remove", exact: true })).toBeFocused();
    await expect(notebook.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(note(page, "Elegant")).toBeFocused();
    await expect(note(page, "Elegant")).toHaveAttribute("aria-expanded", "false");
  });

  test("Remove takes a note out with Undo for 5 seconds, and without Undo it stays gone (R20, R22)", async ({ page }) => {
    const notebook = await weddingNotes(page);
    await note(page, "Elegant").click();
    await notebook.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(notebook.getByText("Removed:")).toBeVisible();
    const undo = notebook.getByRole("button", { name: "Undo" });
    await expect(undo).toBeFocused();
    await noSeriousA11yProblems(page);
    await undo.click();
    await expect(note(page, "Elegant")).toBeFocused();

    await note(page, "Elegant").click();
    await notebook.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(undo).toBeHidden({ timeout: 7000 });
    await expect(note(page, "Elegant")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "My Styling Notes" })).toBeFocused();
    // Coming back to the session (it resumes) doesn't bring it back.
    await page.reload();
    await expect(note(page, "Emerald green, preferred")).toBeVisible();
    await expect(note(page, "Elegant")).toHaveCount(0);
  });

  test("Hide folds the notebook to one line, and Show brings back every note and status (R23)", async ({ page }) => {
    const notebook = await weddingNotes(page);
    await note(page, "Elegant").click();
    await notebook.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(note(page, "Elegant")).toHaveAccessibleName("Elegant Confirmed");
    await notebook.getByRole("button", { name: "Hide" }).click();
    await expect(notebook.getByText("4 notes, 3 to confirm")).toBeVisible();
    await expect(note(page, "Elegant")).toBeHidden();
    await noSeriousA11yProblems(page);
    await notebook.getByRole("button", { name: "Show" }).click();
    await expect(note(page, "Elegant")).toHaveAccessibleName("Elegant Confirmed");
    await expect(notebook.getByText("To confirm", { exact: true })).toHaveCount(3);
  });

  test("ending the session clears the notes", async ({ page }) => {
    const notebook = await weddingNotes(page);
    await page.getByRole("button", { name: "End", exact: true }).click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText("Conversation ended.")).toBeVisible();
    await expect(notebook.getByRole("list", { name: "Notes" }).getByRole("listitem")).toHaveCount(0);
  });

  test("while notes are paused, confirming by touch still works (R25)", async ({ page }) => {
    const notebook = await weddingNotes(page);
    await page.route("**/words", (route) => route.abort("internetdisconnected"));
    await playInCall(page, { type: "words", speaker: "shopper", text: "Something in navy", final: true, turnId: "9" });
    await expect(notebook.getByText("Notes paused. You can still confirm or remove notes.")).toBeVisible();
    await note(page, "Elegant").click();
    await notebook.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(note(page, "Elegant")).toHaveAccessibleName("Elegant Confirmed");
  });

  test("screen readers hear note changes, grouped and held while someone is talking (R68)", async ({ page }) => {
    await inCall(page);
    const heard = notebookOf(page).locator("p[aria-live]");
    await playInCall(page, { type: "shopper-speaking", speaking: true });
    await playInCall(page, { type: "words", speaker: "shopper", text: "It's for a gala, something elegant", final: true, turnId: "1" });
    await expect(note(page, "Elegant")).toBeVisible();
    await expect(heard).toHaveText("");
    await playInCall(page, { type: "shopper-speaking", speaking: false });
    await expect(heard).toHaveText("2 notes added");
    await note(page, "Elegant").click();
    await notebookOf(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(heard).toHaveText("Confirmed: Elegant.");
  });

  test("on phones, the pinned bar appears once the stylist scrolls away, and its summary goes back to the notebook", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "the pinned bar is for phones");
    await weddingNotes(page);
    const bar = page.getByRole("complementary", { name: "Your stylist and notes" });
    await expect(bar).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Thinking"); // the fake stylist doesn't answer the phrase
    await noSeriousA11yProblems(page);
    await bar.getByRole("button", { name: "Mute" }).click();
    await expect(bar.getByRole("button", { name: "Muted" })).toHaveAttribute("aria-pressed", "true");
    await bar.getByRole("button", { name: "4 notes, 4 to confirm" }).click();
    await expect(page.getByRole("heading", { name: "My Styling Notes" })).toBeFocused();
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
