/** Adventure power only; the tutor's first-attempt fluency clock stays separate. */
export class AnswerClock {
  private accumulated = 0;
  private startedAt: number | null = null;
  constructor(private readonly now: () => number = () => performance.now()) {}
  restore(elapsedMs: number): void {
    this.accumulated = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    this.startedAt = null;
  }
  elapsed(): number {
    return this.accumulated + (this.startedAt === null ? 0 : Math.max(0, this.now() - this.startedAt));
  }
  start(): void { if (this.startedAt === null) this.startedAt = this.now(); }
  stop(): void { this.accumulated = this.elapsed(); this.startedAt = null; }
}
