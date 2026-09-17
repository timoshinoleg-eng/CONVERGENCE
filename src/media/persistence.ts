/**
 * Media persistence.
 *
 * The dismissed state lives in its own storage slot so the canonical
 * `schemaVersion: 2` envelope stays untouched. The slot is intentionally
 * minimal: a `seen` array of insert ids plus two lookup maps.
 *
 * The validator is tolerant — corrupted values are filtered, not thrown —
 * but it never accepts arbitrary prototypes and rejects NaN/Infinity numbers.
 */

import type { KeyValueStore } from "../game/save";
import {
  createEmptyDismissedState,
  type MediaDismissedState,
} from "./types";

const MEDIA_SLOT = "convergence.media";

interface SerializedDismissedState {
  seen: string[];
  lastShownAt: Record<string, number>;
  snoozedUntil: Record<string, number>;
}

const SAFE_KEY = /^[a-zA-Z0-9._:-]+$/;
const MAX_KEY_LENGTH = 128;
const MAX_SEEN_LENGTH = 256;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function safeKey(key: unknown): string | null {
  if (typeof key !== "string") return null;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return null;
  if (!SAFE_KEY.test(key)) return null;
  return key;
}

function safeTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function filterMap(
  raw: unknown,
  isKey: (key: unknown) => boolean,
): Record<string, number> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isKey(key)) continue;
    const ts = safeTimestamp(value);
    if (ts === null) continue;
    out[key] = ts;
  }
  return out;
}

function isSafeKey(key: unknown): boolean {
  return safeKey(key) !== null;
}

function filterSeen(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    if (entry.length === 0 || entry.length > MAX_KEY_LENGTH) continue;
    if (!SAFE_KEY.test(entry)) continue;
    seen.add(entry);
    if (seen.size >= MAX_SEEN_LENGTH) break;
  }
  return Array.from(seen);
}

export function parseDismissedState(raw: string | null | undefined): MediaDismissedState {
  if (!raw) return createEmptyDismissedState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createEmptyDismissedState();
  }
  if (!isPlainObject(parsed)) return createEmptyDismissedState();

  return {
    seen: filterSeen(parsed.seen),
    lastShownAt: filterMap(parsed.lastShownAt, isSafeKey),
    snoozedUntil: filterMap(parsed.snoozedUntil, isSafeKey),
  };
}

export async function loadMediaDismissed(
  store: KeyValueStore,
): Promise<MediaDismissedState> {
  const raw = await store.get(MEDIA_SLOT);
  return parseDismissedState(raw);
}

export async function saveMediaDismissed(
  store: KeyValueStore,
  state: MediaDismissedState,
): Promise<void> {
  const payload: SerializedDismissedState = {
    seen: state.seen.slice(),
    lastShownAt: { ...state.lastShownAt },
    snoozedUntil: { ...state.snoozedUntil },
  };
  await store.set(MEDIA_SLOT, JSON.stringify(payload));
}

export interface MediaDismissedPersistenceQueue {
  /**
   * Persist a snapshot after all earlier writes have settled.
   * Never rejects: media history is presentation-only best-effort state.
   */
  persist(state: MediaDismissedState): Promise<void>;
  /** Wait until every queued write has settled. */
  flush(): Promise<void>;
}

/**
 * Serialize media-history writes so an older, slower write can never land
 * after a newer dismiss and roll the presentation history backwards.
 */
export function createMediaDismissedPersistenceQueue(
  store: KeyValueStore,
): MediaDismissedPersistenceQueue {
  let tail: Promise<void> = Promise.resolve();

  function snapshot(state: MediaDismissedState): MediaDismissedState {
    return {
      seen: state.seen.slice(),
      lastShownAt: { ...state.lastShownAt },
      snoozedUntil: { ...state.snoozedUntil },
    };
  }

  return {
    persist(state: MediaDismissedState): Promise<void> {
      const queued = snapshot(state);
      tail = tail
        .then(() => saveMediaDismissed(store, queued))
        .catch(() => {
          /* best-effort: keep the chain alive for the next write */
        });
      return tail;
    },
    flush(): Promise<void> {
      return tail;
    },
  };
}

