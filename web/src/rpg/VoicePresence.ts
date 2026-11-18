type Options = {
  document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  fetch?: (url: string, init: RequestInit) => Promise<unknown>;
  now?: () => number;
  uuid?: () => string;
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (timer: any) => void;
};
const ACTIVITY = ['mousemove', 'mousedown', 'pointermove', 'pointerdown', 'keydown', 'touchstart'];

/** Ephemeral page lease only; independent of player identity and microphone capture. */
export class VoicePresence {
  private readonly document;
  private readonly window;
  private readonly fetch;
  private readonly now;
  private readonly clientId;
  private readonly every;
  private readonly clear: (timer: any) => void;
  private timer: unknown;
  private running = false;
  private away = false;
  private lastActivity = 0;
  private leased = false;
  private request: { active: boolean; controller: AbortController } | null = null;

  constructor(options: Options = {}) {
    this.document = options.document ?? document;
    this.window = options.window ?? window;
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? Date.now;
    this.clientId = (options.uuid ?? (() => crypto.randomUUID()))();
    // Window timers require their native receiver; do not call them as instance methods.
    this.every = options.setInterval ?? ((callback, ms) => setInterval(callback, ms));
    this.clear = options.clearInterval ?? (timer => clearInterval(timer));
  }
  start(): void {
    if (this.running) return;
    this.running = true; this.away = false; this.lastActivity = this.now();
    for (const type of ACTIVITY) this.document.addEventListener(type, this.activity, { passive: true });
    this.document.addEventListener('visibilitychange', this.visibility);
    this.window.addEventListener('pagehide', this.hide);
    this.window.addEventListener('pageshow', this.show);
    this.timer = this.every(() => this.sync(true), 25_000);
    this.sync();
  }
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.clear(this.timer);
    for (const type of ACTIVITY) this.document.removeEventListener(type, this.activity);
    this.document.removeEventListener('visibilitychange', this.visibility);
    this.window.removeEventListener('pagehide', this.hide);
    this.window.removeEventListener('pageshow', this.show);
    this.sync();
  }
  dispose(): void { this.stop(); }
  private activity = (): void => { this.lastActivity = this.now(); this.sync(); };
  private visibility = (): void => {
    if (this.document.visibilityState === 'visible') { this.away = false; this.lastActivity = this.now(); }
    this.sync();
  };
  private hide = (): void => { this.away = true; this.sync(); };
  private show = (): void => { this.away = false; this.lastActivity = this.now(); this.sync(); };
  private active(): boolean {
    return this.running && !this.away && this.document.visibilityState === 'visible' && this.now() - this.lastActivity < 300_000;
  }
  private sync(heartbeat = false): void {
    const active = this.active();
    if (!active && this.request?.active) {
      // Release immediately on navigation, not after a possibly stalled heartbeat.
      this.request.controller.abort(); this.request = null;
    }
    if (this.request || (active ? this.leased && !heartbeat : !this.leased)) return;
    this.leased = active;
    const request = { active, controller: new AbortController() };
    this.request = request;
    let result: Promise<unknown>;
    try {
      result = this.fetch('/rpg/suggestions/voice-presence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.clientId, active }),
        signal: request.controller.signal, keepalive: !active,
      });
    } catch { result = Promise.reject(); }
    void result.catch(() => {}).finally(() => {
      if (this.request !== request) return;
      this.request = null;
      // A visible return waits for its own release; stale completions cannot wake a stopped page.
      if (this.active() !== active) this.sync();
    });
  }
}
