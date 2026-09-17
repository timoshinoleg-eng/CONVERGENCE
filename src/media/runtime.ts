/**
 * Media runtime — owns the queue, dedupe, cooldown and dismissed state.
 *
 * The runtime is presentation-only. It receives `MediaRequest`s from the
 * trigger layer, consults the `MediaInsert` registry, and exposes the head
 * of the queue for the Vue layer to render. It never mutates `GameState`.
 *
 * Dependencies are injected:
 *   - `resolveInsert` looks up the canonical `MediaInsert` for an id. The
 *     production default reads from `manifest.ts`; tests substitute their
 *     own resolver so they can exercise the runtime without polluting the
 *     shipping manifest.
 *
 * Persistence stays outside this class. The Pinia adapter observes a
 * production-origin dismiss and forwards the resulting dismissed state to
 * the ordered best-effort persistence queue.
 *
 * Cooldown semantics: `snoozedUntil` is computed from the moment the
 * insert was actually shown (this.now() inside `markSeen`), not from
 * `request.at` (the moment the game event fired).
 *
 * Origin semantics: every queue entry carries `origin: "production" |
 * "preview"`. Only `production` dismisses update `dismissed`. The single
 * `dismiss()` method picks the right behaviour so Vue components and the
 * DEV replay panel share one path.
 */

import type {
  MediaDismissedState,
  MediaInsert,
  MediaRequest,
  MediaSeverity,
  MediaTier,
} from "./types";
import { createEmptyDismissedState, dedupeKeyFor } from "./types";

export type QueueEntryOrigin = "production" | "preview";

export interface QueueEntry {
  readonly insert: MediaInsert;
  readonly request: MediaRequest;
  /** Stable key used for dedupe + cooldown lookup inside the runtime. */
  readonly dedupeKey: string;
  /** Production entries mutate dismissed state; preview entries never do. */
  readonly origin: QueueEntryOrigin;
}

export type InsertResolver = (id: string) => MediaInsert | undefined;

export interface RuntimeOptions {
  readonly tier: MediaTier;
  readonly prefersReducedMotion: boolean;
  readonly now?: () => number;
  readonly resolveInsert: InsertResolver;
}

const SEVERITY_RANK: Readonly<Record<MediaSeverity, number>> = {
  ambient: 0,
  signal: 1,
  incident: 2,
  critical: 3,
};

export class MediaRuntime {
  private readonly now: () => number;
  private readonly resolveInsert: InsertResolver;
  private tier: MediaTier;
  private prefersReducedMotion: boolean;
  private readonly queue: QueueEntry[] = [];
  private dismissed: MediaDismissedState = createEmptyDismissedState();

  constructor(options: RuntimeOptions) {
    this.now = options.now ?? (() => Date.now());
    this.resolveInsert = options.resolveInsert;
    this.tier = options.tier;
    this.prefersReducedMotion = options.prefersReducedMotion;
  }

  setDismissedState(state: MediaDismissedState): void {
    this.dismissed = state;
  }

  getDismissedState(): MediaDismissedState {
    return this.dismissed;
  }

  setTier(tier: MediaTier): void {
    this.tier = tier;
    if (tier === "off") this.queue.length = 0;
  }

  getTier(): MediaTier {
    return this.tier;
  }

  setPrefersReducedMotion(value: boolean): void {
    this.prefersReducedMotion = value;
  }

  getPrefersReducedMotion(): boolean {
    return this.prefersReducedMotion;
  }

  /**
   * Enqueue a batch of requests. Applies all gate rules and dedupes against
   * what's already in the queue. Production origin.
   */
  enqueue(requests: ReadonlyArray<MediaRequest>): void {
    if (this.tier === "off") return;
    for (const request of requests) {
      const insert = this.resolveInsert(request.insertId);
      if (!insert) continue;
      if (!this.shouldPlay(insert, request)) continue;
      const key = dedupeKeyFor(request, insert);
      if (this.hasQueued(key)) continue;
      this.queue.push({ insert, request, dedupeKey: key, origin: "production" });
    }
    this.sortQueue();
  }

