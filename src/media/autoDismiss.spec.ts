import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutoDismiss } from "./autoDismiss";

describe("createAutoDismiss", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("arms a setTimeout for `auto` mode and fires onDismiss at duration", () => {
    const onDismiss = vi.fn();
    const ctrl = createAutoDismiss({
      durationMs: 5_000,
      dismissMode: "auto",
      onDismiss,
    });
    ctrl.start();
    expect(ctrl.isRunning()).toBe(true);
    vi.advanceTimersByTime(4_999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(ctrl.isRunning()).toBe(false);
  });

  it("does NOT arm a timer for `tap` mode", () => {
    const onDismiss = vi.fn();
    const ctrl = createAutoDismiss({
      durationMs: 5_000,
      dismissMode: "tap",
      onDismiss,
    });
    ctrl.start();
    expect(ctrl.isRunning()).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("stop() cancels a pending timer", () => {
    const onDismiss = vi.fn();
    const ctrl = createAutoDismiss({
      durationMs: 5_000,
      dismissMode: "auto",
      onDismiss,
    });
    ctrl.start();
    ctrl.stop();
    expect(ctrl.isRunning()).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("start() restarts the timer when called twice (typical: insert identity change)", () => {
    const onDismiss = vi.fn();
    const ctrl = createAutoDismiss({
      durationMs: 5_000,
      dismissMode: "auto",
      onDismiss,
    });
    ctrl.start();
    vi.advanceTimersByTime(2_000);
    ctrl.start(); // restart
    vi.advanceTimersByTime(4_000); // 6s after first start, but only 4s after restart
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_001); // 5.001s after restart
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("handles a zero / negative duration by firing on the next tick", () => {
    const onDismiss = vi.fn();
    const ctrl = createAutoDismiss({
      durationMs: 0,
      dismissMode: "auto",
      onDismiss,
    });
    ctrl.start();
    vi.advanceTimersByTime(0);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
