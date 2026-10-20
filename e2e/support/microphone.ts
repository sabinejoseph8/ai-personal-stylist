import type { Page } from "@playwright/test";

/**
 * A stand-in microphone for browser tests: allowed (the browser hasn't been asked yet, or already
 * said yes), blocked by the shopper, or missing. Tests can't use a real microphone.
 */
export async function fakeMicrophone(page: Page, mode: "allowed" | "blocked" | "missing", alreadyAllowed = false) {
  await page.addInitScript(
    ({ mode, alreadyAllowed }) => {
      const getUserMedia = async () => {
        if (mode === "blocked") throw new DOMException("Permission denied", "NotAllowedError");
        if (mode === "missing") throw new DOMException("Requested device not found", "NotFoundError");
        return new MediaStream();
      };
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
      const permissions = navigator.permissions;
      const query = permissions?.query?.bind(permissions);
      if (permissions && query) {
        permissions.query = (async (d: PermissionDescriptor) =>
          d.name === ("microphone" as PermissionName) ? { state: alreadyAllowed ? "granted" : "prompt" } : query(d)) as typeof permissions.query;
      }
    },
    { mode, alreadyAllowed },
  );
}

/** Plays one event in the running fake call (connectors/conversation/fake.ts). */
export async function playInCall(page: Page, event: Record<string, unknown>) {
  await page.evaluate((e) => (window as unknown as { fakeConversation: { play: (e: unknown) => void } }).fakeConversation.play(e), event);
}

/** The commands the screen sent to the fake call, in order. */
export async function commandsSent(page: Page): Promise<{ name: string; value?: unknown }[]> {
  return page.evaluate(() => (window as unknown as { fakeConversation: { commands: { name: string; value?: unknown }[] } }).fakeConversation.commands);
}
