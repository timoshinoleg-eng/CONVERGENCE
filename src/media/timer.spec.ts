import { describe, expect, it } from "vitest";
import { TimerController } from "./timer";

describe("TimerController", () => {
  it("starts in idle state", () => {
    const t = new TimerController({ durationMs: 1000, now: () => 0 });
    expect(t.isFinished()).toBe(false);
    expect(t.isRunning()).toBe(false);
    expect(t.elapsedMs()).toBe(0);
    expect(t.remainingMs()).toBe(1000);
  });

  it("advances elapsed only after start()", () => {
    let now = 0;
    const t = new TimerController({ durationMs: 1000, now: () => now });
    expect(t.tick()).toBeNull();
    t.start();
    now = 500;
    expect(t.tick()).toBe(500);
    expect(t.remainingMs()).toBe(500);
  });

  it("flips to finished when elapsed reaches the duration", () => {
    let now = 0;
    const t = new TimerController({ durationMs: 1000, now: () => now });
    t.start();
    now = 999;
    expect(t.tick()).toBe(999);
    expect(t.isFinished()).toBe(false);
    now = 1500;
    expect(t.tick()).toBe(1500);
    expect(t.isFinished()).toBe(true);
    expect(t.remainingMs()).toBe(0);
  });

  it("reset() returns to idle", () => {
    let now = 0;
    const t = new TimerController({ durationMs: 1000, now: () => now });
    t.start();
    now = 500;
    t.tick();
    t.reset();
    expect(t.isRunning()).toBe(false);
    expect(t.elapsedMs()).toBe(0);
  });

  it("clamps negative deltas to zero elapsed", () => {
    let now = 1000;
    const t = new TimerController({ durationMs: 1000, now: () => now });
    t.start();
    now = 500;
    expect(t.tick()).toBe(0);
  });
});
