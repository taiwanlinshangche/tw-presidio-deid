import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testIgnore: ['live-*.spec.js', 'setup.spec.js'],
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4175', channel: 'chrome' },
  webServer: {
    command: 'npm run dev:ui -- --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
