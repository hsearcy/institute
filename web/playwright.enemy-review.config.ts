import { defineConfig } from '@playwright/test';

// Real tutor and SQLite, always a disposable fixture. No Ares or project .env.
const dbPath = `/tmp/institute-rpg-browser-${process.pid}.db`;
export default defineConfig({
  testDir: './tests', testMatch: 'enemy-animation.spec.ts', workers: 1, fullyParallel: false,
  outputDir: './test-results/enemy-animation',
  timeout: 300_000, expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:5199', viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: process.env.RPG_TEST_GPU === '1' ? ['--no-sandbox', '--use-gl=angle', '--use-angle=gl'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: [
    { command: 'bun --no-env-file ../scripts/rpg-local-server.ts', env: { RPG_TEST_DB: dbPath, RPG_TEST_PORT: '8809' }, wait: { stdout: /rpg playtest/ }, reuseExistingServer: false, timeout: 30_000 },
    { command: 'bun --no-env-file x vite --config vite.rpg-test.config.ts --host 127.0.0.1', env: { TUTOR_PROXY_TARGET: 'http://127.0.0.1:8809', VITE_PROFILE_ID: 'rpg-playtest' }, wait: { stdout: /Local:/ }, reuseExistingServer: false, timeout: 30_000 },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
