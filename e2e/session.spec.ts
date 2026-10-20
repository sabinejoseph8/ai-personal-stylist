import { expect, test } from "@playwright/test";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";

// 2a: Start conversation, End and resuming (R12), with the fake engine (playwright.config.ts).
test.describe("a styling session", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    const db = serverDb();
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    await db.from("usage").delete().eq("user_id", guest.id).throwOnError();
    await context.addCookies(shared.cookies);
  });

  test("starts with Start conversation and ends with End (R12)", async ({ page }) => {
    await page.goto("/session");
    await expect(page.getByText("Your stylist will appear here.")).toBeVisible();
    await noSeriousA11yProblems(page);
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End" })).toBeVisible();
    await expect(page.getByText(/^(Listening|Speaking)$/)).toBeVisible();

    await page.getByRole("button", { name: "End" }).click();
    await expect(page.getByText("Conversation ended.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start conversation" })).toBeVisible();
    const { data } = await serverDb().from("sessions").select("status").eq("user_id", guest.id);
    expect(data).toEqual([{ status: "ended" }]);
  });

  test("offers to resume the same session after leaving the page (R12)", async ({ page }) => {
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End" })).toBeVisible();
    const first = (await serverDb().from("sessions").select("id").eq("user_id", guest.id).single()).data!.id;

    await page.reload();
    await expect(page.getByRole("button", { name: "Resume conversation" })).toBeVisible();
    await page.getByRole("button", { name: "Resume conversation" }).click();
    await expect(page.getByRole("button", { name: "End" })).toBeVisible();
    const { data } = await serverDb().from("sessions").select("id, status").eq("user_id", guest.id);
    expect(data).toEqual([{ id: first, status: "active" }]);
    await page.getByRole("button", { name: "End" }).click();
    await expect(page.getByRole("button", { name: "Start conversation" })).toBeVisible();
  });
});
