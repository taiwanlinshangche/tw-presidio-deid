import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'setup.spec.js', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4187', channel: 'chrome' },
  webServer: { command: 'node scripts/tests/serve-setup.mjs', url: 'http://127.0.0.1:4187/api/setup/status', reuseExistingServer: false },
});
