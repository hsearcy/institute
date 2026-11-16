import { Database } from 'bun:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';

/** Server-side only. Never serialize this configuration to the browser. */
export type SuggestionConfig = {
  deepgramKey?: string;
  adminToken?: string;
  parentActors?: string[];
  publicOrigin?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  providerTimeoutMs?: number;
  deliveryTimeoutMs?: number;
  rateLimit?: number;
  maxPending?: number;
};
type Options = { config?: SuggestionConfig; fetch?: typeof fetch; now?: () => number };
export function suggestionConfigFromEnv(): SuggestionConfig {
  return {
    deepgramKey: process.env.DEEPGRAM_API_KEY,
    adminToken: process.env.INSTITUTE_SUGGESTIONS_ADMIN_TOKEN,
    parentActors: process.env.INSTITUTE_SUGGESTIONS_PARENT_ACTORS?.split(',').map(s => s.trim()).filter(Boolean),
    publicOrigin: process.env.INSTITUTE_SUGGESTIONS_PUBLIC_ORIGIN,
    webhookUrl: process.env.INSTITUTE_SUGGESTIONS_WEBHOOK_URL,
    webhookSecret: process.env.INSTITUTE_SUGGESTIONS_WEBHOOK_SECRET,
  };
}
const statuses = ['sent', 'approved', 'building', 'ready', 'declined', 'needs_details'] as const;
type Status = typeof statuses[number];
type Suggestion = {
  id: string; profile_id: string; request_id: string; text: string; status: Status;
  created_at: number; updated_at: number; parent_note: string | null;
  proposal: string; revision: number; scope_hash: string; approved_revision: number | null; approved_hash: string | null;
};
const profileSchema = z.string().trim().min(1).max(80);
const submitSchema = z.object({ profileId: profileSchema, requestId: z.string().uuid(), text: z.string().trim().min(1).max(4000) }).strict();
const decisionSchema = z.object({
  actor: z.string().min(1).max(160),
  parentMessageId: z.string().min(1).max(160).regex(/^\S+$/u),
  parentMessageText: z.string().min(1).max(8000).refine(s => !!s.trim()),
  action: z.enum(['revise', 'approve', 'decline', 'needs_details', 'building', 'ready']),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
  proposal: z.string().trim().min(1).max(4000).optional(),
  parentNote: z.string().trim().max(1000).optional(),
}).strict();
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
class Refusal extends Error {
  constructor(public status: 400 | 401 | 403 | 409 | 413 | 415 | 422 | 429 | 503, message: string) { super(message); }
}

