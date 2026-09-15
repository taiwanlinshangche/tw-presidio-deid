import { defineConfig } from '@playwright/test';
const externalURL = process.env.DEID_TEST_BASE_URL;
export default defineConfig({
  testDir: './tests',
  testMatch: ['live-model.spec.js', 'live-audio.spec.js'],
  timeout: 180_000,
  workers: 1,
  expect: { timeout: 120_000 },
  use: { baseURL: externalURL || 'http://127.0.0.1:4173', channel: 'chrome' },
  webServer: externalURL ? undefined : { command: 'npm start', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 120_000 },
});
