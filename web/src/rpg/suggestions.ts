import { newRequestId } from './requestId';

export const MAX_SUGGESTION_AUDIO = 5 * 1024 * 1024;
export type SuggestionStatus = 'sent' | 'approved' | 'building' | 'ready' | 'declined' | 'needs_details';
export type Suggestion = {
  id: string; profileId: string; text: string; status: SuggestionStatus;
  createdAt: string | number; updatedAt: string | number; parentNote?: string; notificationPending?: boolean;
};
export type SuggestionPayload = { requestId: string; text: string };
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function suggestionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    sent: 'Saved for Ares / waiting for Dad', approved: 'Dad approved', building: 'Being built',
    ready: 'Ready for Dad to review', declined: 'Not this time', needs_details: 'Dad needs more details',
  };
  return Object.hasOwn(labels, status) ? labels[status]! : 'Status unavailable';
}

/** Only text and a retry receipt are stored here. Never audio or parent credentials. */
export class SuggestionDraft {
  text = '';
  persisted = true;
  private requestId: string | null = null;
  private readonly key: string;
  constructor(api: string, profile: string, private storage?: DraftStorage) {
    this.key = `institute:rpg:suggestion:v1:${api}:${profile}`;
    try {
      this.storage ??= globalThis.localStorage;
      const saved = JSON.parse(this.storage?.getItem(this.key) ?? 'null');
      if (saved && typeof saved.text === 'string' && saved.text.length <= 4000) {
        this.text = saved.text;
        if (typeof saved.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.requestId)) this.requestId = saved.requestId;
      }
    } catch { this.persisted = false; }
  }
  setText(text: string): void {
    if (text !== this.text) this.requestId = null;
    this.text = text; this.save();
  }
  prepare(): SuggestionPayload {
    const text = this.text.trim();
    if (!text || text.length > 4000) throw new Error('Write between 1 and 4,000 characters.');
    this.requestId ??= newRequestId(); this.save();
    return { requestId: this.requestId, text };
  }
  confirm(requestId: string): void {
    if (this.requestId !== requestId) return;
    this.text = ''; this.requestId = null; this.save();
  }
  private save(): void {
    try {
      if (!this.storage) throw new Error('Local draft storage unavailable');
      if (!this.text) this.storage.removeItem(this.key);
      else this.storage.setItem(this.key, JSON.stringify({ text: this.text, requestId: this.requestId }));
      this.persisted = true;
    } catch { this.persisted = false; }
  }
}

export class SuggestionError extends Error {
  constructor(public status: number) { super(`Suggestion request failed (${status})`); }
}
function isSuggestion(value: unknown): value is Suggestion {
  if (!value || typeof value !== 'object') return false;
  const v = value as Suggestion;
  return typeof v.id === 'string' && typeof v.profileId === 'string' && typeof v.text === 'string'
    && typeof v.status === 'string' && (typeof v.createdAt === 'string' || typeof v.createdAt === 'number')
    && (typeof v.updatedAt === 'string' || typeof v.updatedAt === 'number')
    && (v.parentNote === undefined || typeof v.parentNote === 'string');
}
export class SuggestionClient {
  constructor(private api: string, private profile: string, private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async call(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(30_000);
    const response = await this.fetcher(`${this.api}/rpg/suggestions${path}`, {
      ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) throw new SuggestionError(response.status);
    return response.json();
  }
  async history(signal?: AbortSignal): Promise<{ suggestions: Suggestion[]; voiceAvailable: boolean }> {
    const value = await this.call(`?profileId=${encodeURIComponent(this.profile)}`, {}, signal) as { suggestions: unknown[]; voiceAvailable: boolean };
    if (!Array.isArray(value?.suggestions) || !value.suggestions.every(isSuggestion) || typeof value.voiceAvailable !== 'boolean') throw new Error('Invalid suggestion history');
    return { suggestions: value.suggestions.filter((s): s is Suggestion => isSuggestion(s) && s.profileId === this.profile).slice(0, 20), voiceAvailable: value.voiceAvailable };
  }
  async submit(payload: SuggestionPayload, signal?: AbortSignal): Promise<Suggestion> {
    const value = await this.call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: this.profile, ...payload }) }, signal) as { suggestion: unknown };
    if (!isSuggestion(value?.suggestion) || value.suggestion.profileId !== this.profile || value.suggestion.text !== payload.text) throw new Error('The save could not be confirmed');
    return value.suggestion;
  }
  async transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
    if (!audio.size || audio.size > MAX_SUGGESTION_AUDIO || !audio.type.startsWith('audio/')) throw new Error('Record up to 60 seconds and 5 MiB of audio.');
    const value = await this.call('/transcribe', { method: 'POST', headers: { 'Content-Type': audio.type }, body: audio }, signal) as { text: unknown };
    if (typeof value?.text !== 'string' || !value.text.trim() || value.text.length > 4000) throw new Error('No usable transcript. Please type your idea instead.');
    return value.text;
  }
}
