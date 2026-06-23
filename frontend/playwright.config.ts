import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const frontendBaseURL = process.env.E2E_FRONTEND_BASE_URL || 'http://127.0.0.1:3100';
const apiBaseURL = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:3101/api';
const backendDir = path.resolve(__dirname, '..', 'backend-python');
const backendPython =
  process.env.E2E_BACKEND_PYTHON ||
  (process.platform === 'win32'
    ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
    : path.join(backendDir, '.venv', 'bin', 'python'));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: frontendBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: `"${backendPython}" -m uvicorn app.main:app --host 127.0.0.1 --port 3101`,
      cwd: backendDir,
      url: `${apiBaseURL}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        CORS_ORIGIN: frontendBaseURL,
        E2E_FAKE_AI: '1',
        LOG_LEVEL: 'WARNING',
      },
    },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
      url: frontendBaseURL,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE: apiBaseURL,
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
