/**
 * One conceptual lifecycle controller shared by Telegram, browser and Capacitor.
 *
 *    active  <->  background  ->  dispose
 *
 * Host adapters decide which native/web events feed this controller. The
 * controller only de-duplicates transitions and exposes one current phase; it
 * is not a second gameplay state machine.
 */

import type { LifecyclePhase } from "./types";

export interface LifecycleHooks {
  readVisibility(): boolean;
  onVisibilityChange(listener: () => void): () => void;
  onDispose(listener: () => void): () => void;
}

export interface LifecycleController {
  current(): LifecyclePhase;
  /** Subscribing immediately reports the current phase, then future transitions. */
  subscribe(listener: (phase: LifecyclePhase) => void): () => void;
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
      // A late subscriber must learn that the host is already backgrounded;
      // otherwise App.vue could start the scheduler while a Mini App is
      // minimized during boot.
      listener(phase);
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
