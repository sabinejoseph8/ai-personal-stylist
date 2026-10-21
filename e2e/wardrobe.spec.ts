import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { canRunDatabaseTests, clearPhotos, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { commandsSent, fakeMicrophone, scriptDone } from "./support/microphone";

// 3d: the wardrobe in the browser, with the fake photo reader (a portrait photo is a navy wool blazer).
// Phase 3 automated test: wardrobe add, edit and delete all work. And the Phase 3 manual check: saving
// the jacket asks about photo storage once, then it appears in Wardrobe (R36, R37).
test.describe("the wardrobe", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  const photo = () => sharp({ create: { width: 300, height: 400, channels: 3, background: "#1f2a44" } }).jpeg().toBuffer();
  const wardrobe = (page: Page) => page.getByRole("list", { name: "Your wardrobe" });

  async function inCall(page: Page) {
    await fakeMicrophone(page, "allowed", true);
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    await expect.poll(() => scriptDone(page)).toBe(true);
  }
  async function pick(page: Page, button: string, exact = true) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: button, exact }).click();
    await (await chooser).setFiles({ name: "item.jpg", mimeType: "image/jpeg", buffer: await photo() });
  }
  async function ownedBlazer(page: Page, button: string) {
    await pick(page, button);
    const area = page.getByRole("region", { name: "Style around this item" });
    // Reading the photo can take a few seconds while other tests run.
    await expect(area.getByText("Navy wool blazer", { exact: true })).toBeVisible({ timeout: 15_000 });
    await area.getByRole("button", { name: "It’s mine" }).click();
    return area;
  }

  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    const db = serverDb();
    await Promise.all([
      db.from("sessions").delete().eq("user_id", guest.id).throwOnError(),
      db.from("wardrobe_items").delete().eq("user_id", guest.id).throwOnError(),
      db.from("consents").update({ wardrobe_photos_at: null }).eq("user_id", guest.id).throwOnError(),
      db.from("usage").delete().eq("user_id", guest.id).throwOnError(),
      db.from("rate_limits").delete().eq("user_id", guest.id).throwOnError(),
      clearPhotos(guest.id),
    ]);
    await context.addCookies(shared.cookies);
  });

  test("Save to wardrobe asks about photo storage once, then the item appears in Wardrobe (R36)", async ({ page }) => {
    await inCall(page);
    let area = await ownedBlazer(page, "Add a photo");
    await area.getByRole("button", { name: "Save to wardrobe" }).click();
    await expect(page.getByRole("heading", { name: "Save photos to your wardrobe" })).toBeVisible();
    await noSeriousA11yProblems(page);
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(area.getByText("Saved to your wardrobe.")).toBeVisible();

    // The second time, no question.
    area = await ownedBlazer(page, "Add another photo");
    await area.getByRole("button", { name: "Save to wardrobe" }).click();
    await expect(area.getByText("Saved to your wardrobe.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Save photos to your wardrobe" })).toHaveCount(0);

    await area.getByRole("link", { name: "Wardrobe" }).click();
    await expect(page.getByRole("heading", { name: "Wardrobe", level: 1 })).toBeVisible();
    await expect(wardrobe(page).getByRole("listitem")).toHaveCount(2);
    await expect(wardrobe(page).getByText("Navy wool blazer").first()).toBeVisible();
  });

  test("Add item, filters, edit and delete on the Wardrobe page (R37, Q1)", async ({ page }) => {
    await page.goto("/wardrobe");
    await expect(page.getByText("Your wardrobe is empty. Add a photo of something you own.")).toBeVisible();
    await noSeriousA11yProblems(page);

    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByRole("heading", { name: "Save photos to your wardrobe" })).toBeVisible();
    await pick(page, "Allow");
    // The photo reader suggests the details, to check before adding.
    const sheet = page.getByRole("dialog", { name: "Check the details" });
    await expect(sheet.getByLabel("Name")).toHaveValue("Navy wool blazer");
    await expect(sheet.getByLabel("Category")).toHaveValue("outerwear");
    await noSeriousA11yProblems(page);
    await sheet.getByLabel("Name").fill("Work blazer");
    await sheet.getByRole("button", { name: "Add to wardrobe" }).click();
    await expect(wardrobe(page).getByText("Work blazer")).toBeVisible();

    // Filters.
    await page.getByRole("button", { name: "Shoes" }).click();
    await expect(wardrobe(page).getByRole("listitem")).toHaveCount(0);
    await page.getByRole("button", { name: "Outerwear" }).click();
    await expect(wardrobe(page).getByRole("listitem")).toHaveCount(1);

    // Edit: it moves to Tops.
    await wardrobe(page).getByRole("button", { name: /Work blazer/ }).click();
    const edit = page.getByRole("dialog", { name: "Edit item" });
    await edit.getByLabel("Category").selectOption("tops");
    await edit.getByLabel("Colors").fill("navy blue");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(wardrobe(page).getByRole("listitem")).toHaveCount(0);
    await page.getByRole("button", { name: "Tops" }).click();
    await expect(wardrobe(page).getByText("Work blazer")).toBeVisible();
    await expect.poll(async () => (await serverDb().from("wardrobe_items").select("category, details").eq("user_id", guest.id)).data).toEqual([
      { category: "tops", details: { type: "blazer", colors: "navy blue", pattern: "solid", style: "classic" } },
    ]);

    // Delete asks first, and removes the photo too.
    await wardrobe(page).getByRole("button", { name: /Work blazer/ }).click();
    await page.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete item" }).click();
    await page.getByRole("button", { name: "All" }).click();
    await expect(page.getByText("Your wardrobe is empty. Add a photo of something you own.")).toBeVisible();
    await expect.poll(async () => ((await serverDb().storage.from("guest-photos").list(`${guest.id}/wardrobe`)).data ?? []).filter((f) => f.id).length).toBe(0);
  });

  test("Style with these puts the items in My Styling Notes and tells the stylist (R37, Q2)", async ({ page }) => {
    await serverDb()
      .from("wardrobe_items")
      .insert([
        { user_id: guest.id, name: "Navy wool blazer", category: "outerwear", details: { type: "blazer", colors: "navy", pattern: "solid", style: "classic" } },
        { user_id: guest.id, name: "White leather sneakers", category: "shoes", details: { type: "sneakers", colors: "white", pattern: "solid", style: "minimal" } },
      ])
      .throwOnError();
    await page.goto("/wardrobe");
    await page.getByRole("button", { name: "Select" }).click();
    await wardrobe(page).getByRole("button", { name: /Navy wool blazer/ }).click();
    await wardrobe(page).getByRole("button", { name: /White leather sneakers/ }).click();
    await expect(wardrobe(page).getByRole("button", { name: /Navy wool blazer/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Style with these" }).click();

    await expect(page).toHaveURL(/\/session$/);
    const notes = page.getByRole("region", { name: "From your wardrobe" });
    await expect(notes.getByText("Navy wool blazer")).toBeVisible();
    await expect(notes.getByText("White leather sneakers")).toBeVisible();
    await noSeriousA11yProblems(page);

    // As the call starts, she's told about them.
    await fakeMicrophone(page, "allowed", true);
    await page.reload();
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    await expect
      .poll(async () => (await commandsSent(page)).filter((c) => c.name === "updateContext").map((c) => String(c.value)).join("\n"))
      .toContain("The shopper chose these items they own, from their wardrobe, to style with: Navy wool blazer");
  });
});
