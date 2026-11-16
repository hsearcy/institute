import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Production bundle, loopback only, a fresh disposable SQLite file, no project .env.
// Voice tests use Chromium's fake microphone and an explicit transcription stub.
const dbPath = join(tmpdir(), `institute-suggestions-browser-${process.pid}.db`);
const apiPort = process.env.SUGGESTIONS_TEST_API_PORT ?? '8817';
const webPort = process.env.SUGGESTIONS_TEST_WEB_PORT ?? '4197';
const origin = `http://127.0.0.1:${webPort}`;
export default defineConfig({
  testDir: './tests', testMatch: 'suggestions.spec.ts', workers: 1, fullyParallel: false,
  outputDir: './test-results/suggestions', timeout: 120_000, expect: { timeout: 20_000 },
  use: {
    baseURL: origin, viewport: { width: 1280, height: 960 },
    permissions: ['microphone'], screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
      args: ['--no-sandbox', '--use-gl=angle', process.env.RPG_TEST_GPU === '1' ? '--use-angle=gl' : '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: [
    {
      command: 'bun --no-env-file ../scripts/rpg-local-server.ts',
      env: { RPG_TEST_DB: dbPath, RPG_TEST_PORT: apiPort, DEEPGRAM_API_KEY: '', INSTITUTE_SUGGESTIONS_ADMIN_TOKEN: '', INSTITUTE_SUGGESTIONS_WEBHOOK_URL: '', INSTITUTE_SUGGESTIONS_PUBLIC_ORIGIN: origin },
      url: `http://127.0.0.1:${apiPort}/rpg/state?profileId=suggestions-readiness`, reuseExistingServer: false, timeout: 30_000,
    },
    {
      command: `bun --no-env-file run build && bun --no-env-file x vite preview --host 127.0.0.1 --port ${webPort}`,
      env: { TUTOR_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
      url: origin, reuseExistingServer: false, timeout: 60_000,
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
