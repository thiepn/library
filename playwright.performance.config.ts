import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4321';
const inCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/performance-budget.perf.ts',
  fullyParallel: false,
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: inCi
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-performance-report' }]]
    : [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec astro preview --host 127.0.0.1 --port 4321',
    url: `${baseURL}/library`,
    reuseExistingServer: !inCi,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium-performance' }],
});
