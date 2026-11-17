import { SuggestionClient, SuggestionDraft, SuggestionError, suggestionStatusLabel, type Suggestion } from './suggestions';
import { LiveSuggestion } from './LiveSuggestion';
import { escapeHtml as esc } from './icons';
import './suggestions.css';

/** Child-only UI: a request is saved for review, never approved or executed here. */
export class SuggestionPanel {
  private readonly abort = new AbortController();
  private readonly recorder: LiveSuggestion;
  private voiceBase = '';
  private voiceEdited = false;
  private voicePending = false;
  private readonly draft: SuggestionDraft;
  private readonly client: SuggestionClient;
  private disposed = false;
  private sending = false;
  private refreshing = false;
  private history: Suggestion[] = [];
  private historyVersion = 0;
  private textarea: HTMLTextAreaElement;

  constructor(private root: HTMLElement, api: string, profile: string) {
    this.draft = new SuggestionDraft(api, profile);
    this.client = new SuggestionClient(api, profile);
    root.innerHTML = `<div class="rpg-suggestions"><h2 id="rpg-dialog-title">💡 Your idea</h2>
      <p id="rpg-suggestion-intro">Tell us your idea. Dad will see it first.</p>
      <section class="rpg-suggestion-voice"><button type="button" class="rpg-primary idea-talk" data-suggestion="record">🎤 Tap to talk</button><button type="button" class="rpg-primary idea-talk" data-suggestion="stop" hidden>Done talking</button><p data-voice-help role="status" aria-live="polite">Tap to talk, or type below.</p></section>
      <label for="rpg-suggestion-text">My idea</label><textarea id="rpg-suggestion-text" rows="5" maxlength="4000" placeholder="My idea is…"></textarea>
      <p data-suggestion-notice role="status" aria-live="polite"></p>
      <div class="rpg-button-row"><button type="button" class="rpg-primary" data-suggestion="send">Send</button><button type="button" data-action="close">Cancel</button></div>
      <details class="rpg-suggestion-history"><summary>My saved ideas</summary><div class="rpg-suggestion-history-heading"><h3>My recent ideas</h3><button type="button" data-suggestion="refresh">Refresh status</button></div><p data-history-notice role="status" aria-live="polite">Loading saved ideas…</p><ol data-suggestion-history></ol></details></div>`;
    this.textarea = this.el<HTMLTextAreaElement>('#rpg-suggestion-text');
    this.textarea.value = this.draft.text;
    this.recorder = new LiveSuggestion(() => { if (!this.disposed) { this.updateVoice(); this.updateDraft(); } }, text => { if (this.voiceEdited) return; this.textarea.value = [this.voiceBase, text].filter(Boolean).join(this.voiceBase && text ? ' ' : '').slice(0, 4000); this.updateDraft(); }, text => this.notice(text));
    this.textarea.addEventListener('input', () => { if (this.voicePending) this.voiceEdited = true; if (this.recorder.state === 'idle') this.draft.setText(this.textarea.value); this.updateDraft(); }, { signal: this.abort.signal });
    root.addEventListener('click', this.onClick, { signal: this.abort.signal });
    window.addEventListener('pagehide', () => this.cancelRecording(), { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.recorder.state !== 'idle') { this.cancelRecording(); this.notice('Voice stopped. Your typed idea is still here.'); } }, { signal: this.abort.signal });
    this.updateDraft(); this.updateVoice(); void this.refresh();
  }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private button(action: string): HTMLButtonElement { return this.el<HTMLButtonElement>(`[data-suggestion="${action}"]`); }
  private notice(text: string): void { if (!this.disposed) this.el('[data-suggestion-notice]').textContent = text; }
  private updateDraft(): void {
    const length = this.textarea.value.trim().length;
    this.button('send').disabled = this.sending || this.recorder.state !== 'idle' || !length || length > 4000;
    this.button('record').disabled = this.sending;
    this.textarea.disabled = this.sending;
    this.textarea.readOnly = this.recorder.state !== 'idle';
    this.button('send').textContent = this.sending ? 'Saving…' : 'Send';
  }
  private updateVoice(): void {
    const state = this.recorder.state;
    this.button('record').hidden = state !== 'idle';
    this.button('stop').hidden = state !== 'listening';
    this.el('[data-voice-help]').textContent = state === 'requesting' ? 'Getting ready to listen…' : state === 'listening' ? '🔴 Listening now. Tell me your idea! You can edit after Done talking.' : state === 'stopping' ? 'Finishing your words…' : 'Tap to talk, or type below.';
    if (state === 'idle' && !this.disposed && this.textarea.value !== this.draft.text) { this.draft.setText(this.textarea.value); }
  }
  private cancelRecording(): void {
    if (this.recorder.state !== 'idle') { if (!this.voiceEdited) this.textarea.value = this.voiceBase; this.recorder.cancel(); this.updateDraft(); }
  }
  private onClick = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-suggestion]');
    if (!button || button.disabled) return;
    event.stopPropagation();
    switch (button.dataset.suggestion) {
      case 'record': this.voiceBase = this.textarea.value; this.voicePending = true; this.voiceEdited = false; this.notice(''); void this.recorder.start(); break;
      case 'stop': this.recorder.stop(); break;
      case 'send': void this.send(); break;
      case 'refresh': void this.refresh(); break;
    }
  };
  private async send(): Promise<void> {
    if (this.sending || this.recorder.state !== 'idle') return;
    this.draft.setText(this.textarea.value); this.voicePending = false;
    const payload = this.draft.prepare();
    this.sending = true; this.updateDraft(); this.notice('Saving your idea…');
    try {
      const suggestion = await this.client.submit(payload, this.abort.signal);
      if (this.disposed) return;
      this.voicePending = false; this.draft.confirm(payload.requestId); this.textarea.value = this.draft.text;
      this.historyVersion++;
      this.history = [suggestion, ...this.history.filter(item => item.id !== suggestion.id)].slice(0, 20); this.renderHistory();
      this.notice('Idea saved. Dad will check it.');
    } catch (error) {
      if (this.disposed) return;
      this.notice(error instanceof SuggestionError && error.status === 409
        ? 'Please change your idea before trying again. Your words are still here.'
        : 'Could not save your idea. Your words are still here. Please try again.');
    } finally { this.sending = false; if (!this.disposed) this.updateDraft(); }
  }
  private async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true; this.button('refresh').disabled = true;
    const version = this.historyVersion;
    this.el('[data-history-notice]').textContent = 'Checking saved ideas…';
    try {
      const history = await this.client.history(this.abort.signal);
      if (this.disposed) return;
      // A GET started before a confirmed POST must not remove that new idea.
      if (version === this.historyVersion) this.history = history.suggestions;
      this.renderHistory(); this.updateVoice();
    } catch {
      if (this.disposed) return;
      this.el('[data-history-notice]').textContent = 'Could not check saved ideas. Try again later.';
    } finally { this.refreshing = false; if (!this.disposed) this.button('refresh').disabled = false; }
  }
  private renderHistory(): void {
    this.el('[data-history-notice]').textContent = this.history.length ? 'Your latest saved ideas (up to 20). Saved does not mean delivered; Dad reviews each idea.' : 'No saved ideas yet. Your first idea can start here.';
    this.el('[data-suggestion-history]').innerHTML = this.history.map(item => {
      const date = new Date(item.createdAt);
      return `<li><div class="rpg-suggestion-history-heading"><strong>${esc(suggestionStatusLabel(item.status))}</strong><time>${Number.isNaN(date.getTime()) ? '' : esc(date.toLocaleDateString())}</time></div><p class="rpg-suggestion-words">${esc(item.text)}</p>${item.parentNote ? `<p class="rpg-suggestion-parent-note"><b>Dad's note:</b> ${esc(item.parentNote)}</p>` : ''}${item.notificationPending ? '<small>Saved for review. Notification to Ares is still pending.</small>' : item.status === 'sent' ? '<small>Saved request. Delivery to Ares is not confirmed here.</small>' : ''}</li>`;
    }).join('');
  }
  dispose(): void {
    if (this.disposed) return;
    this.cancelRecording(); if (this.voicePending) { this.draft.setText(this.voiceEdited ? this.textarea.value : this.voiceBase); this.voicePending = false; } this.disposed = true; this.abort.abort(); this.recorder.cancel();
  }
}
