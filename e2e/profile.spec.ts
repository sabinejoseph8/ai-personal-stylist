import { expect, test } from "@playwright/test";
import { SAMPLE_PROFILE } from "../lib/profile";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";

// 6b: Profile and privacy in the browser (R63 to R66, design 5.8): the four sections, deleting a saved
// preference, turning off saving preferences (Sabine's answer to Q3), the data download (a ZIP, Q1), and
// Delete all landing on the welcome screen with no old data (S19).
test.describe("profile and privacy", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;

  async function sampleProfile(g: TestGuest) {
    const { departments, styleWords, sizes, budget, preferences } = SAMPLE_PROFILE;
    await g.db
      .from("profiles")
      .upsert({ user_id: g.id, departments, style_words: styleWords, sizes, budget_meaning: budget?.meaning ?? null, budget_amount_cents: budget ? budget.amount * 100 : null }, { onConflict: "user_id" })
      .throwOnError();
    await g.db.rpc("replace_saved_preferences", { items: preferences.map((p) => ({ kind: p.kind, words: p.words, rule: p.rule ?? null })) }).throwOnError();
    await serverDb().from("consents").update({ remember_preferences_at: new Date().toISOString() }).eq("user_id", g.id).throwOnError();
  }

  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    await serverDb().from("rate_limits").delete().eq("user_id", guest.id).throwOnError();
    await sampleProfile(guest);
    await context.addCookies(shared.cookies);
  });

  test("shows the four sections, deletes a preference, turns off saving preferences, and downloads a ZIP (R64, R65)", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Your profile", "Saved preferences", "Permissions", "Your data"]);
    const prefs = page.getByRole("region", { name: "Saved preferences" });
    await expect(prefs).toContainText("Never: high heels");
    await noSeriousA11yProblems(page);

    // Delete one, after confirming.
    await prefs.getByRole("listitem").filter({ hasText: "Never: high heels" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete preference" }).click();
    await expect(prefs).not.toContainText("Never: high heels");
    await expect(prefs).toContainText("Must have: sleeves");

    // Saving preferences off deletes the rest.
    const permissions = page.getByRole("region", { name: "Permissions" });
    await expect(permissions).toContainText("Saving preferences Allowed");
    await permissions.getByRole("button", { name: "Turn off" }).last().click();
    await page.getByRole("button", { name: "Turn off and delete" }).click();
    await expect(prefs).toContainText("No saved preferences");
    await expect(permissions).toContainText("Saving preferences Not allowed");

    // Download my data: a ZIP file.
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download my data" }).click();
    expect((await download).suggestedFilename()).toMatch(/^ai-stylist-my-data-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  test("Delete all my data returns to the welcome screen, and nothing old is left (S19)", async ({ page, context }) => {
    const fresh = await createBrowserGuest({ fresh: true });
    try {
      await sampleProfile(fresh.guest);
      await context.clearCookies();
      await context.addCookies(fresh.cookies);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      await page.getByRole("link", { name: "Profile and privacy" }).click();
      await page.getByRole("button", { name: "Delete all my data" }).click();
      await expect(page.getByRole("dialog", { name: "Delete all your data?" })).toContainText("This can't be undone.");
      await page.getByRole("button", { name: "Delete all data" }).click();
      await expect(page.getByRole("heading", { name: "Say what you need. Watch your stylist take notes." })).toBeVisible({ timeout: 15_000 });
      expect((await serverDb().auth.admin.getUserById(fresh.guest.id)).data.user).toBeNull();
      expect(await (await page.request.get("/api/guest")).json()).toEqual({ guest: false });
    } finally {
      await fresh.guest.remove().catch(() => undefined);
    }
  });
});
