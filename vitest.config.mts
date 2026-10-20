import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  // Database tests make many round trips to Supabase, which is far from GitHub's machines (2f).
  test: { environment: "node", include: ["tests/**/*.test.ts"], exclude: ["e2e/**", "node_modules/**"], testTimeout: 15_000 },
});
