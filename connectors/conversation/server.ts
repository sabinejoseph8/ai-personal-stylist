import "server-only";
import { createFakeProvider } from "./fake";
import { createGptLiveProvider } from "./gpt-live/server";
import { createTavusProvider } from "./tavus/server";
import type { CallProvider, Engine } from "./types";

/** The fake engine is only for automated tests: refused on Vercel's live site, whatever the setting says. */
export function fakeEngineAllowed(env: Record<string, string | undefined> = process.env) {
  return env.CONVERSATION_ENGINE === "fake" && env.VERCEL_ENV !== "production";
}

/** The provider for new calls: Tavus video or GPT-Live voice only (6c), or the fake engine in tests. */
export function callProvider(engine: Engine = "video"): CallProvider {
  if (fakeEngineAllowed()) return createFakeProvider(engine);
  return engine === "voice" ? createGptLiveProvider() : createTavusProvider();
}
