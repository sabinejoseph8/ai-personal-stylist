import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { signInTestGuest } from "./support/guest";

// Phase 1 end-to-end tests: welcome, Try the demo, the sample profile and the setup steps (1d).

async function noSeriousA11yProblems(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("a first-time visitor", () => {
  test("sees the welcome screen, the inked notebook and the small print (R1)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Say what you need. Watch your stylist take notes." })).toBeVisible();
    await expect(page.getByText("Sample products only. Nothing here is for sale.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try the demo" })).toBeVisible();
    for (const note of ["Outdoor wedding, November", "Elegant", "Emerald green, preferred", "Budget: up to $500"]) {
      await expect(page.getByText(note)).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "How it was built" })).toHaveAttribute("href", "/about");
    await noSeriousA11yProblems(page);
  });

  test("can't open setup without being a guest", async ({ page }) => {
    await page.goto("/setup");
    await expect(page).toHaveURL("/");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the notebook shows the finished page at once", async ({ page }) => {
    await page.goto("/");
    const last = page.getByText("Budget: up to $500");
    const duration = await last.evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(duration).toBeLessThan(0.01);
  });
});

test.describe("a guest", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let guest: TestGuest;
  test.beforeEach(async ({ context }) => {
    guest = await signInTestGuest(context);
  });
  test.afterEach(async () => guest?.remove());

  test("can use the sample profile, which includes Never: high heels (R5)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await noSeriousA11yProblems(page);
    await page.getByRole("button", { name: "Use a sample profile" }).click();
    await expect(page).toHaveURL("/session");
    await expect(page.getByText("Never: high heels", { exact: true })).toBeVisible();
    await expect(page.getByText("Up to $400")).toBeVisible();
  });

  test("can go through setup with Back, Skip and Continue, and answers are saved (R4)", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 3")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();

    await page.getByRole("button", { name: "Menswear", exact: true }).click();
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await page.getByLabel("Top").fill("L");
    await noSeriousA11yProblems(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    await page.getByRole("radio", { name: "Between" }).click();
    await page.getByLabel("From ($)").fill("200");
    await page.getByLabel("To ($)").fill("300");
    await page.getByLabel("Add a Never preference").fill("neon");
    await page.getByLabel("Add a Never preference").press("Enter");
    await expect(page.getByRole("button", { name: "Remove Never: neon" })).toBeVisible();
    await noSeriousA11yProblems(page);
    await page.getByRole("button", { name: "Finish setup" }).click();

    await expect(page).toHaveURL("/session");
    await expect(page.getByText("Never: neon", { exact: true })).toBeVisible();
    await expect(page.getByText("$200 to $300")).toBeVisible();

    const { data } = await serverDb().from("profiles").select("departments, style_words, sizes, budget_meaning").eq("user_id", guest.id).single();
    expect(data).toEqual({ departments: ["menswear"], style_words: ["Bold"], sizes: { top: "L" }, budget_meaning: "between" });
  });

  test("a budget with the amounts the wrong way round shows a clear message", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("radio", { name: "Between" }).click();
    await page.getByLabel("From ($)").fill("300");
    await page.getByLabel("To ($)").fill("200");
    await page.getByRole("button", { name: "Finish setup" }).click();
    await expect(page.getByText(/second one higher/)).toBeVisible();
  });
});
