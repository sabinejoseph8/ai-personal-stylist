import { expect, type Page, test } from "@playwright/test";
import { canRunDatabaseTests, type TestGuest } from "../tests/support/test-guests";
import { type BrowserGuest, createBrowserGuest, resetGuest } from "./support/guest";
import { openFromMenu } from "./support/menu";

// Camera and microphone are allowed only on the session page. Chrome keeps the permissions policy of the
// page a visit was loaded on, so a move into /session inside the app left the microphone off there
// ("Microphone needed" on a laptop after setup, found while recording the demo video, 30 Oct 2026).
// Every way in is now a full load, and the session page reloads once if the policy is still off.
// Chrome only: Safari and Firefox don't expose the policy (and Safari doesn't apply it).

async function microphoneAllowed(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const policy = (document as Document & { featurePolicy?: { allowsFeature(name: string): boolean } }).featurePolicy;
    return policy ? policy.allowsFeature("microphone") : null;
  });
}

test.describe("the way into the session", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  test.skip(({ browserName }) => browserName !== "chromium", "only Chrome applies and exposes the policy");
  let shared: BrowserGuest;
  let guest: TestGuest;
  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    await resetGuest(guest.id);
    await context.addCookies(shared.cookies);
  });

  test("after setup, the session page may use the microphone (found 30 Oct 2026)", async ({ page }) => {
    await page.goto("/setup");
    expect(await microphoneAllowed(page)).toBe(false); // setup itself keeps it off
    await page.getByRole("button", { name: "Use a sample profile" }).click();
    await expect(page).toHaveURL("/session");
    await expect(page.getByText("Never: high heels", { exact: true })).toBeVisible();
    expect(await microphoneAllowed(page)).toBe(true);
  });

  test("from the menu and from Continue, too", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Use a sample profile" }).click();
    await expect(page).toHaveURL("/session");
    await page.goto("/profile");
    await openFromMenu(page, "Session");
    await expect(page).toHaveURL("/session");
    await expect(page.getByText("Never: high heels", { exact: true })).toBeVisible();
    expect(await microphoneAllowed(page)).toBe(true);
    await page.goto("/");
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL("/session");
    await expect(page.getByText("Never: high heels", { exact: true })).toBeVisible();
    expect(await microphoneAllowed(page)).toBe(true);
  });

  test("reached inside the app some other way, the session page reloads once to allow it", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Use a sample profile" }).click();
    await expect(page).toHaveURL("/session");
    await page.goto("/profile");
    // A move inside the app that isn't a full load (as Back can be).
    const reloaded = page.waitForEvent("load");
    await page.evaluate(() => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push("/session"));
    await reloaded;
    await expect(page).toHaveURL("/session");
    await expect(page.getByText("Never: high heels", { exact: true })).toBeVisible();
    expect(await microphoneAllowed(page)).toBe(true);
  });
});
