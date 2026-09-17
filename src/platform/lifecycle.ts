/**
 * One conceptual lifecycle state machine, shared by every runtime.
 *
 *    active  <->  background  ->  dispose
 *
 * Why this exists
 *
 * Telegram has no official "app went to background" event. The WebView only
 * reports DOM visibility (`visibilitychange` / `pagehide`), while Capacitor
 * reports native `appStateChange`. Both sources are noisy and can fire more
 * than once for a single user gesture (sheet drag, transient focus loss,
 * split-screen resize).
 *
 * This controller is the single place that collapses that noise into one
 * de-duplicated stream, so the store can never run two offline catch-ups for
 * one background/return cycle.
 *
 * It is intentionally NOT a second game state machine: it owns one enum and
 * forwards transitions. `GameState` remains the only source of truth for game
 * state; the scheduler/pause/catch-up decisions stay in the Pinia projection.
 */

import type { LifecyclePhase } from "./types";

export interface LifecycleHooks {
  /** Current host-visible state, read fresh on demand. */
  readVisibility(): boolean;
  onVisibilityChange(listener: () => void): () => void;
  onDispose(listener: () => void): () => void;
}

export interface LifecycleController {
  current(): LifecyclePhase;
  subscribe(listener: (phase: LifecyclePhase) => void): () => void;
  /**
   * Emits only real transitions. Repeating the current phase is a no-op and
   * returns `false`. `dispose` is terminal: nothing is emitted afterwards.
   */
  transition(next: LifecyclePhase): boolean;
  dispose(): void;
}

export function createLifecycleController(hooks: LifecycleHooks): LifecycleController {
  let phase: LifecyclePhase = hooks.readVisibility() ? "active" : "background";
  const listeners = new Set<(phase: LifecyclePhase) => void>();
  const hostUnsubscribes: Array<() => void> = [];
  let disposed = false;

  function emit(next: LifecyclePhase): boolean {
    if (disposed) return false;
    if (next === phase) return false;
    phase = next;
    for (const listener of [...listeners]) listener(next);
    if (next === "dispose") {
      disposed = true;
      detachHost();
    }
    return true;
  }

  function detachHost(): void {
    while (hostUnsubscribes.length > 0) hostUnsubscribes.pop()?.();
  }

  hostUnsubscribes.push(
    hooks.onVisibilityChange(() => {
      emit(hooks.readVisibility() ? "active" : "background");
    }),
  );
  hostUnsubscribes.push(hooks.onDispose(() => emit("dispose")));

  return {
    current: () => phase,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    transition: emit,
    dispose() {
      emit("dispose");
      detachHost();
      listeners.clear();
    },
  };
}

/** Tiny helper for binding/unbinding a host event with the same signature. */
export function bindHostEvent(
  target: {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  },
  type: string,
  listener: () => void,
): () => void {
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}
