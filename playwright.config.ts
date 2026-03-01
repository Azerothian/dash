import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/tests',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    trace: 'on-first-retry',
  },
})
