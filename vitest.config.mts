import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Unit tests live next to the code; the browser tests in e2e/ run with Playwright.
  test: { include: ["src/**/*.test.ts"] },
  resolve: {
    // Same alias as tsconfig.json ("@/*" -> "src/*").
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
