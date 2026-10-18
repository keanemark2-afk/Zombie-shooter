import { defineConfig } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 600_000,
  // The two test files run side by side to save time.
  workers: 2,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 960, height: 540 },
    launchOptions: {
      // Headless Chromium has no graphics card, so WebGL runs on the CPU (SwiftShader).
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
