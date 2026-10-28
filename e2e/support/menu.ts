import type { Page } from "@playwright/test";

/**
 * Opens an item from the app menu (7a): on phones and tablets from the Menu sheet, on desktops from the
 * items across the top. Items are links, apart from Behind the scenes on the session page, a button.
 */
export async function openFromMenu(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const scope = (await menu.isVisible()) ? (await menu.click(), page.getByRole("dialog", { name: "Menu" })) : page.getByRole("navigation", { name: "Main" });
  await scope.getByRole("link", { name, exact: true }).or(scope.getByRole("button", { name, exact: true })).click();
}
