/**
 * Adapted from ciefa/idle-game-template (MIT), src/game/engine/scheduler.ts.
 * Wall-clock access stays at the boundary; simulation receives delta as data.
 */
export class Scheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTickTime = 0;

  constructor(
    private readonly advance: (input: { currentTime: number; deltaMs: number }) => void,
    private readonly intervalMs = 1000,
  ) {}

  start(): void {
    if (this.intervalId !== null) return;
    this.lastTickTime = Date.now();
    this.intervalId = setInterval(() => this.onInterval(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private onInterval(): void {
    const now = Date.now();
    const deltaMs = Math.max(0, now - this.lastTickTime);
    this.lastTickTime = now;
    this.advance({ currentTime: now, deltaMs });
  }
}
