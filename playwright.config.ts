import { defineConfig, devices } from "@playwright/test";

// End-to-end tests on a phone and a desktop size (tech spec section 8).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // 2 at once, as on GitHub's 4-core machines: more filled Supabase's connection limit on this Mac,
  // and the tests share the project with the live site (Phase 3 code review, decision C).
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["iPhone 15"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Conversations, notes, photo readings, camera frames, preference rules and looks in browser tests use fakes: free, and the same every time.
    // They cost nothing, but the month's totals are shared with the live site, so its spending mustn't stop
    // them: once real Claude spending passed $12, the tests' notes paused too (22 Oct 2026).
    env: {
      CONVERSATION_ENGINE: "fake",
      NOTES_READER: "fake",
      PHOTO_READER: "fake",
      CAMERA_READER: "fake",
      RULE_MAKER: "fake",
      LOOKS_BUILDER: "fake",
      BUDGET_MONTHLY_CLAUDE_USD: "1000000",
      BUDGET_MONTHLY_OPENAI_USD: "1000000",
      BUDGET_MONTHLY_VIDEO_MINUTES: "1000000",
    },
  },
});
