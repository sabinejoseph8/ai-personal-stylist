import { createFakeEngine, FAKE_JOIN_PREFIX } from "./fake";
import type { ConversationEngine } from "./types";

/** The browser engine for a call the server started: the fake engine for test calls, otherwise Tavus. */
export async function engineFor(joinUrl: string): Promise<ConversationEngine> {
  if (joinUrl.startsWith(FAKE_JOIN_PREFIX)) return createFakeEngine();
  const { createTavusEngine } = await import("./tavus/client");
  return createTavusEngine();
}
