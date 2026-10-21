import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { canRunDatabaseTests, clearPhotos, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { fakeMicrophone, scriptDone } from "./support/microphone";

// 3a: the photo to style around, in the browser (R26, R27, R31, R32, R63). Phase 3 automated test:
// an upload shows the photo before analysis finishes. The photo's check on the server is held back
// here, so the test sees the photo while it's still on its way.
test.describe("the photo to style around", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  const photoRows = async () => (await serverDb().from("session_assets").select("id, version, active, status").eq("user_id", guest.id).order("created_at")).data ?? [];
  const jpeg = (color: string) => sharp({ create: { width: 300, height: 400, channels: 3, background: color } }).jpeg().toBuffer();
  // Its description names the item once the photo reader has read it (3b).
  const pasted = (page: Page) => page.getByRole("region", { name: "Style around this item" }).getByRole("img", { name: /to style around/ });
  const problem = (page: Page) => page.getByRole("region", { name: "My Styling Notes" }).getByRole("alert");

  async function inCall(page: Page) {
    await fakeMicrophone(page, "allowed", true);
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    await expect.poll(() => scriptDone(page)).toBe(true);
  }

  /** Picks a file with the button's file picker, the way a shopper would. */
  async function pick(page: Page, button: string, file: { name: string; mimeType: string; buffer: Buffer }) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: button, exact: true }).click();
    await (await chooser).setFiles(file);
  }

  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    const db = serverDb();
    // A session's photo records go with it.
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    await Promise.all([
      clearPhotos(guest.id),
      db.from("usage").delete().eq("user_id", guest.id).throwOnError(),
      db.from("rate_limits").delete().eq("user_id", guest.id).throwOnError(),
    ]);
    await context.addCookies(shared.cookies);
  });

  test("the photo shows at once, before the upload finishes, then can be enlarged and stays after a reload (R26, R27)", async ({ page }) => {
    await fakeMicrophone(page, "allowed", true);
    await page.goto("/session");
    // A photo belongs to a session: Add a photo shows once the conversation has started (Q2 in 3a).
    await expect(page.getByRole("button", { name: "Add a photo" })).toHaveCount(0);
    await inCall(page);

    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/sessions/*/assets/*/ready", async (route) => {
      await held;
      await route.continue();
    });
    await pick(page, "Add a photo", { name: "jacket.jpg", mimeType: "image/jpeg", buffer: await jpeg("#1f2a44") });
    await expect(page.getByRole("heading", { name: "Style around this item" })).toBeVisible();
    await expect(pasted(page)).toBeVisible();
    await expect(pasted(page)).toHaveAttribute("src", /^blob:/);
    await expect(page.getByText("Uploading", { exact: true })).toBeVisible();
    await expect(page.getByText("Your item", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();

    release();
    await expect(pasted(page)).toHaveAttribute("src", /supabase\.co.*-v1\.jpg/);
    await expect(page.getByText("Uploading", { exact: true })).toHaveCount(0);
    expect(await photoRows()).toMatchObject([{ status: "ready", active: true, version: 1 }]);
    // Screen readers hear it too (R68).
    await expect(page.getByRole("region", { name: "Style around this item" }).locator("p[aria-live]")).toHaveText(/Recognized: Navy wool blazer\./, { timeout: 15_000 });
    await noSeriousA11yProblems(page);

    // Enlarge: the full photo, untilted, with its description. Escape closes it, and focus goes back.
    await page.getByRole("button", { name: "Enlarge" }).click();
    const dialog = page.getByRole("dialog", { name: "Navy wool blazer" });
    await expect(dialog.getByRole("img", { name: /to style around/ })).toBeVisible();
    await expect(dialog.getByText("Navy wool blazer, the item to style around, uploaded.")).toBeVisible();
    // Checked once it has finished fading in, so contrast is measured at full strength.
    await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    await noSeriousA11yProblems(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enlarge" })).toBeFocused();

    // Hidden notes keep a 40 px thumbnail beside the summary.
    await page.getByRole("button", { name: "Hide" }).click();
    const notebook = page.getByRole("region", { name: "My Styling Notes" });
    const thumbnail = notebook.locator("img").first();
    await expect(thumbnail).toBeVisible();
    expect((await thumbnail.boundingBox())?.width).toBe(40);
    await page.getByRole("button", { name: "Show" }).click();

    // A resumed session keeps its photo.
    await page.reload();
    await expect(pasted(page)).toHaveAttribute("src", /supabase\.co.*-v1\.jpg/);
  });

  test("a file over 10 MB is turned away at once, and a renamed text file after the server's check (R26, FR-27)", async ({ page }) => {
    await inCall(page);
    let adds = 0;
    page.on("request", (r) => void (r.method() === "POST" && r.url().endsWith("/assets") && adds++));
    await pick(page, "Add a photo", { name: "huge.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(problem(page)).toHaveText("Use a JPEG, PNG, WebP or HEIC photo up to 10 MB.");
    expect(adds).toBe(0);
    await expect(pasted(page)).toHaveCount(0);

    await pick(page, "Add a photo", { name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("Shopping list: blazer, shoes") });
    await expect.poll(() => adds).toBe(1);
    await expect(problem(page)).toHaveText("Use a JPEG, PNG, WebP or HEIC photo up to 10 MB.");
    await expect(pasted(page)).toHaveCount(0);
    await expect.poll(photoRows).toEqual([]);
  });

  test("Replace swaps the photo, several photos show thumbnails with Active, Remove takes one out, and End deletes them (R31, R63)", async ({ page }) => {
    await inCall(page);
    await pick(page, "Add a photo", { name: "navy.jpg", mimeType: "image/jpeg", buffer: await jpeg("#1f2a44") });
    await expect(pasted(page)).toHaveAttribute("src", /-v1\.jpg/);

    await pick(page, "Replace", { name: "red.jpg", mimeType: "image/jpeg", buffer: await jpeg("#b42318") });
    await expect(pasted(page)).toHaveAttribute("src", /-v2\.jpg/);
    expect(await photoRows()).toMatchObject([{ version: 2, status: "ready" }]);

    await pick(page, "Add another photo", { name: "green.jpg", mimeType: "image/jpeg", buffer: await jpeg("#0b6b4f") });
    const thumbnails = page.getByRole("list", { name: "Your photos" });
    await expect(thumbnails.getByRole("button")).toHaveCount(2);
    await expect(thumbnails.getByRole("button", { name: "Photo 2 of 2" })).toHaveAttribute("aria-pressed", "true");
    await expect(thumbnails.getByText("Active")).toBeVisible();
    await expect(pasted(page)).toHaveAttribute("src", /-v1\.jpg/);
    await noSeriousA11yProblems(page);

    // Switching the active photo.
    await thumbnails.getByRole("button", { name: "Photo 1 of 2" }).click();
    await expect(thumbnails.getByRole("button", { name: "Photo 1 of 2" })).toHaveAttribute("aria-pressed", "true");
    await expect(pasted(page)).toHaveAttribute("src", /-v2\.jpg/);
    await expect.poll(async () => (await photoRows()).map((r) => r.active)).toEqual([true, false]);

    // Removing the active one leaves the other.
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(thumbnails).toHaveCount(0);
    await expect(pasted(page)).toHaveAttribute("src", /-v1\.jpg/);
    await expect.poll(async () => (await photoRows()).length).toBe(1);

    // End deletes the photos with the notes (R63).
    await page.getByRole("button", { name: "End", exact: true }).click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText("Conversation ended.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Style around this item" })).toHaveCount(0);
    await expect.poll(photoRows).toEqual([]);
    await expect.poll(async () => ((await serverDb().storage.from("guest-photos").list(guest.id)).data ?? []).filter((f) => f.id).length).toBe(0);
  });

  test("a failed upload keeps the photo in place with Try again (R32)", async ({ page }) => {
    await inCall(page);
    let failures = 1;
    await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
      if (route.request().method() === "PUT" && failures-- > 0) await route.abort("connectionreset");
      else await route.continue();
    });
    await pick(page, "Add a photo", { name: "jacket.jpg", mimeType: "image/jpeg", buffer: await jpeg("#1f2a44") });
    await expect(page.getByText("The photo didn’t upload.")).toBeVisible();
    await expect(pasted(page)).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(pasted(page)).toHaveAttribute("src", /supabase\.co.*\.jpg/);
    await expect(page.getByText("The photo didn’t upload.")).toHaveCount(0);
    expect(await photoRows()).toMatchObject([{ status: "ready", active: true }]);
  });
});
