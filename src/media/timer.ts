/**
 * Pure timer helper.
 *
 * Components need a reliable way to advance a countdown that survives
 * `requestAnimationFrame` quirks, remounts and prop changes. This helper
 * exposes a tiny state machine that callers drive with `tick(now)`.
 */

export type TimerState =
  | { kind: "idle" }
  | { kind: "running"; startTime: number; lastTick: number }
  | { kind: "finished"; finishedAt: number };

export interface TimerControllerOptions {
  readonly durationMs: number;
  readonly now?: () => number;
}

export class TimerController {
  private readonly durationMs: number;
  private readonly now: () => number;
  private state: TimerState = { kind: "idle" };

  constructor(options: TimerControllerOptions) {
    this.durationMs = Math.max(0, options.durationMs);
    this.now = options.now ?? (() => Date.now());
  }

  reset(): void {
    this.state = { kind: "idle" };
  }

  start(): void {
    const now = this.now();
    this.state = { kind: "running", startTime: now, lastTick: now };
  }

  /**
   * Advance the timer. Returns the elapsed ms, or `null` if the timer is
   * idle. When elapsed >= duration, state flips to `finished`.
   */
  tick(): number | null {
    if (this.state.kind !== "running") return null;
    const now = this.now();
    const elapsed = Math.max(0, now - this.state.startTime);
    this.state = { kind: "running", startTime: this.state.startTime, lastTick: now };
    if (elapsed >= this.durationMs) {
      this.state = { kind: "finished", finishedAt: now };
      return elapsed;
    }
    return elapsed;
  }

  isFinished(): boolean {
    return this.state.kind === "finished";
  }

  isRunning(): boolean {
    return this.state.kind === "running";
  }

  /** Remaining ms until finish; 0 if finished; `durationMs` if idle. */
  remainingMs(): number {
    if (this.state.kind === "finished") return 0;
    if (this.state.kind === "idle") return this.durationMs;
    const elapsed = Math.max(0, this.now() - this.state.startTime);
    return Math.max(0, this.durationMs - elapsed);
  }

  /** Elapsed ms; 0 when idle or finished. */
  elapsedMs(): number {
    if (this.state.kind === "idle") return 0;
    if (this.state.kind === "finished") return this.durationMs;
    return Math.max(0, this.now() - this.state.startTime);
  }
}
