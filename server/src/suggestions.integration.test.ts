import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createSuggestionDelivery, createSuggestionRoutes } from './suggestions';

// A separate process ensures index.ts sees ONLY this disposable DB and an allowlisted
// environment, regardless of keys or test environment changes in another test file.
test('real index mount excludes legacy wildcard CORS and fails closed without parent config', () => {
  const script = `
    globalThis.fetch = () => { throw Error('Real network forbidden'); };
    const { default: server } = await import('./server/src/index.ts');
    const response = await server.fetch(new Request('http://preview.local/rpg/suggestions', {
      method: 'POST', headers: { Origin: 'http://preview.local', 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'preview', requestId: crypto.randomUUID(), text: 'A pet dragon' })
    }));
    const created = await response.json();
    const evil = await server.fetch(new Request('http://preview.local/rpg/suggestions', {
      method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'preview', requestId: crypto.randomUUID(), text: 'Not allowed' })
    }));
    const preflight = await server.fetch(new Request('http://preview.local/rpg/suggestions', {
      method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' }
    }));
    const parent = await server.fetch(new Request('http://preview.local/rpg/suggestions/internal'));
    const health = await server.fetch(new Request('http://preview.local/health', { headers: { Origin: 'https://other.example' } }));
    console.log('VERIFIED:' + JSON.stringify({
      status: response.status, created, evilStatus: evil.status, parentStatus: parent.status,
      publicCors: response.headers.get('Access-Control-Allow-Origin'), evilCors: evil.headers.get('Access-Control-Allow-Origin'),
      preflightCors: preflight.headers.get('Access-Control-Allow-Origin'), healthStatus: health.status,
      legacyCors: health.headers.get('Access-Control-Allow-Origin')
    }));
  `;
  const child = Bun.spawnSync([process.execPath, '--no-env-file', '-e', script], {
    cwd: join(import.meta.dir, '../..'), env: { NODE_ENV: 'test', DB_PATH: ':memory:', PATH: process.env.PATH ?? '' }, timeout: 15_000,
  });
  expect(child.exitCode).toBe(0);
  const output = child.stdout.toString();
  const line = output.split('\n').find(s => s.startsWith('VERIFIED:'));
  expect(line).toBeDefined();
  const result = JSON.parse(line!.slice('VERIFIED:'.length));
  expect(result).toMatchObject({ status: 201, evilStatus: 403, parentStatus: 503, publicCors: null,
    evilCors: null, preflightCors: null, healthStatus: 200, legacyCors: '*',
    created: { suggestion: { status: 'sent', notificationPending: true } },
  });
});

test('disk-backed queue survives DB close/reopen and failed worker, with original event preserved', async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? '/home/ares/.hermes/cache/scratch', 'institute-suggestions-'));
  let db: Database | undefined;
  try {
    const path = join(dir, 'disposable.sqlite');
    db = new Database(path, { create: true });
    let now = 1_000_000;
    const app = createSuggestionRoutes(db, { config: {}, now: () => now });
    const response = await app.request('/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'scratch-only', requestId: crypto.randomUUID(), text: 'Keep my original idea' }) });
    expect(response.status).toBe(201);
    const before = db.query('SELECT * FROM institute_suggestion_outbox').get() as any;
    const config = { webhookUrl: 'http://fake.invalid/test', webhookSecret: 'test-only', deliveryTimeoutMs: 20 };
    const failed = createSuggestionDelivery(db, { config, now: () => now, fetch: (async () => { throw Error('fake network failure'); }) as unknown as typeof fetch });
    expect(await failed.drain()).toBe(1);
    db.close(); db = new Database(path);
    const recovered = db.query('SELECT * FROM institute_suggestion_outbox').get() as any;
    expect(recovered.id).toBe(before.id); expect(recovered.payload).toBe(before.payload);
    expect(recovered.delivered_at).toBeNull(); expect(recovered.attempts).toBe(1);
    now = recovered.next_attempt_at;
    let payload: string | undefined;
    const worker = createSuggestionDelivery(db, { config, now: () => now, fetch: (async (_url, init) => {
      payload = String(init!.body); return new Response(null, { status: 204 });
    }) as typeof fetch });
    expect(await worker.drain()).toBe(1); expect(payload).toBe(before.payload);
    expect((db.query('SELECT delivered_at FROM institute_suggestion_outbox').get() as any).delivered_at).toBe(now);
    expect((db.query('SELECT text FROM institute_suggestions').get() as any).text).toBe('Keep my original idea');
  } finally { db?.close(); rmSync(dir, { recursive: true, force: true }); }
});
