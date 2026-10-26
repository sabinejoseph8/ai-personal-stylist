import { createFakeEngine, FAKE_JOIN_PREFIX } from "./fake";
import type { ConversationEngine } from "./types";

/** The browser engine for a call the server started: the fake engine for test calls, GPT-Live for voice only (6c), otherwise Tavus. */
export async function engineFor(joinUrl: string): Promise<ConversationEngine> {
  if (joinUrl.startsWith(FAKE_JOIN_PREFIX)) return createFakeEngine();
  if (joinUrl.endsWith("/voice")) {
    const { createGptLiveEngine } = await import("./gpt-live/client");
    return createGptLiveEngine();
  }
  const { createTavusEngine } = await import("./tavus/client");
  return createTavusEngine();
}
