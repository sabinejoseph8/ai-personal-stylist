import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// AI evaluations (tech spec 8): run against the real models, so they cost a little and aren't part of
// npm test. Run one with npm run eval:notes.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["tests/evals/**/*.eval.ts"], testTimeout: 900_000 },
});
