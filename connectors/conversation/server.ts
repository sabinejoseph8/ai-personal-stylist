import "server-only";
import { createFakeProvider } from "./fake";
import { createTavusProvider } from "./tavus/server";
import type { CallProvider } from "./types";

/** The fake engine is only for automated tests: refused on Vercel's live site, whatever the setting says. */
export function fakeEngineAllowed(env: Record<string, string | undefined> = process.env) {
  return env.CONVERSATION_ENGINE === "fake" && env.VERCEL_ENV !== "production";
}

/** The provider for new calls: Tavus video, or the fake engine in tests. */
export function callProvider(): CallProvider {
  return fakeEngineAllowed() ? createFakeProvider() : createTavusProvider();
}
