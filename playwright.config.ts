import { defineConfig, devices } from "@playwright/test";

// Browser tests (#28) against a production build and the local Supabase stack with its
// seed data. Run `npm run db:reset` first locally: the tests add tenants and payments.
//
//   npm run build && npm run test:e2e
//
// E2E_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's own
// Chromium (`npx playwright install chromium`).
const PORT = Number(process.env.E2E_PORT ?? 3100);
const channel = process.env.E2E_CHANNEL;

export default defineConfig({
  testDir: "e2e",
  // The tests share one database, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: { ...devices["Pixel 7"], ...(channel ? { channel } : {}) },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
