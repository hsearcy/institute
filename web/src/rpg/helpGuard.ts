/** How long Hint and "I don't know" wait after a new problem appears. A tap
 * meant for the floor or the old banner must not land on them by accident. */
export const HELP_GUARD_MS = 2000;

/** A short lockout on the help buttons. It only adds to `busy`, never replaces it. */
export class HelpGuard {
  private until = 0;

  arm(now: number, ms = HELP_GUARD_MS): void { this.until = now + ms; }

  clear(): void { this.until = 0; }

  active(now: number): boolean { return now < this.until; }

  /** Milliseconds left, for the timer that enables the buttons again. */
  remaining(now: number): number { return Math.max(0, this.until - now); }

  /** A help button is disabled while the game is busy or the guard is on. */
  disables(busy: boolean, now: number): boolean { return busy || this.active(now); }
}
