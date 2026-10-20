import { expect, test } from "@playwright/test";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { signInTestGuest } from "./support/guest";

// A visit keeps a guest from being deleted after 7 days without use (R3).
test.describe("a returning guest", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let guest: TestGuest;
  test.beforeEach(async ({ context }) => {
    guest = await signInTestGuest(context);
  });
  test.afterEach(async () => guest?.remove());

  test("is marked active when they open a page", async ({ page }) => {
    const db = serverDb();
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    await db.from("profiles").update({ last_active_at: twoHoursAgo }).eq("user_id", guest.id).throwOnError();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect
      .poll(async () => {
        const { data } = await db.from("profiles").select("last_active_at").eq("user_id", guest.id).single();
        return Date.now() - new Date(data!.last_active_at).getTime();
      })
      .toBeLessThan(60_000);
  });
});
