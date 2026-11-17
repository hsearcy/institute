/// <reference path="../server/node_modules/@types/bun/index.d.ts" />
/** Production-bundle smoke harness. Disposable fixtures, loopback only, no live keys.
 * Run after: VITE_PROFILE_ID=rpg-playtest bun run --cwd web build
 * bun --no-env-file scripts/suggestions-preview.ts
 */
import { dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { file, serve } from 'bun';
import { fileURLToPath } from 'node:url';
import { seedRpgDemo } from './seed-rpg-demo';

const scratch = resolve(tmpdir());
const db = resolve(process.env.RPG_TEST_DB ?? `${scratch}/institute-suggestions-preview-${process.pid}.db`);
if (!db.startsWith(scratch + sep)) throw new Error('Preview database must be inside the temporary workspace.');
process.env.RPG_TEST_DB = db;
process.env.RPG_TEST_PORT = process.env.SUGGESTIONS_PREVIEW_PORT ?? '15002';
for (const key of ['DEEPGRAM_API_KEY', 'INSTITUTE_SUGGESTIONS_ADMIN_TOKEN', 'INSTITUTE_SUGGESTIONS_WEBHOOK_URL', 'INSTITUTE_SUGGESTIONS_WEBHOOK_SECRET']) delete process.env[key];
const { server } = await seedRpgDemo();
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../web/dist');
if (!(await file(`${dist}/index.html`).exists())) throw new Error('Build web/dist before starting the preview.');

serve({
  port: Number(process.env.RPG_TEST_PORT), hostname: '127.0.0.1',
  websocket: server.websocket,
  async fetch(request: Request, bunServer) {
    const url = new URL(request.url);
    if (['/rpg', '/tutor', '/state', '/mastery', '/tts', '/shop', '/reward', '/health', '/daily-record'].some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix + '/'))) return server.fetch(request, bunServer);
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Invalid path', { status: 400 }); }
    const target = resolve(dist, '.' + pathname);
    if (target !== dist && !target.startsWith(dist + sep)) return new Response('Not found', { status: 404 });
    const asset = file(target === dist ? `${dist}/index.html` : target);
    if (await asset.exists()) return new Response(asset, { headers: { 'Cache-Control': 'no-store' } });
    if (pathname.startsWith('/assets/')) return new Response('Not found', { status: 404 });
    return new Response(file(`${dist}/index.html`), { headers: { 'Cache-Control': 'no-store' } });
  },
});
console.log(`Institute isolated production preview: http://127.0.0.1:${process.env.RPG_TEST_PORT}, disposable database ${db}`);
