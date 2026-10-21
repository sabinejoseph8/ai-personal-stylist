import { expect, type Page, test } from "@playwright/test";
import { canRunDatabaseTests, clearPhotos, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { commandsSent, fakeMicrophone, playInCall, scriptDone } from "./support/microphone";

// 3c: the camera, with a pretend camera (a drawn picture) and the fake camera reader, which sees a navy
// wool blazer it isn't sure of in every frame. The permission card, Camera on and "Video isn't saved."
// (R33), the name after two frames with Capture, and "use this one" (R34), the swap on phones, turning
// off after 2 minutes and the Upload photo fallback (R35). The stylist is told, and speaks up.
test.describe("the camera", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  const stage = (page: Page) => page.getByRole("region", { name: "Your stylist" });
  const cameraButton = (page: Page) => stage(page).getByRole("button", { name: /^Camera/ });
  const photoRows = async () => (await serverDb().from("session_assets").select("source, status").eq("user_id", guest.id)).data ?? [];
  const contextSent = async (page: Page) =>
    (await commandsSent(page))
      .filter((c) => c.name === "updateContext")
      .map((c) => String(c.value))
      .at(-1) ?? "";
  const phrasesSent = async (page: Page) => (await commandsSent(page)).filter((c) => c.name === "sendPhrase").map((c) => String(c.value));

  async function inCall(page: Page, camera: "allowed" | "blocked" | "missing" = "allowed") {
    await fakeMicrophone(page, "allowed", true, camera);
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    await expect.poll(() => scriptDone(page)).toBe(true);
  }
  async function cameraOn(page: Page) {
    await cameraButton(page).click();
    await expect(page.getByRole("heading", { name: "Show an item on camera" })).toBeVisible();
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(stage(page).getByText("Video isn’t saved.")).toBeVisible();
  }

  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    const db = serverDb();
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    await Promise.all([
      clearPhotos(guest.id),
      db.from("usage").delete().eq("user_id", guest.id).throwOnError(),
      db.from("rate_limits").delete().eq("user_id", guest.id).throwOnError(),
    ]);
    await context.addCookies(shared.cookies);
  });

  test("explains first, shows Camera on, names the item after two frames, and Capture adds a still from your camera (R33, R34)", async ({ page }) => {
    await inCall(page);
    await cameraOn(page);
    await expect(cameraButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(stage(page).getByText("Camera on").first()).toBeVisible();
    await noSeriousA11yProblems(page);

    // Two frames agree, about 2 seconds apart: the name with a question mark (unsure), and Capture.
    await expect(stage(page).getByText("Navy wool blazer?")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Capture" })).toBeVisible();
    await expect.poll(() => contextSent(page)).toContain("On the shopper's camera now: Navy wool blazer (you're not sure)");
    await expect.poll(() => phrasesSent(page)).toContain("I'm holding something up to my camera.");
    // Frames are read and thrown away: nothing is kept until Capture.
    expect(await photoRows()).toEqual([]);

    await page.getByRole("button", { name: "Capture" }).click();
    await expect(page.getByText("Photo added to your notes", { exact: true })).toBeVisible();
    // The camera turns off after Capture (Q2 in 3c), and the still is read like any photo.
    await expect(cameraButton(page)).toHaveAttribute("aria-pressed", "false");
    const area = page.getByRole("region", { name: "Style around this item" });
    await expect(area.getByText("From your camera")).toBeVisible();
    await expect(area.getByText("Navy wool blazer", { exact: true })).toBeVisible();
    await expect.poll(photoRows).toEqual([{ source: "camera", status: "ready" }]);
  });

  test("saying 'use this one' takes the still (R34, Q1 in 3c)", async ({ page }) => {
    await inCall(page);
    await cameraOn(page);
    await expect(stage(page).getByText("Navy wool blazer?")).toBeVisible({ timeout: 15_000 });
    await playInCall(page, { type: "words", speaker: "shopper", text: "Use this one", final: true, turnId: "1" });
    await expect(page.getByText("Photo added to your notes", { exact: true })).toBeVisible();
    await expect.poll(photoRows).toEqual([{ source: "camera", status: "ready" }]);
  });

  test("'use this one' said before the name appears is acted on once it's named, even without a turn label (found on Sabine's iPhone)", async ({ page }) => {
    await inCall(page);
    await cameraOn(page);
    // Straight away, before two frames have agreed; the real call can send words with a blank turn label.
    await playInCall(page, { type: "words", speaker: "shopper", text: "Use this one", final: false, turnId: "" });
    await playInCall(page, { type: "words", speaker: "shopper", text: "Use this one", final: true, turnId: "" });
    await expect(page.getByText("Photo added to your notes", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(cameraButton(page)).toHaveAttribute("aria-pressed", "false");
    // One still, not one per piece of the words.
    await expect.poll(photoRows).toEqual([{ source: "camera", status: "ready" }]);
  });

  test("on phones the camera fills the stage and Done showing swaps back; desktops show a tile, and Switch camera flips it", async ({ page }, info) => {
    await inCall(page);
    await cameraOn(page);
    await expect(page.getByRole("button", { name: "Switch camera" })).toBeVisible();
    await page.getByRole("button", { name: "Switch camera" }).click();
    await expect(stage(page).getByText("Video isn’t saved.")).toBeVisible();
    if (info.project.name === "phone") {
      await expect(stage(page).getByText("Hold one item in the frame")).toBeVisible();
      await page.getByRole("button", { name: "Done showing" }).click();
      await expect(stage(page).getByText("Video isn’t saved.")).toHaveCount(0);
    } else {
      await expect(page.getByRole("button", { name: "Done showing" })).toBeHidden();
      await expect(stage(page).getByText("Hold one item in the frame")).toBeHidden();
      await cameraButton(page).click();
      await expect(stage(page).getByText("Video isn’t saved.")).toHaveCount(0);
    }
    await expect(cameraButton(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("the camera turns itself off after 2 minutes (R35)", async ({ page }) => {
    await page.clock.install();
    await inCall(page);
    await cameraOn(page);
    await page.clock.fastForward("02:01");
    await expect(page.getByText("Camera turned off. Turn it on again to show another item.")).toBeVisible();
    await expect(cameraButton(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("a blocked camera offers Upload photo, and she's told to suggest it (R35, S10)", async ({ page }) => {
    await inCall(page, "blocked");
    await cameraButton(page).click();
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(page.getByText("Camera blocked. Upload a photo instead.")).toBeVisible();
    await expect.poll(() => contextSent(page)).toContain("Suggest uploading a photo instead");
    await expect.poll(() => phrasesSent(page)).toContain("My camera won't turn on.");
    await noSeriousA11yProblems(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Upload photo" }).click();
    await chooser;
  });

  test("End turns the camera off", async ({ page }) => {
    await inCall(page);
    await cameraOn(page);
    await page.getByRole("button", { name: "End", exact: true }).click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText("Conversation ended.")).toBeVisible();
    await expect(stage(page).getByText("Video isn’t saved.")).toHaveCount(0);
  });
});
