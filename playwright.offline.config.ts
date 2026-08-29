import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4321';
const inCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/offline-reliability.spec.ts', '**/storage-reliability.spec.ts'],
  fullyParallel: false,
  forbidOnly: inCi,
  retries: 0,
  maxFailures: inCi ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: inCi
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-offline-report' }]]
    : [['list']],
  use: {
    baseURL,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/offline-preview-proxy.mjs',
    url: `${baseURL}/library`,
    reuseExistingServer: !inCi,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium-offline', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'firefox-offline', use: { browserName: 'firefox', viewport: { width: 1280, height: 800 } } },
    { name: 'webkit-offline', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
  ],
});
