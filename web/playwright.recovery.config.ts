import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = `/tmp/institute-rpg-recovery-${Date.now()}.db`;
export default defineConfig({
  testDir: './tests', testMatch: 'rpg-recovery.spec.ts', workers: 1,
  timeout: 300_000, expect: { timeout: 20_000 },
  outputDir: './test-results/recovery',
  use: {
    baseURL: 'http://127.0.0.1:5209', actionTimeout: 15_000, viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: process.env.RPG_TEST_GPU === '1' ? ['--no-sandbox', '--use-gl=angle', '--use-angle=gl'] : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: [
    { command: `RPG_TEST_DB=${scratch} RPG_TEST_PORT=8819 bun --no-env-file scripts/rpg-local-server.ts`, cwd: root, url: 'http://127.0.0.1:8819/health', reuseExistingServer: false },
    { command: 'TUTOR_PROXY_TARGET=http://127.0.0.1:8819 VITE_PROFILE_ID=rpg-playtest bun --no-env-file run --cwd web dev --config vite.recovery.config.ts', cwd: root, url: 'http://127.0.0.1:5209', reuseExistingServer: false },
  ],
});
