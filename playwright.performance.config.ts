import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4321';
const inCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/performance',
  fullyParallel: false,
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: inCi
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-performance-report' }]]
    : [['list']],
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    launchOptions: {
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    },
  },
  webServer: {
    command: 'pnpm exec astro preview --host 127.0.0.1 --port 4321',
    url: `${baseURL}/library`,
    reuseExistingServer: !inCi,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-low-end-ci',
      use: { browserName: 'chromium' },
    },
  ],
});
