import type { Page } from "@playwright/test";

/**
 * A stand-in microphone for browser tests: allowed (the browser hasn't been asked yet, or already
 * said yes), blocked by the shopper, or missing. Tests can't use a real microphone. The camera (3c)
 * is a drawn picture from two pretend cameras, or blocked, or missing.
 */
export async function fakeMicrophone(
  page: Page,
  mode: "allowed" | "blocked" | "missing",
  alreadyAllowed = false,
  camera: "allowed" | "blocked" | "missing" = "allowed",
) {
  await page.addInitScript(
    ({ mode, alreadyAllowed, camera }) => {
      const pretendCamera = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const draw = () => {
          const g = canvas.getContext("2d")!;
          g.fillStyle = "#e9e4da";
          g.fillRect(0, 0, 640, 480);
          g.fillStyle = "#1f2a44";
          g.fillRect(220, 90, 200, 300);
        };
        draw();
        setInterval(draw, 100);
        return canvas.captureStream(10);
      };
      const getUserMedia = async (constraints?: MediaStreamConstraints) => {
        if (constraints?.video) {
          if (camera === "blocked") throw new DOMException("Permission denied", "NotAllowedError");
          if (camera === "missing") throw new DOMException("Requested device not found", "NotFoundError");
          return pretendCamera();
        }
        if (mode === "blocked") throw new DOMException("Permission denied", "NotAllowedError");
        if (mode === "missing") throw new DOMException("Requested device not found", "NotFoundError");
        return new MediaStream();
      };
      const enumerateDevices = async () =>
        camera === "allowed"
          ? ([
              { kind: "videoinput", deviceId: "back", label: "Back camera", groupId: "" },
              { kind: "videoinput", deviceId: "front", label: "Front camera", groupId: "" },
            ] as MediaDeviceInfo[])
          : [];
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia, enumerateDevices } });
      const permissions = navigator.permissions;
      const query = permissions?.query?.bind(permissions);
      if (permissions && query) {
        permissions.query = (async (d: PermissionDescriptor) =>
          d.name === ("microphone" as PermissionName)
            ? { state: alreadyAllowed ? "granted" : "prompt" }
            : d.name === ("camera" as PermissionName)
              ? { state: "prompt" }
              : query(d)) as typeof permissions.query;
      }
    },
    { mode, alreadyAllowed, camera },
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

/** True once the fake call's scripted greeting has fully played. */
export async function scriptDone(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as unknown as { fakeConversation?: { scriptDone: boolean } }).fakeConversation?.scriptDone));
}
