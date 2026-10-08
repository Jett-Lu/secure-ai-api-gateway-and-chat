import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:5173', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: [
    { command: 'npm run dev -- --host localhost', url: 'http://localhost:5173', reuseExistingServer: false,
      env: { VITE_API_BASE_URL: 'http://localhost:4100' } },
    ...(process.env.TEST_DATABASE_URL ? [{ command: 'node --import tsx ../backend/tests/e2e-server.ts', url: 'http://127.0.0.1:4100/api/health', reuseExistingServer: false }] : [])
  ]
});
