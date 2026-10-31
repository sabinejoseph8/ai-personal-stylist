import { expect, test } from "@playwright/test";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { openFromMenu } from "./support/menu";

// 7a: the app bar and menu (design 4: App bar and menu). Phones and tablets open a Menu sheet; desktops
// show the items across the top. A new visitor sees only what they can use yet (Sabine's answer to Q1).

const GUEST_ITEMS = ["Session", "Wardrobe", "Saved looks", "Demo bag", "Profile and privacy", "About this project", "Behind the scenes"];

/** The menu's items as shown, opening the Menu sheet first on phones. */
async function menuItems(page: import("@playwright/test").Page) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    return page.getByRole("dialog", { name: "Menu" }).getByRole("listitem").allTextContents();
  }
  return page.getByRole("navigation", { name: "Main" }).getByRole("listitem").allTextContents();
}

test("a new visitor's menu has Try the demo and About this project, and the name goes to the start", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("banner").getByRole("link", { name: "AI Personal Stylist" })).toHaveAttribute("href", "/");
  expect(await menuItems(page)).toEqual(["Try the demo", "About this project"]);
  await noSeriousA11yProblems(page);
});

test.describe("a guest's menu", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    await serverDb().from("rate_limits").delete().eq("user_id", guest.id).throwOnError();
    await context.addCookies(shared.cookies);
  });

  test("has all seven items, marks the page you're on, and goes where it says", async ({ page }) => {
    await page.goto("/wardrobe");
    expect(await menuItems(page)).toEqual(GUEST_ITEMS);
    // The page you're on is marked, in the open menu on phones and across the top on desktops.
    await expect(page.getByRole("link", { name: "Wardrobe", exact: true })).toHaveAttribute("aria-current", "page");
    await noSeriousA11yProblems(page);
    await page.keyboard.press("Escape");
    await openFromMenu(page, "Saved looks");
    await expect(page.getByRole("heading", { name: "Saved looks", level: 1 })).toBeVisible();
    await openFromMenu(page, "Profile and privacy");
    await expect(page.getByRole("heading", { name: "Profile and privacy", level: 1 })).toBeVisible();
    await openFromMenu(page, "Session");
    await expect(page.getByRole("heading", { name: "Your styling session", level: 1 })).toBeVisible();
  });

  test("Behind the scenes opens on the session page, from the session page or from another page", async ({ page }) => {
    await page.goto("/session");
    await openFromMenu(page, "Behind the scenes");
    const panel = page.getByRole("dialog", { name: "Behind the scenes" });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await page.goto("/bag");
    await openFromMenu(page, "Behind the scenes");
    await expect(panel).toBeVisible();
    // The ?behind=1 that brought it here is dropped once it has opened, so a reload after closing it
    // doesn't open it again (Phase 7 review).
    await expect(page).toHaveURL(/\/session$/);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your styling session", level: 1 })).toBeVisible();
    await expect(panel).toHaveCount(0);
  });
});
