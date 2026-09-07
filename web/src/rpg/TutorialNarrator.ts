type Narration = {
  controller: AbortController;
  audio?: HTMLAudioElement;
  url?: string;
  utterance?: SpeechSynthesisUtterance;
  finish: (spoken: boolean) => void;
};

/** Owns only the tour voice, so a late response cannot read a previous page. */
export class TutorialNarrator {
  private active?: Narration;
  private disposed = false;

  constructor(private readonly api: string) {}

  /** Resolves after speech ends; false means unavailable or explicitly stopped. */
  speak(text: string): Promise<boolean> {
    this.stop();
    if (this.disposed || !text.trim()) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      const run: Narration = { controller: new AbortController(), finish: () => {} };
      let finished = false;
      run.finish = spoken => {
        if (finished) return;
        finished = true;
        if (this.active === run) this.active = undefined;
        this.releaseAudio(run);
        if (run.utterance) {
          run.utterance.onend = null; run.utterance.onerror = null;
          run.utterance = undefined;
          // Only cancel the browser queue when this narrator owns an utterance.
          window.speechSynthesis?.cancel();
        }
        resolve(spoken);
      };
      this.active = run;
      void this.requestVoice(run, text);
    });
  }

  stop(): void {
    const run = this.active;
    if (!run) return;
    this.active = undefined;
    run.controller.abort();
    run.finish(false);
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private releaseAudio(run: Narration): void {
    if (run.audio) {
      run.audio.onended = null; run.audio.onerror = null; run.audio.onpause = null;
      run.audio.pause();
      run.audio.removeAttribute('src');
      run.audio.load();
      run.audio = undefined;
    }
    if (run.url) { URL.revokeObjectURL(run.url); run.url = undefined; }
  }

  private async requestVoice(run: Narration, text: string): Promise<void> {
    try {
      const response = await fetch(`${this.api.replace(/\/$/, '')}/tts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), signal: run.controller.signal,
      });
      if (!response.ok) throw new Error('Tutor voice unavailable');
      const bytes = await response.arrayBuffer();
      if (this.active !== run) return;
      run.url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      const audio = run.audio = new Audio(run.url);
      audio.onended = () => run.finish(true);
      audio.onerror = () => this.browserVoice(run, text);
      audio.onpause = () => run.finish(false);
      await audio.play();
    } catch {
      if (this.active === run) this.browserVoice(run, text);
    }
  }

  private browserVoice(run: Narration, text: string): void {
    if (this.active !== run || run.utterance) return;
    this.releaseAudio(run);
    try {
      const synthesis = window.speechSynthesis;
      const voices = synthesis?.getVoices() ?? [];
      const voice = voices.find(voice => /^en[-_]US$/i.test(voice.lang))
        ?? voices.find(voice => /^en\b/i.test(voice.lang));
      if (!synthesis || !voice || typeof SpeechSynthesisUtterance === 'undefined') {
        run.finish(false); return;
      }
      const utterance = run.utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = .9;
      utterance.onend = () => run.finish(true);
      utterance.onerror = () => run.finish(false);
      synthesis.speak(utterance);
    } catch { run.finish(false); }
  }
}
