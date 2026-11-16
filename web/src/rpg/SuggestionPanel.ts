import { SuggestionClient, SuggestionDraft, SuggestionError, suggestionStatusLabel, type Suggestion } from './suggestions';
import { SuggestionRecorder } from './SuggestionRecorder';
import { escapeHtml as esc } from './icons';
import './suggestions.css';

/** Child-only UI: a request is saved for review, never approved or executed here. */
export class SuggestionPanel {
  private readonly abort = new AbortController();
  private transcription: AbortController | null = null;
  private readonly recorder: SuggestionRecorder;
  private readonly draft: SuggestionDraft;
  private readonly client: SuggestionClient;
  private disposed = false;
  private sending = false;
  private transcribing = false;
  private refreshing = false;
  private voiceAvailable: boolean | null = null;
  private voiceState: SuggestionRecorder['state'] = 'idle';
  private audioURL: string | null = null;
  private history: Suggestion[] = [];
  private historyVersion = 0;
  private textarea: HTMLTextAreaElement;

  constructor(private root: HTMLElement, api: string, profile: string) {
    this.draft = new SuggestionDraft(api, profile);
    this.client = new SuggestionClient(api, profile);
    root.innerHTML = `<div class="rpg-suggestions"><p class="rpg-eyebrow">YOUR IDEAS BELONG HERE</p><h2 id="rpg-dialog-title">Suggest a change</h2>
      <p id="rpg-suggestion-intro">Tell Ares what you would change. Dad reviews ideas outside the game before anything is built.</p>
      <section class="rpg-suggestion-voice" aria-label="Record an idea"><p>Speak for up to 60 seconds (5 MiB), or just type below.</p>
        <p data-voice-help>Checking voice availability…</p><div class="rpg-button-row">
          <button type="button" data-suggestion="record">Record my idea</button><button type="button" data-suggestion="stop" hidden>Stop recording</button>
          <button type="button" data-suggestion="cancel-recording" hidden>Discard recording</button><button type="button" data-suggestion="transcribe" hidden>Transcribe recording</button>
        </div><audio data-recording-preview controls hidden aria-label="Listen to your recording"></audio>
        <p class="rpg-suggestion-privacy">Audio stays on this device until you choose Transcribe recording. Audio is used only for transcription, not kept on the server. Closing discards it.</p>
        <div data-transcript-preview hidden><label for="rpg-suggestion-transcript">Recorded words, check and edit</label><textarea id="rpg-suggestion-transcript" rows="3" maxlength="4000"></textarea><button type="button" data-suggestion="use-transcript">Use these words in my idea</button><p>This replaces the idea below only when you choose it.</p></div>
      </section>
      <label for="rpg-suggestion-text">My idea, type or edit before sending</label>
      <textarea id="rpg-suggestion-text" rows="5" maxlength="4000" aria-describedby="rpg-suggestion-draft-note rpg-suggestion-count" placeholder="I wish the game had…"></textarea>
      <div class="rpg-suggestion-draft-meta"><span id="rpg-suggestion-draft-note"></span><span id="rpg-suggestion-count"></span></div>
      <p data-suggestion-notice role="status" aria-live="polite"></p>
      <div class="rpg-button-row"><button type="button" class="rpg-primary" data-suggestion="send">Send to Ares</button><button type="button" data-action="close">Back</button></div>
      <section class="rpg-suggestion-history" aria-labelledby="rpg-suggestion-history-title"><div class="rpg-suggestion-history-heading"><h3 id="rpg-suggestion-history-title">My recent ideas</h3><button type="button" data-suggestion="refresh">Refresh status</button></div>
        <p data-history-notice role="status" aria-live="polite">Loading saved ideas…</p><ol data-suggestion-history></ol>
      </section></div>`;
    this.textarea = this.el<HTMLTextAreaElement>('#rpg-suggestion-text');
    this.textarea.value = this.draft.text;
    this.recorder = new SuggestionRecorder(() => { if (!this.disposed) this.updateVoice(); }, text => this.notice(text));
    this.textarea.addEventListener('input', () => { this.draft.setText(this.textarea.value); this.updateDraft(); }, { signal: this.abort.signal });
    root.addEventListener('click', this.onClick, { signal: this.abort.signal });
    // Page transitions must release even a pending permission prompt's late stream.
    window.addEventListener('pagehide', () => { this.cancelRecording(); }, { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.recorder.state === 'recording' || this.recorder.state === 'requesting')) {
        this.cancelRecording(); this.notice('Recording was discarded when you left the game. Your typed idea is still here.');
      }
    }, { signal: this.abort.signal });
    this.updateDraft(); this.updateVoice(); void this.refresh();
  }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private button(action: string): HTMLButtonElement { return this.el<HTMLButtonElement>(`[data-suggestion="${action}"]`); }
  private notice(text: string): void { if (!this.disposed) this.el('[data-suggestion-notice]').textContent = text; }
  private updateDraft(): void {
    this.el('#rpg-suggestion-count').textContent = `${this.textarea.value.length.toLocaleString()} / 4,000`;
    this.el('#rpg-suggestion-draft-note').textContent = this.draft.persisted ? 'Draft kept on this device for this player.' : 'Draft storage is unavailable. Keep this window open to avoid losing your words.';
    const length = this.textarea.value.trim().length;
    this.button('send').disabled = this.sending || !length || length > 4000;
    this.button('send').textContent = this.sending ? 'Saving for review…' : 'Send to Ares';
    this.button('send').setAttribute('aria-busy', String(this.sending));
  }
  private updateVoice(): void {
    const state = this.recorder.state, previousState = this.voiceState;
    this.voiceState = state;
    const focused = document.activeElement;
    const active = state === 'requesting' || state === 'recording' || state === 'stopping';
    const ready = state === 'ready';
    this.button('record').hidden = active || ready;
    this.button('record').disabled = !this.recorder.available || this.voiceAvailable !== true || this.transcribing;
    this.button('stop').hidden = state !== 'recording';
    this.button('cancel-recording').hidden = !active && !ready && !this.transcribing;
    this.button('transcribe').hidden = !ready;
    this.button('transcribe').disabled = this.transcribing || this.voiceAvailable !== true;
    this.button('transcribe').textContent = this.transcribing ? 'Turning voice into words…' : 'Transcribe recording';
    this.el('[data-voice-help]').textContent = !this.recorder.available
      ? (globalThis.isSecureContext ? 'Microphone recording is not supported here. Typing always works.' : 'Voice needs HTTPS or localhost. You can type your idea below.')
      : state === 'requesting' ? 'Waiting for microphone permission… You can still type.'
      : state === 'recording' ? 'Recording… Choose Stop when you finish. It stops at 60 seconds.'
      : state === 'stopping' ? 'Finishing the recording…'
      : this.voiceAvailable === false ? 'Voice transcription is resting. Type your idea instead.'
      : this.voiceAvailable === null ? 'Voice availability is not confirmed. You can type or refresh status.'
      : ready ? 'Recording stopped. Listen first, then choose Transcribe recording.' : 'Microphone ready when you are. Recording never sends an idea automatically.';
    const audio = this.el<HTMLAudioElement>('[data-recording-preview]');
    if (ready && this.recorder.audio && !this.audioURL) {
      this.audioURL = URL.createObjectURL(this.recorder.audio); audio.src = this.audioURL; audio.hidden = false;
    } else if (!ready && this.audioURL) this.clearAudio();
    // Do not leave keyboard users focused on a control that just disappeared.
    // Never steal focus from the draft while permission or a request finishes.
    if (focused instanceof HTMLButtonElement && focused.dataset.suggestion && this.root.contains(focused)
      && (focused.hidden || focused.disabled || (previousState === 'requesting' && state === 'recording' && focused === this.button('cancel-recording')))) {
      const next = state === 'recording' ? this.button('stop') : active || this.transcribing ? this.button('cancel-recording')
        : ready && !this.button('transcribe').disabled ? this.button('transcribe') : this.textarea;
      next.focus({ preventScroll: true });
    }
  }
  private clearAudio(): void {
    const audio = this.el<HTMLAudioElement>('[data-recording-preview]');
    audio.pause(); audio.removeAttribute('src'); audio.hidden = true;
    if (this.audioURL) URL.revokeObjectURL(this.audioURL); this.audioURL = null;
  }
  private cancelRecording(): void {
    this.transcription?.abort(); this.transcription = null; this.transcribing = false;
    this.recorder.cancel(); this.clearAudio();
    this.el('[data-transcript-preview]').hidden = true;
    this.el<HTMLTextAreaElement>('#rpg-suggestion-transcript').value = '';
  }
  private onClick = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-suggestion]');
    if (!button || button.disabled) return;
    event.stopPropagation();
    switch (button.dataset.suggestion) {
      case 'record': this.notice(''); void this.recorder.start(); break;
      case 'stop': this.recorder.stop(); break;
      case 'cancel-recording': this.cancelRecording(); this.notice('Recording discarded. Your typed idea is still here.'); this.button('record').focus(); break;
      case 'transcribe': void this.transcribe(); break;
      case 'use-transcript':
        this.textarea.value = this.el<HTMLTextAreaElement>('#rpg-suggestion-transcript').value;
        this.draft.setText(this.textarea.value); this.updateDraft(); this.el('[data-transcript-preview]').hidden = true;
        this.notice('Check your idea below. Nothing is sent until you choose Send to Ares.'); this.textarea.focus(); break;
      case 'send': void this.send(); break;
      case 'refresh': void this.refresh(); break;
    }
  };
  private async transcribe(): Promise<void> {
    if (!this.recorder.audio || this.transcribing) return;
    this.transcribing = true;
    const controller = new AbortController(); this.transcription = controller;
    this.updateVoice(); this.notice('Transcribing only. Your idea has not been sent.');
    try {
      const text = await this.client.transcribe(this.recorder.audio, AbortSignal.any([this.abort.signal, controller.signal]));
      if (this.disposed || controller.signal.aborted) return;
      this.el<HTMLTextAreaElement>('#rpg-suggestion-transcript').value = text;
      this.el('[data-transcript-preview]').hidden = false;
      this.notice('Your words are ready to check. Edit them and choose Use these words in my idea.');
      this.el<HTMLTextAreaElement>('#rpg-suggestion-transcript').focus();
    } catch (error) {
      if (this.disposed || controller.signal.aborted) return;
      if (error instanceof SuggestionError && error.status === 503) this.voiceAvailable = false;
      this.notice(error instanceof SuggestionError && error.status === 503 ? 'Voice transcription is unavailable right now. Your idea is still editable. Please type it below.' : 'Could not transcribe that recording. Try again or type your idea below.');
    } finally {
      if (this.transcription === controller) { this.transcription = null; this.transcribing = false; if (!this.disposed) this.updateVoice(); }
    }
  }
  private async send(): Promise<void> {
    if (this.sending) return;
    const payload = this.draft.prepare();
    this.sending = true; this.updateDraft(); this.notice('Saving your idea for Dad to review…');
    try {
      const suggestion = await this.client.submit(payload, this.abort.signal);
      if (this.disposed) return;
      this.draft.confirm(payload.requestId); this.textarea.value = this.draft.text;
      this.historyVersion++;
      this.history = [suggestion, ...this.history.filter(item => item.id !== suggestion.id)].slice(0, 20); this.renderHistory();
      this.notice('Saved for Ares / waiting for Dad. This confirms a saved request, not delivery to Ares. Dad reviews it before building starts.');
    } catch (error) {
      if (this.disposed) return;
      this.notice(error instanceof SuggestionError && error.status === 409
        ? 'These words do not match an earlier saved idea. Your draft is kept. Refresh history to check it; edit your idea before sending a new request.'
        : 'The save could not be confirmed. Your draft is kept. Try Send to Ares again with the same words. Retries will not create a second idea.');
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
      this.voiceAvailable = history.voiceAvailable;
      this.renderHistory(); this.updateVoice();
    } catch {
      if (this.disposed) return;
      this.el('[data-history-notice]').textContent = 'Could not refresh saved ideas. Older statuses may be out of date. You can still write your idea and try refreshing again.';
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
    this.disposed = true; this.abort.abort(); this.transcription?.abort(); this.recorder.dispose(); this.clearAudio();
  }
}
