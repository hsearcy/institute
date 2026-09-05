import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Import the shared typed problem schema straight from source (no build step).
    alias: {
      '@institute/shared': resolve(here, '../shared/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
    fs: { allow: [resolve(here, '..')] }, // allow importing ../shared
    proxy: Object.fromEntries(
      ['/tutor', '/reward', '/state', '/shop', '/mastery', '/tts', '/daily-record', '/rpg'].map((path) =>
        [path, { target: process.env.TUTOR_PROXY_TARGET ?? 'http://127.0.0.1:8787', changeOrigin: true }]),
    ),
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
