import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { canRunDatabaseTests, clearPhotos, serverDb, type TestGuest } from "../tests/support/test-guests";
import { noSeriousA11yProblems } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";
import { commandsSent, fakeMicrophone, playInCall, scriptDone } from "./support/microphone";

// 3b: the photo reader, in the browser, with the fake reader (core/photos/fake-reader.ts), which goes by
// the photo's shape: a portrait photo is a navy wool blazer, a wide one shows two items, and a very tall
// one can't be read. Phase 3 automated test: an upload shows the photo before analysis finishes (R27),
// then its details with statuses (R28), several items (R29), owned or inspiration (R30), corrections
// by voice, and "Describe it instead" (R32). The stylist is told, and speaks up (Q1 in 3b).
test.describe("the photo reader", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  const photo = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#1f2a44" } }).jpeg().toBuffer();
  const area = (page: Page) => page.getByRole("region", { name: "Style around this item" });
  const details = (page: Page, name: string) => area(page).getByRole("list", { name: `${name}: details` });
  const saved = async () => (await serverDb().from("session_assets").select("recognized_details, ownership").eq("user_id", guest.id).single()).data!;
  const contextSent = async (page: Page) =>
    (await commandsSent(page))
      .filter((c) => c.name === "updateContext")
      .map((c) => String(c.value))
      .at(-1) ?? "";

  async function inCall(page: Page) {
    await fakeMicrophone(page, "allowed", true);
    await page.goto("/session");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeEnabled();
    await expect.poll(() => scriptDone(page)).toBe(true);
  }
  async function addPhoto(page: Page, buffer: Buffer) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add a photo" }).click();
    await (await chooser).setFiles({ name: "item.jpg", mimeType: "image/jpeg", buffer });
  }
  const say = (page: Page, text: string, turnId: string) => playInCall(page, { type: "words", speaker: "shopper", text, final: true, turnId });

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

  test("shows Analyzing, then the item with its details; a tapped detail turns to ink, and It's mine marks it (R28, R30)", async ({ page }) => {
    await inCall(page);
    await addPhoto(page, await photo(300, 400));
    await expect(area(page).getByText("Analyzing")).toBeVisible();
    await expect(area(page).getByText("Navy wool blazer", { exact: true })).toBeVisible();
    await expect(area(page).getByText("Analyzing")).toHaveCount(0);

    // Sure details are in ink, the rest To confirm (R28).
    const list = details(page, "Navy wool blazer");
    await expect(list.getByRole("listitem").filter({ hasText: "Type: blazer" })).toContainText("Confirmed");
    await expect(list.getByRole("listitem").filter({ hasText: "Colors: navy" })).toContainText("To confirm");
    await expect(area(page).getByText("Ownership: To confirm")).toBeVisible();
    await noSeriousA11yProblems(page);

    // The stylist knows the item, and speaks up about it (Q1 in 3b).
    await expect.poll(() => contextSent(page)).toContain("Navy wool blazer");
    await expect.poll(async () => (await commandsSent(page)).some((c) => c.name === "sendPhrase" && String(c.value).includes("photo"))).toBe(true);

    await list.getByRole("button", { name: /Colors: navy/ }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(list.getByRole("listitem").filter({ hasText: "Colors: navy" })).toContainText("Confirmed");
    await expect.poll(async () => (await saved()).recognized_details.items[0].details.colors.status).toBe("confirmed");

    await area(page).getByRole("button", { name: "It’s mine" }).click();
    await expect(area(page).getByText("You own this")).toBeVisible();
    await expect(area(page).getByRole("button", { name: "It’s mine" })).toHaveCount(0);
    await expect.poll(async () => (await saved()).ownership).toBe("owned");
    await expect.poll(() => contextSent(page)).toContain("Ownership: theirs");

    // A resumed session keeps what was read and chosen.
    await page.reload();
    await expect(area(page).getByText("You own this")).toBeVisible();
    await expect(details(page, "Navy wool blazer").getByRole("listitem").filter({ hasText: "Colors: navy" })).toContainText("Confirmed");
  });

  test("with several items, she asks which, and the chosen one is marked with its details (R29)", async ({ page }) => {
    await inCall(page);
    await addPhoto(page, await photo(800, 400));
    const which = area(page).getByRole("group", { name: "Which item should we style around?" });
    await expect(which.getByRole("button", { name: "1. Denim jacket" })).toBeVisible();
    await expect(which.getByRole("button", { name: "2. White T-shirt" })).toBeVisible();
    await expect.poll(() => contextSent(page)).toContain("Ask which one to style around");
    await noSeriousA11yProblems(page);

    await which.getByRole("button", { name: "2. White T-shirt" }).click();
    const chosen = area(page).getByRole("group", { name: "Styling around" });
    await expect(chosen.getByRole("button", { name: "2. White T-shirt" })).toHaveAttribute("aria-pressed", "true");
    await expect(details(page, "White T-shirt").getByRole("listitem").filter({ hasText: "Type: t-shirt" })).toBeVisible();
    await expect.poll(async () => (await saved()).recognized_details.chosen).toBe(1);
    await expect.poll(() => contextSent(page)).toContain("White T-shirt");
  });

  test("corrections by voice: 'actually it's black', 'it's mine' and 'the first one' (R28 to R30)", async ({ page }) => {
    await inCall(page);
    await addPhoto(page, await photo(300, 400));
    await expect(area(page).getByText("Navy wool blazer", { exact: true })).toBeVisible();

    await say(page, "Actually it's black", "1");
    await expect(area(page).getByText("Black wool blazer", { exact: true })).toBeVisible();
    await expect(details(page, "Black wool blazer").getByRole("listitem").filter({ hasText: "Colors: black" })).toContainText("Confirmed");
    await say(page, "It's mine", "2");
    await expect(area(page).getByText("You own this")).toBeVisible();
    await expect.poll(async () => (await saved()).ownership).toBe("owned");

    // Several items: "the first one" picks it.
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add another photo" }).click();
    await (await chooser).setFiles({ name: "two.jpg", mimeType: "image/jpeg", buffer: await photo(800, 400) });
    await expect(area(page).getByRole("group", { name: "Which item should we style around?" })).toBeVisible();
    await say(page, "The first one", "3");
    await expect(area(page).getByRole("group", { name: "Styling around" }).getByRole("button", { name: "1. Denim jacket" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a photo that can't be read says to describe it, and describing it out loud fills it in (R32)", async ({ page }) => {
    await inCall(page);
    await addPhoto(page, await photo(200, 500));
    await expect(area(page).locator("p:not([aria-live])", { hasText: "Couldn't recognize this item. Describe it instead." })).toBeVisible();
    await expect(area(page).getByRole("img", { name: /to style around/ })).toBeVisible();
    await expect.poll(() => contextSent(page)).toContain("Ask them to describe it");

    await say(page, "It's a black blazer", "1");
    await expect(area(page).getByText("Black blazer", { exact: true })).toBeVisible();
    await expect(details(page, "Black blazer").getByRole("listitem").filter({ hasText: "Type: blazer" })).toContainText("Confirmed");
  });
});
