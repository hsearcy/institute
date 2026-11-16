import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { createSuggestionRoutes, createSuggestionDelivery, ensureSuggestionSchema, type SuggestionConfig } from './suggestions';

const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const token = 'test-admin-secret-not-real';
const parent = 'houston-test';
function fixture(config: SuggestionConfig = {}, fetcher: typeof fetch = (() => { throw Error('Network forbidden in tests'); }) as unknown as typeof fetch) {
  const db = new Database(':memory:'); databases.push(db);
  const app = new Hono().route('/rpg', createSuggestionRoutes(db, { config, fetch: fetcher }));
  return { db, app };
}
const adminConfig = { adminToken: token, parentActors: [parent] };
const childBody = (text = 'Please add a dragon', profileId = 'sam') => ({ profileId, requestId: crypto.randomUUID(), text });
const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost' };
function post(app: Hono, body: unknown, extra: Record<string, string> = {}) {
  return app.request('/rpg/suggestions', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
}
async function add(app: Hono, body = childBody()) { return (await (await post(app, body)).json()).suggestion; }
async function detail(app: Hono, id: string) {
  return app.request(`/rpg/suggestions/internal/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}
async function patch(app: Hono, id: string, body: unknown, auth = token) {
  return app.request(`/rpg/suggestions/internal/${id}`, { method: 'PATCH', headers: { ...headers, Authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
}
async function edit(app: Hono, id: string, action: string, extra = {}) {
  const s = (await (await detail(app, id)).json()).suggestion;
  return patch(app, id, { actor: parent, parentMessageId: `parent-message-${crypto.randomUUID()}`, parentMessageText: '  Please use this exact reviewed scope.  ', action, revision: s.revision, scopeHash: s.scopeHash, ...extra });
}
function count(db: Database, table: string) { return (db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n; }

describe('suggestion public contract', () => {
  test('transactional create, replay, conflict and truthful pending status', async () => {
    const { db, app } = fixture(); const body = childBody('  Please add a dragon  ');
    const first = await post(app, body); expect(first.status).toBe(201);
    const s = (await first.json()).suggestion;
    expect(s).toMatchObject({ profileId: 'sam', text: 'Please add a dragon', status: 'sent', notificationPending: true });
    expect(s.proposal).toBeUndefined(); expect(s.scopeHash).toBeUndefined();
    expect((await post(app, { ...body, text: 'Please add a dragon' })).status).toBe(200);
    expect((await post(app, { ...body, text: 'Add explosions' })).status).toBe(409);
    expect(count(db, 'institute_suggestions')).toBe(1);
    expect(count(db, 'institute_suggestion_outbox')).toBe(1);
    expect(count(db, 'institute_suggestion_audit')).toBe(1);
    const list = await (await app.request('/rpg/suggestions?profileId=sam')).json();
    expect(list).toMatchObject({ voiceAvailable: false, suggestions: [{ id: s.id }] });
    expect((await (await app.request('/rpg/suggestions?profileId=other')).json()).suggestions).toEqual([]);
    ensureSuggestionSchema(db); expect(count(db, 'institute_suggestions')).toBe(1);
  });
  test('an outbox insertion failure rolls the suggestion and audit back', async () => {
    const { db, app } = fixture();
    db.exec(`CREATE TRIGGER fail_enqueue BEFORE INSERT ON institute_suggestion_outbox BEGIN SELECT RAISE(ABORT, 'test queue failure'); END`);
    expect((await post(app, childBody())).status).toBe(500);
    expect(count(db, 'institute_suggestions')).toBe(0); expect(count(db, 'institute_suggestion_audit')).toBe(0);
  });
  test('strict validation, bounded history, no browser control of decisions', async () => {
    const { app } = fixture({ rateLimit: 100 });
    for (const body of [childBody(' '), childBody('x'.repeat(4001)), { ...childBody(), requestId: 'bad' }, childBody('ok', 'x'.repeat(81)), { ...childBody(), status: 'approved' }]) {
      expect((await post(app, body)).status).toBe(400);
    }
    for (let i = 0; i < 23; i++) await add(app, childBody(`idea ${i}`));
    const list = await (await app.request('/rpg/suggestions?profileId=sam')).json();
    expect(list.suggestions.length).toBe(20); expect(list.suggestions[0].text).toBe('idea 22');
    expect((await app.request('/rpg/suggestions')).status).toBe(400);
    expect((await app.request('/rpg/suggestions', { method: 'PATCH', headers, body: '{}' })).status).toBe(404);
  });
  test('cross-origin POST blocked, configured proxy origin accepted, no wildcard CORS', async () => {
    const { app } = fixture({ publicOrigin: 'https://institute.example' });
    expect((await post(app, childBody(), { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(app, childBody(), { Origin: 'https://institute.example' })).status).toBe(201);
    const response = await post(app, childBody()); expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const noOrigin = await app.request('/rpg/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: JSON.stringify(childBody()) });
    expect(noOrigin.status).toBe(403);
  });
  test('bounded body and rate budget, including requests with no forged IP header', async () => {
    const { app } = fixture({ rateLimit: 2 });
    expect((await post(app, childBody())).status).toBe(201);
    expect((await post(app, childBody())).status).toBe(201);
    expect((await post(app, childBody(), { 'X-Forwarded-For': 'new-ip' })).status).toBe(429);
    const other = fixture().app;
    expect((await post(other, { ...childBody(), text: 'x'.repeat(25000) })).status).toBe(413);
  });
});

describe('authenticated parent scope and state machine', () => {
  test('admin auth and actor identity fail closed, including absent config', async () => {
    const { app } = fixture(); const s = await add(app);
    expect((await detail(app, s.id)).status).toBe(503);
    const f = fixture(adminConfig); const created = await add(f.app);
    expect((await f.app.request('/rpg/suggestions/internal')).status).toBe(401);
    expect((await patch(f.app, created.id, {}, 'bad')).status).toBe(401);
    expect((await edit(f.app, created.id, 'approve', { actor: 'child' })).status).toBe(403);
    const noActors = fixture({ adminToken: token }); const n = await add(noActors.app);
    expect((await edit(noActors.app, n.id, 'approve')).status).toBe(503);
    expect((await f.app.request('/rpg/suggestions/internal', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  });
  test('revision/hash binding prevents stale approvals and scope changes piggybacking; transitions audited', async () => {
    const { db, app } = fixture(adminConfig); const s = await add(app);
    const original = (await (await detail(app, s.id)).json()).suggestion;
    expect((await edit(app, s.id, 'building')).status).toBe(409);
    expect((await edit(app, s.id, 'revise', { proposal: 'Add one friendly dragon at camp', parentNote: 'Keep it gentle' })).status).toBe(200);
    const revised = (await (await detail(app, s.id)).json()).suggestion;
    expect(revised.revision).toBe(2); expect(revised.text).toBe(original.text);
    expect(revised.scopeHash).not.toBe(original.scopeHash);
    expect((await patch(app, s.id, { actor: parent, parentMessageId: 'stale-parent-message', parentMessageText: 'Approve', action: 'approve', revision: original.revision, scopeHash: original.scopeHash })).status).toBe(409);
    expect((await edit(app, s.id, 'approve')).status).toBe(200);
    expect((await edit(app, s.id, 'approve')).status).toBe(409);
    expect((await edit(app, s.id, 'ready')).status).toBe(409);
    expect((await edit(app, s.id, 'revise', { proposal: 'A smaller dragon' })).status).toBe(200);
    expect((await edit(app, s.id, 'building')).status).toBe(409);
    expect((await edit(app, s.id, 'approve')).status).toBe(200);
    expect((await edit(app, s.id, 'building')).status).toBe(200);
    expect((await edit(app, s.id, 'revise', { proposal: 'Secret unrelated changes' })).status).toBe(409);
    expect((await edit(app, s.id, 'decline')).status).toBe(409);
    expect((await edit(app, s.id, 'ready', { parentNote: 'The dragon is ready for review!' })).status).toBe(200);
    expect((await edit(app, s.id, 'ready')).status).toBe(409);
    const result = await (await detail(app, s.id)).json();
    expect(result.suggestion).toMatchObject({ status: 'ready', approvedRevision: 3, revision: 3, parentNote: 'The dragon is ready for review!' });
    expect(result.audit.map((a: any) => a.action)).toEqual(['submit', 'revise', 'approve', 'revise', 'approve', 'building', 'ready']);
    expect(count(db, 'institute_suggestion_audit')).toBe(7);
    expect(result.audit.slice(1).every((a: any) => a.actor === parent && a.parentMessageId.startsWith('parent-message-') && a.parentMessageText === '  Please use this exact reviewed scope.  ')).toBe(true);
  });
  test('a parent message cannot be replayed to approve a later scope or rewritten in audit', async () => {
    const { app } = fixture(adminConfig); const s = await add(app);
    expect((await edit(app, s.id, 'approve', { parentMessageId: 'first-parent-approval', parentMessageText: 'Yes' })).status).toBe(200);
    expect((await edit(app, s.id, 'revise', { proposal: 'A different scope' })).status).toBe(200);
    expect((await edit(app, s.id, 'approve', { parentMessageId: 'first-parent-approval', parentMessageText: 'Yes' })).status).toBe(409);
    expect((await edit(app, s.id, 'approve', { parentMessageId: 'first-parent-approval', parentMessageText: 'Rewritten consent' })).status).toBe(409);
    expect((await (await detail(app, s.id)).json()).suggestion.status).toBe('sent');
  });
  test('internal list paginates bounded results and builds require stored approval hash, not just status', async () => {
    const { db, app } = fixture({ ...adminConfig, rateLimit: 100 });
    for (let i = 0; i < 53; i++) await add(app, childBody(`proposal ${i}`, i % 2 ? 'sam' : 'pax'));
    const list = (query = '') => app.request('/rpg/suggestions/internal' + query, { headers: { Authorization: `Bearer ${token}` } });
    const first = await (await list('?notificationPending=true')).json();
    expect(first.suggestions).toHaveLength(50); expect(first.nextCursor).not.toBeNull();
    const second = await (await list(`?before=${first.nextCursor}`)).json();
    expect(second.suggestions).toHaveLength(3); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.suggestions, ...second.suggestions].map((s: any) => s.id)).size).toBe(53);
    const sam = await (await list('?profileId=sam&status=sent')).json();
    expect(sam.suggestions.every((s: any) => s.profileId === 'sam' && s.status === 'sent')).toBe(true);
    expect((await list('?unbounded=true')).status).toBe(400);
    const s = first.suggestions[0];
    expect((await edit(app, s.id, 'approve', { parentMessageText: undefined })).status).toBe(400);
    expect((await edit(app, s.id, 'approve', { parentMessageId: ' invalid id ' })).status).toBe(400);
    expect((await edit(app, s.id, 'approve')).status).toBe(200);
    db.query('UPDATE institute_suggestions SET approved_hash=? WHERE id=?').run('0'.repeat(64), s.id);
    expect((await edit(app, s.id, 'building')).status).toBe(409);
    expect((await (await detail(app, s.id)).json()).suggestion.status).toBe('approved');
  });
  test('needs_details and decline public messages, malformed states and payloads rejected', async () => {
    const { app } = fixture(adminConfig); const s = await add(app);
    expect((await edit(app, s.id, 'needs_details', { parentNote: 'Which kind of dragon?' })).status).toBe(200);
    expect((await edit(app, s.id, 'decline', { parentNote: 'Not this time' })).status).toBe(200);
    expect((await edit(app, s.id, 'approve')).status).toBe(409);
    expect((await edit(app, s.id, 'sent')).status).toBe(400);
    expect((await edit(app, s.id, 'revise', { proposal: 'A friendly pet', text: 'overwrite original' })).status).toBe(400);
    const publicList = await (await app.request('/rpg/suggestions?profileId=sam')).json();
    expect(publicList.suggestions[0]).toMatchObject({ status: 'declined', parentNote: 'Not this time' });
  });
});

function audio(app: Hono, contentType = 'audio/webm;codecs=opus', body: BodyInit = new Uint8Array([1, 2, 3]), extra = {}) {
  return app.request('/rpg/suggestions/transcribe', { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': contentType, ...extra }, body });
}
describe('voice transcription', () => {
  test('actual MIME reaches fixed Deepgram endpoint; all supported formats; voice availability', async () => {
    const calls: { url: string, init: RequestInit }[] = [];
    const fake = (async (url: any, init: any) => { calls.push({ url: String(url), init }); return Response.json({ results: { channels: [{ alternatives: [{ transcript: '  A pet dragon please  ' }] }] } }); }) as unknown as typeof fetch;
    const { app } = fixture({ deepgramKey: 'fake' }, fake);
    for (const mime of ['audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']) {
      const response = await audio(app, mime); expect(response.status).toBe(200); expect(await response.json()).toEqual({ text: 'A pet dragon please' });
      expect(new Headers(calls.at(-1)!.init.headers).get('Content-Type')).toBe(mime);
    }
    expect(calls.every(c => c.url.startsWith('https://api.deepgram.com/v1/listen?'))).toBe(true);
    expect((await (await app.request('/rpg/suggestions?profileId=sam')).json()).voiceAvailable).toBe(true);
  });
  test('unavailable, unintelligible, invalid MIME/empty/oversized and streamed audio', async () => {
    expect((await audio(fixture().app)).status).toBe(503);
    const { app } = fixture({ deepgramKey: 'fake', rateLimit: 100 }, (async () => Response.json({ results: { channels: [] } })) as unknown as typeof fetch);
    expect((await audio(app)).status).toBe(422);
    expect((await audio(app, 'application/octet-stream')).status).toBe(415);
    expect((await audio(app, 'audio/wav', new Uint8Array())).status).toBe(422);
    expect((await audio(app, 'audio/wav', new Uint8Array(5 * 1024 * 1024 + 1))).status).toBe(413);
    let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
    expect((await audio(app, 'audio/ogg', stream)).status).toBe(413); expect(cancelled).toBe(true);
  });
  test('provider failure and timeout are friendly 503 (including ignored AbortSignal)', async () => {
    const failed = fixture({ deepgramKey: 'fake' }, (async () => new Response('no', { status: 500 })) as unknown as typeof fetch);
    expect((await audio(failed.app)).status).toBe(503);
    const hung = fixture({ deepgramKey: 'fake', providerTimeoutMs: 10 }, (() => new Promise(() => {})) as unknown as typeof fetch);
    expect((await audio(hung.app)).status).toBe(503);
  });
});

describe('trusted bridge notification readback acknowledgement', () => {
  test('exact event/hash ack is idempotent, durable and never an approval', async () => {
    const { app, db } = fixture(adminConfig); const s = await add(app);
    const current = (await (await detail(app, s.id)).json()).suggestion;
    const body = { eventId: current.notification.eventId, payloadHash: current.notification.payloadHash,
      channelId: 'discord-channel-test', messageId: 'discord-message-test', messageText: 'Actual notification readback' };
    const ack = (payload = body, secret = token, id = s.id) => app.request(`/rpg/suggestions/internal/${id}/notification-ack`, {
      method: 'POST', headers: { ...headers, Authorization: `Bearer ${secret}` }, body: JSON.stringify(payload),
    });
    expect((await ack(body, 'bad')).status).toBe(401);
    expect((await ack({ ...body, payloadHash: '0'.repeat(64) })).status).toBe(409);
    const response = await ack(); expect(response.status).toBe(200); expect((await response.json()).duplicate).toBe(false);
    expect((await (await ack()).json()).duplicate).toBe(true);
    expect((await ack({ ...body, messageId: 'different-message' })).status).toBe(409);
    expect((await ack(body, token, crypto.randomUUID())).status).toBe(404);
    const readback = (await (await detail(app, s.id)).json()).suggestion;
    expect(readback).toMatchObject({ status: 'sent', notificationPending: false, approvedRevision: null,
      notification: { pending: false, receipt: { channelId: body.channelId, messageId: body.messageId, messageText: body.messageText } } });
    expect(count(db, 'institute_suggestion_delivery_receipts')).toBe(1);
    expect(count(db, 'institute_suggestion_audit')).toBe(1);
    const pending = await (await app.request('/rpg/suggestions/internal?notificationPending=true', { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(pending.suggestions).toEqual([]);
  });
});

describe('durable notification outbox', () => {
  const config = { webhookUrl: 'http://127.0.0.1:9999/hooks/suggestions', webhookSecret: 'fake-webhook-secret', deliveryTimeoutMs: 10 };
  test('missing configuration saves queue without sending or pretending delivery', async () => {
    const { db, app } = fixture(); const s = await add(app);
    const worker = createSuggestionDelivery(db, { config: {} });
    expect(await worker.drain()).toBe(0);
    expect((db.query('SELECT delivered_at FROM institute_suggestion_outbox').get() as any).delivered_at).toBeNull();
  });
  test('fixed authenticated webhook, stable event id on retry; failed delivery survives worker restart', async () => {
    const { db, app } = fixture(); const s = await add(app); let now = Date.now(); const requests: any[] = [];
    const fake = (async (url: any, init: any) => { requests.push({ url, init }); return new Response(null, { status: requests.length === 1 ? 500 : 200 }); }) as unknown as typeof fetch;
    let worker = createSuggestionDelivery(db, { config, fetch: fake, now: () => now });
    expect(await worker.drain()).toBe(1);
    const queued = db.query('SELECT * FROM institute_suggestion_outbox').get() as any;
    expect(queued.attempts).toBe(1); expect(queued.delivered_at).toBeNull(); expect(queued.next_attempt_at).toBeGreaterThan(now);
    expect(await worker.drain()).toBe(0);
    now = queued.next_attempt_at; worker = createSuggestionDelivery(db, { config, fetch: fake, now: () => now });
    expect(await worker.drain()).toBe(1);
    expect(requests.length).toBe(2);
    expect(requests[0].url).toBe(config.webhookUrl);
    expect(new Headers(requests[0].init.headers).get('X-Gitlab-Token')).toBe(config.webhookSecret);
    expect(requests[0].init.redirect).toBe('error');
    expect(JSON.parse(requests[0].init.body)).toMatchObject({ eventId: queued.id, suggestionId: s.id, trusted: false });
    expect(requests[1].init.body).toBe(requests[0].init.body);
    expect((db.query('SELECT delivered_at FROM institute_suggestion_outbox').get() as any).delivered_at).toBe(now);
    expect((await (await app.request('/rpg/suggestions?profileId=sam')).json()).suggestions[0].notificationPending).toBe(false);
  });
  test('claims serialize independent workers and recover expired in-flight delivery', async () => {
    const { db, app } = fixture(); await add(app); await add(app); let now = Date.now(); let resolve!: (r: Response) => void;
    const slow = (() => new Promise<Response>(r => { resolve = r; })) as unknown as typeof fetch;
    const one = createSuggestionDelivery(db, { config: { ...config, deliveryTimeoutMs: 500 }, fetch: slow, now: () => now });
    const two = createSuggestionDelivery(db, { config, fetch: (async () => new Response()) as unknown as typeof fetch, now: () => now });
    const running = one.drain(1); await Bun.sleep(1);
    expect(await two.drain()).toBe(0); resolve(new Response()); expect(await running).toBe(1);
    db.query('UPDATE institute_suggestion_outbox SET claim_token = ?, lease_until = ? WHERE delivered_at IS NULL').run('crashed-worker', now + 100);
    expect(await two.drain()).toBe(0); now += 101;
    expect(await two.drain()).toBe(1);
  });
  test('timeout retries without dropping, exponential delay is capped, pending capacity bounded', async () => {
    const { db, app } = fixture({ maxPending: 1 }); const body = childBody(); await add(app, body);
    expect((await post(app, childBody())).status).toBe(503); expect((await post(app, body)).status).toBe(200);
    const now = Date.now();
    const worker = createSuggestionDelivery(db, { config, fetch: (() => new Promise(() => {})) as unknown as typeof fetch, now: () => now });
    expect(await worker.drain()).toBe(1);
    expect(count(db, 'institute_suggestions')).toBe(1);
    const row = db.query('SELECT * FROM institute_suggestion_outbox').get() as any;
    expect(row.delivered_at).toBeNull(); expect(row.claim_token).toBeNull(); expect(row.last_error).toBe('delivery failed');
    expect(row.next_attempt_at - now).toBe(1000);
    db.query('UPDATE institute_suggestion_outbox SET attempts=99,next_attempt_at=?').run(now);
    expect(await worker.drain()).toBe(1);
    expect((db.query('SELECT next_attempt_at FROM institute_suggestion_outbox').get() as any).next_attempt_at - now).toBe(3_600_000);
  });
});
