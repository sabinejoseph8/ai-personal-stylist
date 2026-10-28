import { expect, test } from "@playwright/test";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest, resetGuest } from "./support/guest";

// Phase 1 end-to-end tests: welcome, Try the demo, the sample profile and the setup steps (1d).

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

  test("sees Try again, not a stuck button, when the connection drops (Phase 1 code review)", async ({ page }) => {
    // The real bot check can't run in tests: a stand-in passes at once, then the request fails.
    await page.route("https://challenges.cloudflare.com/**", (route) => route.abort());
    await page.addInitScript(() => {
      (window as unknown as { turnstile: unknown }).turnstile = {
        render: (_el: HTMLElement, opts: { callback: (token: string) => void }) => {
          (window as unknown as { pass: () => void }).pass = () => opts.callback("test-token");
          return "widget";
        },
        execute: () => (window as unknown as { pass: () => void }).pass(),
        reset: () => {},
      };
    });
    await page.route("**/api/guest", (route) => route.abort("internetdisconnected"));
    await page.goto("/");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "We couldn't start your demo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
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
  // One test guest per worker, reset before each test (see e2e/support/guest.ts).
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

  test("editing the profile after the sample profile keeps it (found on Sabine's iPhone in 1g)", async ({ page }) => {
    // The same moves as on the phone: setup opens by navigating in the app, not by a fresh page load.
    await page.goto("/");
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await page.getByRole("button", { name: "Use a sample profile" }).click();
    await expect(page).toHaveURL("/session");
    await expect(page.getByText("Never: high heels", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Edit your profile" }).click();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "Womenswear", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Amount ($)")).toHaveValue("400");
    // The sample profile's rules are ready-made, so they're read back at once (4a).
    await expect(page.getByText("Read as: no shoes with heels over 5 cm")).toBeVisible();
    await page.getByRole("button", { name: "Finish setup" }).click();
    await expect(page).toHaveURL("/session");
    await expect(page.getByText("Never: high heels", { exact: true })).toBeVisible();
    await expect(page.getByText("Classic, Elegant")).toBeVisible();
  });

  test("can go through setup with Back, Skip and Continue, and answers are saved (R4)", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await noSeriousA11yProblems(page);
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
    await noSeriousA11yProblems(page);
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

  test("each Must have and Never shows how it's read, and is saved with its rule (4a, Sabine's Q1 and Q3)", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    const add = async (kind: string, words: string) => {
      await page.getByLabel(`Add a ${kind} preference`).fill(words);
      await page.getByLabel(`Add a ${kind} preference`).press("Enter");
    };
    await add("Never", "high heels");
    await expect(page.getByText("Read as: no shoes with heels over 5 cm")).toBeVisible();
    await add("Must have", "sleeves");
    await expect(page.getByText("Read as: only tops, dresses and jackets with sleeves (not sleeveless)")).toBeVisible();
    // Not about a product detail: the stylist's judgment checks it (Sabine's Q3).
    await add("Never", "anything too flashy");
    await expect(page.getByText("Read as: checked by your stylist's judgment")).toBeVisible();
    // Likes only guide choices, so they aren't read as rules.
    await add("Likes", "earth tones");
    await expect(page.getByText(/Read as/)).toHaveCount(3);
    await noSeriousA11yProblems(page);
    await page.getByRole("button", { name: "Finish setup" }).click();
    await expect(page).toHaveURL("/session");

    const { data } = await serverDb().from("saved_preferences").select("words, rule").eq("user_id", guest.id).order("created_at");
    expect(data).toEqual([
      { words: "high heels", rule: { type: "detail", categories: ["shoes"], test: { detail: "heelCm", op: "over", value: 5 } } },
      { words: "sleeves", rule: { type: "detail", categories: [], test: { detail: "sleeve", op: "one_of", values: ["cap", "short", "elbow", "three_quarter", "long"] } } },
      { words: "anything too flashy", rule: { type: "judged" } },
      { words: "earth tones", rule: null },
    ]);
  });

  test("a preference saved before rules existed gets its rule when setup opens (4a)", async ({ page }) => {
    await serverDb().from("saved_preferences").insert({ user_id: guest.id, kind: "never", words: "high heels" }).throwOnError();
    await page.goto("/setup");
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByText("Read as: no shoes with heels over 5 cm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Finish setup" })).toBeEnabled();
  });

  test("a save that can't reach the server shows a message, not an error screen (Phase 1 code review)", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await page.route("**/setup", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("That didn't save. Check your connection and try again.")).toBeVisible();
    await expect(page.getByText("Step 2 of 3")).toBeVisible();
  });

  test("a very large budget is explained in plain words (Phase 1 code review)", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByLabel("Amount ($)").fill("250000");
    await page.getByRole("button", { name: "Finish setup" }).click();
    await expect(page.getByText("Enter a budget up to $100,000.")).toBeVisible();
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