/** Additive, atomic and restart-safe. No existing learning/game tables are touched. */
export function ensureSuggestionSchema(db: Database) {
  db.transaction(() => db.exec(`
    CREATE TABLE IF NOT EXISTS institute_suggestions (
      id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, request_id TEXT NOT NULL, text TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sent','approved','building','ready','declined','needs_details')),
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, parent_note TEXT,
      proposal TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), scope_hash TEXT NOT NULL,
      approved_revision INTEGER, approved_hash TEXT,
      UNIQUE(profile_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS institute_suggestions_profile ON institute_suggestions(profile_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS institute_suggestion_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, suggestion_id TEXT NOT NULL, actor TEXT NOT NULL,
      action TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
      revision INTEGER NOT NULL, scope_hash TEXT NOT NULL, proposal TEXT NOT NULL,
      approved_revision INTEGER, parent_note TEXT, parent_message_id TEXT, parent_message_text TEXT, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS institute_suggestion_audit_request ON institute_suggestion_audit(suggestion_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS institute_suggestion_parent_message_action ON institute_suggestion_audit(suggestion_id,actor,parent_message_id,action) WHERE parent_message_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS institute_suggestion_outbox (
      id TEXT PRIMARY KEY, suggestion_id TEXT NOT NULL, payload TEXT NOT NULL,
      created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
      claim_token TEXT, lease_until INTEGER, delivered_at INTEGER, last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS institute_suggestion_outbox_due ON institute_suggestion_outbox(delivered_at, next_attempt_at);
    CREATE UNIQUE INDEX IF NOT EXISTS institute_suggestion_outbox_request ON institute_suggestion_outbox(suggestion_id);
    CREATE TABLE IF NOT EXISTS institute_suggestion_delivery_receipts (
      event_id TEXT PRIMARY KEY, suggestion_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
      channel_id TEXT NOT NULL, message_id TEXT NOT NULL, message_text TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `)).immediate();
}
function get(db: Database, id: string) {
  return db.query('SELECT * FROM institute_suggestions WHERE id = ?').get(id) as Suggestion | null;
}
function publicSuggestion(db: Database, s: Suggestion) {
  const pending = db.query('SELECT 1 FROM institute_suggestion_outbox WHERE suggestion_id = ? AND delivered_at IS NULL LIMIT 1').get(s.id);
  return {
    id: s.id, profileId: s.profile_id, text: s.text, status: s.status,
    createdAt: s.created_at, updatedAt: s.updated_at,
    ...(s.parent_note !== null ? { parentNote: s.parent_note } : {}),
    notificationPending: !!pending,
  };
}
function internalSuggestion(db: Database, s: Suggestion) {
  const event = db.query('SELECT id,payload,attempts,delivered_at FROM institute_suggestion_outbox WHERE suggestion_id = ? ORDER BY rowid DESC LIMIT 1').get(s.id) as { id: string; payload: string; attempts: number; delivered_at: number | null } | null;
  const receipt = event ? db.query(`SELECT channel_id AS channelId, message_id AS messageId, message_text AS messageText,
    created_at AS createdAt FROM institute_suggestion_delivery_receipts WHERE event_id = ?`).get(event.id) : null;
  return { ...publicSuggestion(db, s), requestId: s.request_id, proposal: s.proposal, revision: s.revision,
    scopeHash: s.scope_hash, approvedRevision: s.approved_revision, approvedScopeHash: s.approved_hash,
    notification: event ? { eventId: event.id, payloadHash: hash(event.payload), attempts: event.attempts,
      pending: event.delivered_at === null, deliveredAt: event.delivered_at, receipt } : null };
}
function audit(db: Database, s: Suggestion, actor: string, action: string, from: Status | null, now: number, message?: { parentMessageId: string; parentMessageText: string }) {
  db.query(`INSERT INTO institute_suggestion_audit
    (suggestion_id,actor,action,from_status,to_status,revision,scope_hash,proposal,approved_revision,parent_note,parent_message_id,parent_message_text,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(s.id, actor, action, from, s.status, s.revision, s.scope_hash, s.proposal, s.approved_revision, s.parent_note, message?.parentMessageId ?? null, message?.parentMessageText ?? null, now);
}

/** Promise-level deadline also bounds adapters that ignore AbortSignal. */
async function deadline<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, ms); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
async function boundedBody(request: Request, max: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > max)) throw new Refusal(413, 'That recording or message is too large.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  let complete = false;
  try {
    return await deadline(15_000, async signal => {
      signal.addEventListener('abort', () => { void reader.cancel().catch(() => {}); }, { once: true });
      const body = new Uint8Array(max); let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (size + chunk.value.byteLength > max) throw new Refusal(413, 'That recording or message is too large.');
        body.set(chunk.value, size); size += chunk.value.byteLength;
      }
      // A fixed buffer also bounds memory for streams of tiny or empty chunks.
      complete = true; return body.slice(0, size);
    });
  } catch (e) {
    if (e instanceof Refusal) throw e;
    throw new Refusal(400, 'The upload could not be read. Please try again.');
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
async function jsonBody(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Refusal(415, 'Send application/json.');
  const bytes = await boundedBody(request, 24 * 1024);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Refusal(400, 'Send a valid JSON message.'); }
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new Refusal(400, 'Please check the message fields.');
  return result.data;
}
function sameOrigin(request: Request, config: SuggestionConfig) {
  let expected = new URL(request.url).origin;
  if (config.publicOrigin) {
    try {
      const url = new URL(config.publicOrigin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== config.publicOrigin) throw Error('invalid origin');
      expected = url.origin;
    } catch { throw new Refusal(503, 'Suggestions are temporarily unavailable.'); }
  }
  const origin = request.headers.get('origin');
  // Non-browser integrations may omit Origin. Fetch Metadata still rejects a cross-site browser request.
  if ((origin !== null && origin !== expected) || request.headers.get('sec-fetch-site') === 'cross-site') throw new Refusal(403, 'Send suggestions from Institute.');
}
function authenticate(request: Request, config: SuggestionConfig) {
  if (!config.adminToken?.trim()) throw new Refusal(503, 'Parent management is not configured.');
  const supplied = request.headers.get('authorization') ?? '';
  // Fixed-size digests avoid leaking either length or matching prefixes.
  if (!timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(`Bearer ${config.adminToken}`).digest())) {
    throw new Refusal(401, 'Parent authentication required.');
  }
}
function budget(now: () => number, limit: number) {
  let start = now(); let used = 0;
  return () => {
    const time = now();
    if (time - start >= 60_000 || time < start) { start = time; used = 0; }
    // Intentionally global, not keyed by spoofable proxy headers or unbounded attacker IDs.
    if (++used > limit) throw new Refusal(429, 'Please wait a minute and try again.');
  };
}

export function createSuggestionRoutes(db: Database, options: Options = {}) {
  ensureSuggestionSchema(db);
  const config = options.config ?? suggestionConfigFromEnv();
  const fetcher = options.fetch ?? fetch; const now = options.now ?? Date.now;
  const writeBudget = budget(now, config.rateLimit ?? 30);
  const readBudget = budget(now, 300); const adminBudget = budget(now, 120);
  const app = new Hono();
  app.onError((e, c) => e instanceof Refusal ? c.json({ error: e.message }, e.status) : c.json({ error: 'Suggestions could not be saved. Please try again.' }, 500));
  app.use('/suggestions/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.path.includes('/suggestions/internal')) { authenticate(c.req.raw, config); adminBudget(); }
    else if (c.req.method === 'POST') { sameOrigin(c.req.raw, config); writeBudget(); }
    else { readBudget(); }
    await next();
  });
  app.post('/suggestions/transcribe', async c => {
    if (!config.deepgramKey?.trim()) throw new Refusal(503, 'Voice is unavailable right now. You can type your idea instead.');
    const contentType = c.req.header('content-type') ?? '';
    const mime = contentType.split(';')[0]!.trim().toLowerCase();
    if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(mime)) throw new Refusal(415, 'Please record WebM, Ogg, MP4, MP3 or WAV audio.');
    const bytes = await boundedBody(c.req.raw, 5 * 1024 * 1024);
    if (!bytes.length) throw new Refusal(422, 'I could not hear an idea. Try again or type it instead.');
    let text: unknown;
    try {
      text = await deadline(config.providerTimeoutMs ?? 12_000, async signal => {
        const response = await fetcher('https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true', {
          method: 'POST', headers: { Authorization: `Token ${config.deepgramKey}`, 'Content-Type': contentType },
          body: bytes as BodyInit, signal, redirect: 'error',
        });
        if (!response.ok) throw Error('provider failed');
        const data = await response.json() as { results?: { channels?: { alternatives?: { transcript?: unknown }[] }[] } };
        return data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      });
    } catch { throw new Refusal(503, 'Voice is unavailable right now. You can type your idea instead.'); }
    if (typeof text !== 'string' || !text.trim() || !/[\p{L}\p{N}]/u.test(text)) throw new Refusal(422, 'I could not hear an idea. Try again or type it instead.');
    if (text.trim().length > 4000) throw new Refusal(422, 'That idea is too long. Please try a shorter recording.');
    return c.json({ text: text.trim() });
  });
  app.post('/suggestions', async c => {
    const input = parse(submitSchema, await jsonBody(c.req.raw));
    const result = db.transaction(() => {
      const previous = db.query('SELECT * FROM institute_suggestions WHERE profile_id = ? AND request_id = ?').get(input.profileId, input.requestId) as Suggestion | null;
      if (previous) {
        if (previous.text !== input.text) throw new Refusal(409, 'This request was already used for a different idea.');
        return { suggestion: publicSuggestion(db, previous), duplicate: true };
      }
      const pending = (db.query('SELECT count(*) AS n FROM institute_suggestion_outbox WHERE delivered_at IS NULL').get() as { n: number }).n;
      if (pending >= (config.maxPending ?? 1000)) throw new Refusal(503, 'The suggestion inbox is full. Please try again later.');
      const time = now(); const id = crypto.randomUUID(); const eventId = crypto.randomUUID();
      db.query(`INSERT INTO institute_suggestions
        (id,profile_id,request_id,text,status,created_at,updated_at,proposal,revision,scope_hash)
        VALUES (?,?,?,?,'sent',?,?,?,1,?)`).run(id, input.profileId, input.requestId, input.text, time, time, input.text, hash(input.text));
      const s = get(db, id)!;
      const payload = JSON.stringify({ event: 'institute.suggestion.created', eventId, suggestionId: id, trusted: false,
        notice: 'Untrusted child suggestion, not authorization. Obtain authenticated parent approval of an exact reviewed scope before any build.',
        suggestion: { id, profileId: input.profileId, text: input.text, status: 'sent', createdAt: time, revision: 1, scopeHash: s.scope_hash },
      });
      db.query('INSERT INTO institute_suggestion_outbox (id,suggestion_id,payload,created_at,next_attempt_at) VALUES (?,?,?,?,?)').run(eventId, id, payload, time, time);
      audit(db, s, 'child', 'submit', null, time);
      return { suggestion: publicSuggestion(db, s), duplicate: false };
    }).immediate();
    return c.json({ suggestion: result.suggestion }, result.duplicate ? 200 : 201);
  });
  app.get('/suggestions', c => {
    const profileId = parse(profileSchema, c.req.query('profileId'));
    const rows = db.query('SELECT * FROM institute_suggestions WHERE profile_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20').all(profileId) as Suggestion[];
    return c.json({ suggestions: rows.map(s => publicSuggestion(db, s)), voiceAvailable: !!config.deepgramKey?.trim() });
  });
  // Internal management never accepts a webhook as approval. The bearer holder is a
  // trusted bridge that must authenticate the parent independently before asserting actor.
  app.get('/suggestions/internal', c => {
    const query = parse(z.object({ profileId: profileSchema.optional(), status: z.enum(statuses).optional(),
      notificationPending: z.enum(['true', 'false']).optional(),
      before: z.string().regex(/^\d{1,15}$/).optional() }).strict(), c.req.query());
    const pendingFilter = query.notificationPending === undefined ? null : Number(query.notificationPending === 'true');
    const rows = db.query(`SELECT rowid AS cursor, * FROM institute_suggestions
      WHERE (? IS NULL OR profile_id = ?) AND (? IS NULL OR status = ?) AND rowid < ?
        AND (? IS NULL OR EXISTS(SELECT 1 FROM institute_suggestion_outbox o WHERE o.suggestion_id=institute_suggestions.id AND o.delivered_at IS NULL) = ?)
      ORDER BY rowid DESC LIMIT 51`).all(query.profileId ?? null, query.profileId ?? null, query.status ?? null, query.status ?? null, Number(query.before ?? Number.MAX_SAFE_INTEGER), pendingFilter, pendingFilter) as (Suggestion & { cursor: number })[];
    const page = rows.slice(0, 50);
    return c.json({ suggestions: page.map(s => internalSuggestion(db, s)), nextCursor: rows.length > 50 ? String(page.at(-1)!.cursor) : null });
  });
  app.get('/suggestions/internal/:id', c => {
    const s = get(db, c.req.param('id')); if (!s) return c.json({ error: 'Suggestion not found.' }, 404);
    const history = db.query(`SELECT id, actor, action, from_status AS fromStatus, to_status AS toStatus,
      revision, scope_hash AS scopeHash, proposal, approved_revision AS approvedRevision,
      parent_note AS parentNote, parent_message_id AS parentMessageId, parent_message_text AS parentMessageText, created_at AS createdAt FROM institute_suggestion_audit
      WHERE suggestion_id = ? ORDER BY id DESC LIMIT 101`).all(s.id);
    return c.json({ suggestion: internalSuggestion(db, s), audit: history.slice(0, 100).reverse(), auditTruncated: history.length > 100 });
  });
  app.post('/suggestions/internal/:id/notification-ack', async c => {
    const input = parse(z.object({ eventId: z.string().uuid(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
      channelId: z.string().min(1).max(160), messageId: z.string().min(1).max(160),
      messageText: z.string().min(1).max(8000).refine(s => !!s.trim()) }).strict(), await jsonBody(c.req.raw));
    // Only the trusted bearer holder may assert that exact notification readback succeeded.
    // This acknowledges delivery, never parent consent, and does not change suggestion status.
    const result = db.transaction(() => {
      const s = get(db, c.req.param('id')); if (!s) return null;
      const event = db.query('SELECT payload FROM institute_suggestion_outbox WHERE id=? AND suggestion_id=?').get(input.eventId, s.id) as { payload: string } | null;
      if (!event || hash(event.payload) !== input.payloadHash) throw new Refusal(409, 'The notification event changed. Read it again.');
      const old = db.query('SELECT * FROM institute_suggestion_delivery_receipts WHERE event_id=?').get(input.eventId) as { channel_id: string; message_id: string; message_text: string } | null;
      if (old) {
        if (old.channel_id !== input.channelId || old.message_id !== input.messageId || old.message_text !== input.messageText) throw new Refusal(409, 'This event already has a different notification receipt.');
        return { suggestion: internalSuggestion(db, s), duplicate: true };
      }
      const time = now();
      db.query(`INSERT INTO institute_suggestion_delivery_receipts
        (event_id,suggestion_id,payload_hash,channel_id,message_id,message_text,created_at) VALUES (?,?,?,?,?,?,?)`)
        .run(input.eventId, s.id, input.payloadHash, input.channelId, input.messageId, input.messageText, time);
      db.query(`UPDATE institute_suggestion_outbox SET delivered_at=COALESCE(delivered_at,?), claim_token=NULL, lease_until=NULL, last_error=NULL
        WHERE id=? AND suggestion_id=?`).run(time, input.eventId, s.id);
      return { suggestion: internalSuggestion(db, s), duplicate: false };
    }).immediate();
    return result ? c.json(result) : c.json({ error: 'Suggestion not found.' }, 404);
  });
  app.patch('/suggestions/internal/:id', async c => {
    const input = parse(decisionSchema, await jsonBody(c.req.raw));
    if (!config.parentActors?.length) throw new Refusal(503, 'Parent identity allowlist is not configured.');
    if (!config.parentActors.includes(input.actor)) throw new Refusal(403, 'This parent identity is not allowed.');
    if ((input.action === 'revise') !== (input.proposal !== undefined)) throw new Refusal(400, 'Only a scope revision may include proposal.');
    const result = db.transaction(() => {
      const s = get(db, c.req.param('id')); if (!s) return null;
      if (input.revision !== s.revision || input.scopeHash !== s.scope_hash) throw new Refusal(409, 'The reviewed scope changed. Read it again before deciding.');
      const messageUses = db.query(`SELECT action,parent_message_text FROM institute_suggestion_audit
        WHERE suggestion_id=? AND actor=? AND parent_message_id=?`).all(s.id, input.actor, input.parentMessageId) as { action: string; parent_message_text: string }[];
      if (messageUses.some(a => a.parent_message_text !== input.parentMessageText || a.action === input.action)) {
        throw new Refusal(409, 'This parent message was already used. Read the decision history.');
      }
      const from = s.status;
      if (input.action === 'revise') {
        if (['building', 'ready'].includes(s.status)) throw new Refusal(409, 'A build scope cannot change after building starts.');
        s.proposal = input.proposal!; s.revision++; s.scope_hash = hash(s.proposal);
        s.approved_revision = null; s.approved_hash = null; s.status = 'sent';
        // Do not carry a note about an old approval forward into a newly reviewed scope.
        s.parent_note = input.parentNote ?? null;
      } else {
        const allowed: Record<string, Status[]> = {
          approve: ['sent', 'needs_details'], decline: ['sent', 'needs_details', 'approved'],
          needs_details: ['sent', 'approved'], building: ['approved'], ready: ['building'],
        };
        if (!allowed[input.action]?.includes(s.status)) throw new Refusal(409, 'That status change is not allowed.');
        if (input.action === 'building' || input.action === 'ready') {
          if (s.approved_revision !== input.revision || s.approved_hash !== input.scopeHash) throw new Refusal(409, 'Builds require this exact approved revision.');
        }
        s.status = input.action === 'approve' ? 'approved' : input.action === 'decline' ? 'declined' : input.action;
        if (input.action === 'approve') { s.approved_revision = s.revision; s.approved_hash = s.scope_hash; }
        if (input.action === 'decline' || input.action === 'needs_details') { s.approved_revision = null; s.approved_hash = null; }
        if (input.parentNote !== undefined) s.parent_note = input.parentNote;
      }
      s.updated_at = now();
      db.query(`UPDATE institute_suggestions SET status=?, updated_at=?, parent_note=?, proposal=?, revision=?,
        scope_hash=?, approved_revision=?, approved_hash=? WHERE id=?`).run(s.status, s.updated_at, s.parent_note, s.proposal, s.revision, s.scope_hash, s.approved_revision, s.approved_hash, s.id);
      audit(db, s, input.actor, input.action, from, s.updated_at, input);
      return internalSuggestion(db, s);
    }).immediate();
    return result ? c.json({ suggestion: result }) : c.json({ error: 'Suggestion not found.' }, 404);
  });
  return app;
}

type Outbox = { id: string; payload: string; attempts: number; claim_token: string };
/** At-least-once delivery. Stable eventId lets the receiving integration deduplicate. */
export function createSuggestionDelivery(db: Database, options: Options = {}) {
  ensureSuggestionSchema(db);
  const config = options.config ?? suggestionConfigFromEnv();
  const now = options.now ?? Date.now; const fetcher = options.fetch ?? fetch;
  const timeout = config.deliveryTimeoutMs ?? 10_000;
  let running = false;
  function configured() {
    if (!config.webhookUrl || !config.webhookSecret?.trim()) return false;
    try { const url = new URL(config.webhookUrl); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash; }
    catch { return false; }
  }
  function claim(): Outbox | null {
    return db.transaction(() => {
      const time = now();
      // A database-backed single-worker lease also serializes separate server processes.
      if (db.query('SELECT 1 FROM institute_suggestion_outbox WHERE delivered_at IS NULL AND lease_until > ? LIMIT 1').get(time)) return null;
      const row = db.query(`SELECT id,payload,attempts FROM institute_suggestion_outbox
        WHERE delivered_at IS NULL AND next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)
        ORDER BY next_attempt_at, rowid LIMIT 1`).get(time, time) as Outbox | null;
      if (!row) return null;
      row.claim_token = crypto.randomUUID();
      db.query('UPDATE institute_suggestion_outbox SET claim_token=?, lease_until=?, attempts=attempts+1 WHERE id=?').run(row.claim_token, time + timeout + 5_000, row.id);
      row.attempts++; return row;
    }).immediate();
  }
  return {
    async drain(batch = 10): Promise<number> {
      if (running || !configured()) return 0;
      running = true; let attempted = 0;
      try {
        for (let i = 0; i < Math.min(Math.max(0, batch), 25); i++) {
          const row = claim(); if (!row) break;
          attempted++;
          let delivered = false;
          try {
            await deadline(timeout, async signal => {
              const response = await fetcher(config.webhookUrl!, {
                method: 'POST', redirect: 'error', signal,
                headers: { 'Content-Type': 'application/json', 'X-Gitlab-Token': config.webhookSecret!, 'Idempotency-Key': row.id },
                body: row.payload,
              });
              // Do not parse or expose a webhook response. Cancel body to bound resources.
              void response.body?.cancel().catch(() => {});
              if (!response.ok) throw Error('delivery failed');
            });
            delivered = true;
          } catch { /* Never discard failures or copy remote response/secrets into the database. */ }
          const time = now();
          const delay = Math.min(3_600_000, 1000 * 2 ** Math.min(row.attempts - 1, 12));
          db.query(`UPDATE institute_suggestion_outbox SET delivered_at=?, next_attempt_at=?, last_error=?, claim_token=NULL, lease_until=NULL
            WHERE id=? AND claim_token=?`).run(delivered ? time : null, time + delay, delivered ? null : 'delivery failed', row.id, row.claim_token);
        }
      } finally { running = false; }
      return attempted;
    },
  };
}
/** Explicit startup only: importing the module never opens a DB or sends a request. */
export function startSuggestionDelivery(db: Database, options: Options = {}) {
  const worker = createSuggestionDelivery(db, options);
  const drain = () => { void worker.drain().catch(() => { console.warn('[suggestions] delivery deferred; durable queue retained'); }); };
  drain();
  const interval = setInterval(drain, 5_000); interval.unref();
  return () => clearInterval(interval);
}
