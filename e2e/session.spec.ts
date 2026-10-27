import { expect, type Page, test } from "@playwright/test";
import { SAMPLE_PHRASES } from "../lib/sample-phrases";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { commandsSent, fakeMicrophone, playInCall, scriptDone } from "./support/microphone";

// 2a to 2e: the styling session with the fake engine and notes reader (playwright.config.ts): the
// microphone card (R6), Start conversation, End and resuming (R12), her state in words (R8),
// interrupting (R7), Mute, tap to try (R70), live notes (R17 to R21), the notebook (R15, R16, R20,
// R23 to R25, R68), time limits (R13), connection problems (R14) and notes deleted at End (R63).
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

  /** Voice only or Turn video on: beside Camera on tablets and computers, under More on phones (6c). */
  async function toggleVoice(page: Page, name: "Voice only" | "Video off") {
    const more = page.getByRole("button", { name: "More", exact: true });
    if (await more.isVisible()) {
      await more.click();
      await page.getByRole("button", { name: name === "Voice only" ? "Voice only" : "Turn video on", exact: true }).click();
    } else await page.getByRole("button", { name, exact: true }).click();
  }

  test("Voice only: she says the switch line, carries on as a still portrait with the notes kept, and Turn video on brings video back (6c, R9, S3)", async ({ page }) => {
    await inCall(page);
    await page.getByRole("button", { name: `“${SAMPLE_PHRASES[0]}”` }).click();
    const notebook = page.getByRole("region", { name: "My Styling Notes" });
    await expect(notebook.getByText("Outdoor wedding, November")).toBeVisible();
    await toggleVoice(page, "Voice only");
    // The video stylist says the switch line first (R9).
    await expect.poll(async () => (await commandsSent(page)).filter((c) => c.name === "say").map((c) => c.value)).toContain(
      "I'm switching to voice only, so I'll sound a little different.",
    );
    await expect(page.getByText("Switching to voice only…")).toBeVisible();
    // The video stays while she says it.
    await expect(page.getByRole("img", { name: "Your stylist, in voice only" })).toHaveCount(0);
    // Then the voice stylist, as a still portrait, picks up in the same session.
    await expect(page.getByRole("img", { name: "Your stylist, in voice only" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status").filter({ hasText: /^Voice only/ })).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await commandsSent(page)).filter((c) => c.name === "say").map((c) => c.value)).toContain("Right, let's carry on.");
    const rows = await sessions();
    expect(rows).toHaveLength(1);
    const { data: voice } = await serverDb().from("sessions").select("engine, call_id").eq("user_id", guest.id).single();
    expect(voice).toMatchObject({ engine: "voice" });
    expect(voice?.call_id).toMatch(/^voice:/);
    // Notes are never affected (R9).
    await expect(notebook.getByText("Outdoor wedding, November")).toBeVisible();
    await noSeriousA11yProblems(page);

    // Turn video on: the video stylist is back, in the same session.
    if (await page.getByRole("button", { name: "Turn video on" }).first().isVisible()) await page.getByRole("button", { name: "Turn video on" }).first().click();
    else await toggleVoice(page, "Video off");
    await expect(page.getByRole("img", { name: "Your stylist, in voice only" })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole("status").filter({ hasText: /^Voice only/ })).toHaveCount(0);
    await expect.poll(async () => (await serverDb().from("sessions").select("engine").eq("user_id", guest.id).single()).data?.engine).toBe("video");
    await expect(notebook.getByText("Outdoor wedding, November")).toBeVisible();
    expect(await sessions()).toHaveLength(1);
  });

  test("when the video stylist is with another visitor, the conversation starts in voice only and she says why (6c, R9)", async ({ page }) => {
    // The fake video stylist is made busy for this test only (never possible on the live site).
    await page.route("**/api/sessions", (route) =>
      route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-fake-video": "busy" } }) : route.fallback(),
    );
    await fakeMicrophone(page, "allowed", true);
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("img", { name: "Your stylist, in voice only" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("The video stylist is with another visitor. Continuing with voice.")).toBeVisible();
    await expect.poll(async () => (await commandsSent(page)).filter((c) => c.name === "say").map((c) => c.value)).toContain(
      "The video stylist is with another visitor right now, so I'm with you by voice. What are you dressing for?",
    );
    await expect.poll(async () => (await serverDb().from("sessions").select("engine").eq("user_id", guest.id).single()).data?.engine).toBe("voice");
    await noSeriousA11yProblems(page);
  });

  test("when the video drops mid-call, she carries on by voice first, saying the switch line (6c, R14)", async ({ page }) => {
    await inCall(page);
    await playInCall(page, { type: "connection", state: "ended" });
    await expect(page.getByRole("img", { name: "Your stylist, in voice only" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Video unavailable. Continuing with voice.")).toBeVisible();
    await expect.poll(async () => (await commandsSent(page)).filter((c) => c.name === "say").map((c) => c.value)).toContain(
      "I'm switching to voice only, so I'll sound a little different.",
    );
    expect(await sessions()).toEqual([expect.objectContaining({ status: "active" })]);
    // Turn video on brings the video stylist back.
    const back = page.getByRole("button", { name: "Turn video on" }).first();
    await back.click();
    await expect(page.getByRole("img", { name: "Your stylist, in voice only" })).toHaveCount(0, { timeout: 15_000 });
  });

  test("when the voice stylist can't stand in after a drop, the video stylist comes back by herself (6d review)", async ({ page }) => {
    // The fake voice stylist is made unavailable for this test only (never possible on the live site).
    await page.route("**/api/sessions", (route) =>
      route.request().method() === "POST" ? route.continue({ headers: { ...route.request().headers(), "x-fake-voice": "unavailable" } }) : route.fallback(),
    );
    await inCall(page);
    await playInCall(page, { type: "connection", state: "ended" });
    // Voice refused, so the next try is video: back in the same session, with no portrait and no voice line.
    await expect(state(page)).toHaveText("Listening", { timeout: 20_000 });
    await expect(page.getByRole("img", { name: "Your stylist, in voice only" })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Continuing with voice" })).toHaveCount(0);
    await expect.poll(async () => (await serverDb().from("sessions").select("engine").eq("user_id", guest.id).single()).data?.engine).toBe("video");
    expect(await sessions()).toEqual([expect.objectContaining({ status: "active" })]);
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
    // A changed setting only applies after a reload, so the button reloads the page (found on Sabine's iPhone in 2f).
    await expect(page.getByText(/then reload the page/)).toBeVisible();
    const reload = page.waitForEvent("load");
    await page.getByRole("button", { name: "Reload page" }).click();
    await reload;
    await expect(page.getByRole("button", { name: /conversation$/ })).toBeVisible();
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
    // Deleted on the server too (R63).
    await expect.poll(async () => (await serverDb().from("session_notes").select("id").eq("user_id", guest.id)).data?.length).toBe(0);
  });

  // 2e: time limits (R13) and connection problems (R14).
  test("shows the time left in the last 2 minutes, then Time is up, keeping the notes (R13)", async ({ page }) => {
    await page.clock.install();
    await weddingNotes(page);
    const timeLeft = page.getByRole("region", { name: "Your stylist" }).getByRole("status");
    await page.clock.fastForward("08:05");
    await expect(timeLeft).toHaveText("2 minutes left");
    await page.clock.fastForward("01:00");
    await expect(timeLeft).toHaveText("1 minute left");
    await page.clock.fastForward("01:00");
    await expect(state(page)).toHaveText("Time is up");
    await expect(page.getByText("You've used today's 10 minutes with your stylist.", { exact: false })).toBeVisible();
    await expect(note(page, "Elegant")).toBeVisible();
    await expect(page.getByRole("button", { name: /conversation$/ })).toHaveCount(0);
    await expect.poll(sessions).toEqual([expect.objectContaining({ status: "paused" })]);
    await noSeriousA11yProblems(page);
  });

  test("shows Reconnecting while the connection comes back (R14)", async ({ page }) => {
    await inCall(page);
    await playInCall(page, { type: "connection", state: "reconnecting" });
    await expect(state(page)).toHaveText("Reconnecting");
    await playInCall(page, { type: "connection", state: "connected" });
    await expect(state(page)).toHaveText("Listening");
  });

  test("a dropped call starts again by itself, keeping the session and its notes (R14)", async ({ page }) => {
    await weddingNotes(page);
    await playInCall(page, { type: "connection", state: "ended" });
    await expect(state(page)).toHaveText("Reconnecting");
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled({ timeout: 10_000 });
    await expect(state(page)).toHaveText(/^(Speaking|Listening)$/);
    await expect(note(page, "Elegant")).toBeVisible();
    await expect.poll(sessions).toEqual([expect.objectContaining({ status: "active" })]);
  });

  test("while the phone is offline, a dropped call waits for the connection before trying again (found on Sabine's iPhone, R14)", async ({ page, context }) => {
    await weddingNotes(page);
    let starts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === "/api/sessions") starts++;
    });
    await context.setOffline(true);
    await playInCall(page, { type: "connection", state: "ended" });
    await expect(state(page)).toHaveText("Reconnecting");
    await page.waitForTimeout(6000);
    expect(starts).toBe(0); // no tries used up while offline
    await expect(state(page)).toHaveText("Reconnecting");
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled({ timeout: 15_000 });
    await expect(state(page)).toHaveText(/^(Speaking|Listening)$/);
    expect(starts).toBe(1);
    await expect(note(page, "Elegant")).toBeVisible();
  });

  test("after 3 failed tries to bring back a dropped call, it offers Try again (R14)", async ({ page }) => {
    await weddingNotes(page);
    let starts = 0;
    await page.route("**/api/sessions", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      starts++;
      return route.fulfill({ status: 500, json: { error: "Something went wrong." } });
    });
    await playInCall(page, { type: "connection", state: "ended" });
    await expect(page.getByText("We couldn't reconnect to your stylist.", { exact: false })).toBeVisible({ timeout: 25_000 });
    await expect(state(page)).toHaveText("Connection lost");
    await expect(page.getByText("Connection lost.")).toBeVisible();
    expect(starts).toBe(3);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(note(page, "Elegant")).toBeVisible();
    await noSeriousA11yProblems(page);
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
    // The notes' own announcements (the photo to style around has its own, 3a).
    const heard = notebookOf(page).locator(":scope > p[aria-live]");
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
    // The status changes on the server a moment after End shows (a GitHub flake in 4b).
    await expect.poll(sessions).toEqual([{ id: first, status: "active" }]);
  });
});
