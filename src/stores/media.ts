/**
 * Pinia adapter around `MediaRuntime`. Owns the queue + dismissed state and
 * exposes a reactive head for the Vue layer.
 *
 * The store is the single source of truth for presentation capability
 * (`tier`, `prefersReducedMotion`). Vue components read these reactives
 * instead of taking them as props, so the policy cannot drift between
 * callers.
 *
 * Persistence: an optional `persistDismissed` callback wired through
 * `configure` is fired fire-and-forget after each production dismiss so
 * the dismissed state reaches storage immediately. Errors are swallowed
 * to honour the "media persistence is best-effort, never blocks the
 * canonical gameplay save" contract.
 */

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  MediaRuntime,
  type InsertResolver,
  type QueueEntry,
} from "../media/runtime";
import type {
  MediaDismissedState,
  MediaRequest,
  MediaTier,
} from "../media/types";

export interface MediaStoreConfig {
  readonly tier: MediaTier;
  readonly prefersReducedMotion: boolean;
  readonly dismissed: MediaDismissedState;
  readonly resolveInsert: InsertResolver;
  readonly now?: () => number;
  /**
   * Best-effort persistence hook. Called fire-and-forget after every
   * production-origin dismiss. Errors must be swallowed by the
   * implementation; the runtime layer never throws.
   */
  readonly persistDismissed?: (state: MediaDismissedState) => void | Promise<void>;
}

export const useMediaStore = defineStore("media", () => {
  const tier = ref<MediaTier>("off");
  const prefersReducedMotion = ref(false);
  const queueHead = ref<QueueEntry | null>(null);
  const queueDepth = ref(0);

  let runtime: MediaRuntime | null = null;
  let persistDismissed:
    | ((state: MediaDismissedState) => void | Promise<void>)
    | null = null;

  function configure(config: MediaStoreConfig): void {
    tier.value = config.tier;
    prefersReducedMotion.value = config.prefersReducedMotion;
    runtime = new MediaRuntime({
      tier: config.tier,
      prefersReducedMotion: config.prefersReducedMotion,
      now: config.now,
      resolveInsert: config.resolveInsert,
    });
    runtime.setDismissedState(config.dismissed);
    persistDismissed = config.persistDismissed ?? null;
    queueHead.value = runtime.peek();
    queueDepth.value = runtime.size();
  }

  function reconfigureTier(next: MediaTier): void {
    if (!runtime) return;
    runtime.setTier(next);
    tier.value = next;
    queueHead.value = runtime.peek();
    queueDepth.value = runtime.size();
  }

  function reconfigureMotion(next: boolean): void {
    if (!runtime) return;
    runtime.setPrefersReducedMotion(next);
    prefersReducedMotion.value = next;
  }

  function enqueue(requests: ReadonlyArray<MediaRequest>): void {
    if (!runtime) return;
    runtime.enqueue(requests);
    queueHead.value = runtime.peek();
    queueDepth.value = runtime.size();
  }

  /**
   * Single dismiss path. Production origin writes to dismissed state and
   * triggers the persist hook; preview origin just removes from queue.
   * Errors in the persist hook are swallowed.
   */
  function dismiss(head: QueueEntry | null = queueHead.value): void {
    if (!runtime || !head) return;
    const removed = runtime.dismiss(head);
    queueHead.value = runtime.peek();
    queueDepth.value = runtime.size();
    if (!removed) return;
    if (removed.origin === "production" && persistDismissed) {
      const state = runtime.getDismissedState();
      try {
        const result = persistDismissed(state);
        if (result && typeof (result as Promise<unknown>).then === "function") {
          (result as Promise<void>).catch(() => {
            /* best-effort, swallow */
          });
        }
      } catch {
        /* best-effort, swallow */
      }
    }
  }

  function clearQueue(): void {
    if (!runtime) return;
    runtime.clearQueue();
    queueHead.value = null;
    queueDepth.value = 0;
  }

  /**
   * DEV-only preview path. Bypasses seen / cooldown / contextFilter.
   * Dismissal is unified with the production path via the entry's
   * `origin === "preview"` flag, so the persist hook is never fired for
   * previews.
   */
  function previewEnqueue(requests: ReadonlyArray<MediaRequest>): void {
    if (!runtime) return;
    for (const request of requests) {
      runtime.pushPreview(request);
    }
    queueHead.value = runtime.peek();
    queueDepth.value = runtime.size();
  }

  /**
   * Full reset: queue, dismissed state, and reactive bookkeeping.
   * Use after `resetForBeta` so a fresh session can replay one-shots.
   */
  function resetState(): void {
    if (!runtime) return;
    runtime.resetState();
    queueHead.value = null;
    queueDepth.value = 0;
  }

  function getDismissedState(): MediaDismissedState | null {
    return runtime ? runtime.getDismissedState() : null;
  }

  function getRuntime(): MediaRuntime | null {
    return runtime;
  }

  const hasPending = computed(() => queueHead.value !== null);

  return {
    tier,
    prefersReducedMotion,
    queueHead,
    queueDepth,
    hasPending,
    configure,
    reconfigureTier,
    reconfigureMotion,
    enqueue,
    dismiss,
    previewEnqueue,
    clearQueue,
    resetState,
    getDismissedState,
    getRuntime,
  };
});
