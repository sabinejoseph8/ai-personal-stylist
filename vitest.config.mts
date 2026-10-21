import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  // Database tests make many round trips to Supabase, which is far from GitHub's machines (2f). At most
  // 2 test files at once: more filled Supabase's connection limit, so the photo store turned requests
  // away ("Too many connections", seen in 3c, 3d and the Phase 3 review). Only test runs reach it.
  test: { environment: "node", include: ["tests/**/*.test.ts"], exclude: ["e2e/**", "node_modules/**"], testTimeout: 15_000, maxWorkers: 2 },
});
