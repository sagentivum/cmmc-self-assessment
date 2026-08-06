import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;
const SUBPATH = '/cmmc-self-assessment';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    // Every E2E test runs against the SUBPATH, never the domain root — that is
    // where the GitHub Pages failure mode lives.
    baseURL: `http://localhost:${PORT}${SUBPATH}/`,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/serve-subpath.mjs',
    url: `http://localhost:${PORT}${SUBPATH}/`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
