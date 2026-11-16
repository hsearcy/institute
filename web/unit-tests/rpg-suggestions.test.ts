import { describe, expect, test } from 'bun:test';
import { SuggestionDraft, suggestionStatusLabel, SuggestionClient } from '../src/rpg/suggestions';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe('suggestion draft and receipt identity (no database)', () => {
  test('retains the exact child draft and UUID after ambiguous failure and reload; isolates profiles and API bases', () => {
    const store = storage();
    const draft = new SuggestionDraft('/api', 'kid-one', store);
    draft.setText('  Can we have a blue dragon?  ');
    const first = draft.prepare();
    expect(first.text).toBe('Can we have a blue dragon?');
    expect(first.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const reloaded = new SuggestionDraft('/api', 'kid-one', store);
    expect(reloaded.text).toBe('  Can we have a blue dragon?  ');
    expect(reloaded.prepare()).toEqual(first);
    expect(new SuggestionDraft('/api', 'kid-two', store).text).toBe('');
    expect(new SuggestionDraft('/other', 'kid-one', store).text).toBe('');
    reloaded.setText('Make it purple instead!');
    expect(reloaded.prepare().requestId).not.toBe(first.requestId);
  });
  test('late success never erases a newly edited draft; confirmed success clears only matching draft', () => {
    const draft = new SuggestionDraft('', 'test', storage());
    draft.setText('first'); const first = draft.prepare();
    draft.setText('second'); draft.confirm(first.requestId);
    expect(draft.text).toBe('second');
    const second = draft.prepare(); draft.confirm(second.requestId);
    expect(draft.text).toBe('');
  });
  test('blank and oversized text cannot be submitted; unavailable localStorage does not block typing', () => {
    const draft = new SuggestionDraft('', 'test', { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } });
    expect(() => draft.prepare()).toThrow();
    draft.setText('x'.repeat(4001)); expect(() => draft.prepare()).toThrow();
    draft.setText('Use bigger doors'); expect(draft.prepare().text).toBe('Use bigger doors');
    expect(draft.persisted).toBe(false);
  });
  test('statuses are honest and never claim delivery or provide an approval action', () => {
    expect(suggestionStatusLabel('sent')).toBe('Saved for Ares / waiting for Dad');
    expect(suggestionStatusLabel('approved')).toBe('Dad approved');
    expect(suggestionStatusLabel('building')).toBe('Being built');
    expect(suggestionStatusLabel('ready')).toBe('Ready for Dad to review');
    expect(suggestionStatusLabel('declined')).toBe('Not this time');
    expect(suggestionStatusLabel('needs_details')).toBe('Dad needs more details');
    expect(suggestionStatusLabel('unexpected')).toBe('Status unavailable');
    expect(suggestionStatusLabel('constructor')).toBe('Status unavailable');
    expect(suggestionStatusLabel('__proto__')).toBe('Status unavailable');
  });
});

describe('suggestion API contract (isolated fetch)', () => {
  test('uses the existing base/profile, raw actual audio MIME, and stable JSON payload', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = (async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/transcribe')) return Response.json({ text: 'A pet dragon' });
      if (init?.method === 'POST') return Response.json({ suggestion: { ...JSON.parse(String(init.body)), id: 's1', status: 'sent', createdAt: '2026-01-01', updatedAt: '2026-01-01' } }, { status: 201 });
      return Response.json({ suggestions: [], voiceAvailable: false });
    }) as typeof fetch;
    const api = new SuggestionClient('/same-api', 'kid name', fetcher);
    expect(await api.history()).toEqual({ suggestions: [], voiceAvailable: false });
    expect(calls[0]!.url).toBe('/same-api/rpg/suggestions?profileId=kid%20name');
    const audio = new Blob(['voice'], { type: 'audio/ogg;codecs=opus' });
    expect(await api.transcribe(audio)).toBe('A pet dragon');
    expect(calls[1]!.init!.body).toBe(audio);
    expect(new Headers(calls[1]!.init!.headers).get('Content-Type')).toBe(audio.type);
    await api.submit({ requestId: '91dd1eb9-cbd2-40a4-85d7-3196ef229fa3', text: 'A pet dragon' });
    expect(JSON.parse(String(calls[2]!.init!.body))).toEqual({ profileId: 'kid name', requestId: '91dd1eb9-cbd2-40a4-85d7-3196ef229fa3', text: 'A pet dragon' });
  });
  test('rejects oversized/empty audio before sending and exposes 503 and 409 without losing draft identity', async () => {
    let calls = 0;
    const api = new SuggestionClient('', 'test', (async () => { calls++; return Response.json({ error: 'unavailable' }, { status: 503 }); }) as typeof fetch);
    await expect(api.transcribe(new Blob([]))).rejects.toThrow();
    await expect(api.transcribe(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'audio/webm' }))).rejects.toThrow();
    expect(calls).toBe(0);
    await expect(api.transcribe(new Blob(['audio'], { type: 'audio/mp4' }))).rejects.toMatchObject({ status: 503 });
    const conflict = new SuggestionClient('', 'test', (async () => Response.json({ error: 'conflict' }, { status: 409 })) as typeof fetch);
    await expect(conflict.submit({ requestId: 'id', text: 'draft' })).rejects.toMatchObject({ status: 409 });
  });
  test('rejects HTML SPA fallback instead of claiming the suggestion was saved', async () => {
    const api = new SuggestionClient('', 'test', (async () => new Response('<html>app</html>')) as typeof fetch);
    await expect(api.history()).rejects.toThrow();
    await expect(api.submit({ requestId: 'id', text: 'draft' })).rejects.toThrow();
  });
});