  /** Resolve and return the next entry to render. */
  peek(): QueueEntry | null {
    const head = this.queue[0];
    return head ?? null;
  }

  /**
   * Pop the head and act on it. Single dismiss path used by both Vue
   * presentation layers and the DEV replay panel:
   *   - `production` → mark seen, record lastShownAt, start cooldown.
   *   - `preview`    → remove from queue only, dismissed state untouched.
   */
  dismiss(head?: QueueEntry | null): QueueEntry | null {
    const target = head ?? this.peek();
    if (!target) return null;
    // Pinia may expose QueueEntry through a reactive proxy, so reference
    // equality is not a safe identity contract at the Vue boundary.
    const index = this.queue.findIndex((entry) =>
      entry.dedupeKey === target.dedupeKey
      && entry.request.at === target.request.at
      && entry.origin === target.origin,
    );
    if (index < 0) return null;
    const [removed] = this.queue.splice(index, 1);
    if (!removed) return null;
    if (removed.origin === "production") {
      this.markSeen(removed.insert, removed.request);
    }
    return removed;
  }

  /** Clear the queue without touching dismissed state. */
  clearQueue(): void {
    this.queue.length = 0;
  }

  /** Clear queue AND dismissed state. Used by `resetForBeta`. */
  resetState(): void {
    this.queue.length = 0;
    this.dismissed = createEmptyDismissedState();
  }

  /**
   * DEV-only preview path. Pushes a synthetic entry that does NOT
   * pollute dismissed state on dismiss (handled by `dismiss()` reading
   * `origin === "preview"`).
   */
  pushPreview(request: MediaRequest): QueueEntry | null {
    const insert = this.resolveInsert(request.insertId);
    if (!insert) return null;
    const baseKey = dedupeKeyFor(request, insert);
    let key = `__preview__::${baseKey}`;
    let counter = 0;
    while (this.hasQueued(key)) {
      counter += 1;
      key = `__preview__::${baseKey}::${counter}`;
    }
    const entry: QueueEntry = { insert, request, dedupeKey: key, origin: "preview" };
    this.queue.push(entry);
    this.sortQueue();
    return entry;
  }

  /** Number of pending inserts. */
  size(): number {
    return this.queue.length;
  }

  private hasQueued(key: string): boolean {
    return this.queue.some((entry) => entry.dedupeKey === key);
  }

  private shouldPlay(insert: MediaInsert, request: MediaRequest): boolean {
    if (insert.oneShot && this.dismissed.seen.includes(insert.id)) {
      return false;
    }
    if (insert.contextFilter) {
      const context = request.context ?? {};
      if (!insert.contextFilter(context)) return false;
    }
    if (typeof insert.cooldownMs === "number") {
      const key = dedupeKeyFor(request, insert);
      if ((this.dismissed.snoozedUntil[key] ?? 0) > this.now()) {
        return false;
      }
    }
    return true;
  }

  private markSeen(insert: MediaInsert, request: MediaRequest): void {
    const seen = insert.oneShot
      ? Array.from(new Set([...this.dismissed.seen, insert.id]))
      : this.dismissed.seen.slice();
    const shownAt = this.now();
    const lastShownAt: Record<string, number> = {
      ...this.dismissed.lastShownAt,
      [insert.id]: shownAt,
    };
    let snoozedUntil: Record<string, number> = { ...this.dismissed.snoozedUntil };
    if (typeof insert.cooldownMs === "number" && !insert.oneShot) {
      const key = dedupeKeyFor(request, insert);
      snoozedUntil[key] = shownAt + insert.cooldownMs;
    }
    this.dismissed = { seen, lastShownAt, snoozedUntil };
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const rank = SEVERITY_RANK[b.insert.severity] - SEVERITY_RANK[a.insert.severity];
      if (rank !== 0) return rank;
      return a.request.at - b.request.at;
    });
  }
}
