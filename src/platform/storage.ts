/**
 * Storage resolution for the platform boundary.
 *
 * The game core knows only `KeyValueStore`. Platform-specific persistence is
 * selected here and can degrade without changing the save format.
 *
 * Telegram beta order:
 *   Bot API 9.0+ DeviceStorage -> Capacitor Preferences web fallback -> memory.
 *
 * Browser:
 *   Capacitor Preferences web fallback -> memory.
 *
 * Capacitor Android:
 *   native Preferences -> memory.
 */

import { Preferences } from "@capacitor/preferences";
import type { KeyValueStore } from "../game/save";
import type { PlatformStorage, StorageKind } from "./types";

export class PreferencesStore implements KeyValueStore {
  async get(key: string): Promise<string | null> {
    return (await Preferences.get({ key })).value;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }
}

export class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

/** Structural subset of Telegram Bot API 9.0+ WebApp.DeviceStorage. */
export interface TelegramDeviceStoragePort {
  getItem(
    key: string,
    callback: (error: string | null, value?: string | null) => void,
  ): unknown;
  setItem(
    key: string,
    value: string,
    callback?: (error: string | null, stored?: boolean) => void,
  ): unknown;
}

export class TelegramDeviceStore implements KeyValueStore {
  /** E-1: a callback that is never invoked must not hang the caller forever. */
  constructor(
    private readonly deviceStorage: TelegramDeviceStoragePort,
    private readonly timeoutMs = 3_000,
  ) {}

  get(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(
        () => settle(() => reject(new Error("Telegram DeviceStorage get timed out"))),
        this.timeoutMs,
      );
      timer.unref?.();
      try {
        this.deviceStorage.getItem(key, (error, value) => {
          settle(() => {
            if (error) reject(new Error(error));
            else resolve(typeof value === "string" ? value : null);
          });
        });
      } catch (error) {
        settle(() => reject(error));
      }
    });
  }

  set(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(
        () => settle(() => reject(new Error("Telegram DeviceStorage set timed out"))),
        this.timeoutMs,
      );
      timer.unref?.();
      try {
        this.deviceStorage.setItem(key, value, (error, stored) => {
          settle(() => {
            if (error || stored === false) reject(new Error(error || "Telegram DeviceStorage write failed"));
            else resolve();
          });
        });
      } catch (error) {
        settle(() => reject(error));
      }
    });
  }
}

export interface PlatformStorageOptions {
  native: boolean;
  telegramDeviceStorage?: TelegramDeviceStoragePort | null;
  preferences?: KeyValueStore;
  /**
   * B-08: how long a layer stays quarantined after one failure before it is
   * retried. Previously the fallback was permanent for the whole page life.
   */
  failureCooldownMs?: number;
  /** E-1: Telegram DeviceStorage callback timeout. */
  deviceTimeoutMs?: number;
}

interface StorageLayer {
  kind: StorageKind;
  store: KeyValueStore;
}

interface LayerRead {
  index: number;
  value: string | null;
  revision: number;
  legacyGeneration: number;
  legacySavedAt: number;
}

const REVISION_PREFIX = "__cv_storage_revision__:";

function revisionKey(key: string): string {
  return `${REVISION_PREFIX}${key}`;
}

function parseRevision(raw: string | null): number {
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function legacyFreshness(value: string | null): {
  generation: number;
  savedAt: number;
} {
  if (value === null) return { generation: 0, savedAt: 0 };
  try {
    const parsed = JSON.parse(value) as {
      generation?: unknown;
      savedAt?: unknown;
    };
    return {
      generation:
        typeof parsed.generation === "number"
        && Number.isFinite(parsed.generation)
          ? parsed.generation
          : 0,
      savedAt:
        typeof parsed.savedAt === "number"
        && Number.isFinite(parsed.savedAt)
          ? parsed.savedAt
          : 0,
    };
  } catch {
    return { generation: 0, savedAt: 0 };
  }
}

export function createPlatformStorage(options: PlatformStorageOptions): PlatformStorage {
  const layers: StorageLayer[] = [];

  if (options.telegramDeviceStorage) {
    layers.push({
      kind: "telegram-device",
      store: new TelegramDeviceStore(
        options.telegramDeviceStorage,
        options.deviceTimeoutMs ?? 3_000,
      ),
    });
  }

  layers.push({
    kind: options.native ? "capacitor-native" : "web-localstorage",
    store: options.preferences ?? new PreferencesStore(),
  });
  layers.push({ kind: "memory", store: new MemoryStore() });

  const cooldownMs = options.failureCooldownMs ?? 5_000;
  const failureAt: number[] = layers.map(() => Number.NEGATIVE_INFINITY);
  const revisionCache = new Map<string, number>();
  let activeIndex = 0;
  let queue: Promise<void> = Promise.resolve();

  const quarantined = (index: number): boolean =>
    Date.now() - failureAt[index]! < cooldownMs;

  const markFailure = (index: number): void => {
    failureAt[index] = Date.now();
  };

  const markHealthy = (index: number): void => {
    failureAt[index] = Number.NEGATIVE_INFINITY;
  };

  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const run = queue.then(operation, operation);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function readLayer(index: number, key: string): Promise<LayerRead | null> {
    if (quarantined(index)) return null;
    try {
      const value = await layers[index]!.store.get(key);
      const revision = parseRevision(
        await layers[index]!.store.get(revisionKey(key)),
      );
      markHealthy(index);
      const legacy = legacyFreshness(value);
      return {
        index,
        value,
        revision,
        legacyGeneration: legacy.generation,
        legacySavedAt: legacy.savedAt,
      };
    } catch {
      markFailure(index);
      return null;
    }
  }

  async function readAll(key: string): Promise<LayerRead[]> {
    const reads: LayerRead[] = [];
    for (let index = 0; index < layers.length; index += 1) {
      const read = await readLayer(index, key);
      if (read) reads.push(read);
    }
    return reads;
  }

  function pickNewest(reads: readonly LayerRead[]): LayerRead | null {
    const candidates = reads.filter((entry) => entry.value !== null);
    candidates.sort(
      (left, right) =>
        right.revision - left.revision
        || right.legacyGeneration - left.legacyGeneration
        || right.legacySavedAt - left.legacySavedAt
        || left.index - right.index,
    );
    return candidates[0] ?? null;
  }

  async function writeLayer(
    index: number,
    key: string,
    value: string,
    revision: number,
  ): Promise<void> {
    await layers[index]!.store.set(key, value);
    await layers[index]!.store.set(revisionKey(key), String(revision));
    markHealthy(index);
  }

  async function repairFromWinner(
    key: string,
    winner: LayerRead,
    reads: readonly LayerRead[],
  ): Promise<void> {
    if (winner.value === null) return;
    const byIndex = new Map(reads.map((entry) => [entry.index, entry]));
    for (let index = 0; index < layers.length; index += 1) {
      if (index === winner.index || quarantined(index)) continue;
      const current = byIndex.get(index);
      if (
        current
        && current.value !== null
        && current.revision === winner.revision
        && current.legacyGeneration === winner.legacyGeneration
        && current.legacySavedAt === winner.legacySavedAt
      ) {
        continue;
      }
      try {
        await writeLayer(
          index,
          key,
          winner.value,
          winner.revision,
        );
      } catch {
        markFailure(index);
      }
    }
  }

  async function getInternal(key: string): Promise<string | null> {
    const reads = await readAll(key);
    const winner = pickNewest(reads);
    if (!winner) {
      const firstHealthy = reads[0];
      if (firstHealthy) activeIndex = firstHealthy.index;
      return null;
    }

    activeIndex = winner.index;
    revisionCache.set(key, winner.revision);
    await repairFromWinner(key, winner, reads);
    return winner.value;
  }

  async function currentRevision(key: string): Promise<number> {
    const cached = revisionCache.get(key);
    if (cached !== undefined) return cached;

    const reads = await readAll(key);
    const maxRevision = reads.reduce(
      (maximum, entry) => Math.max(maximum, entry.revision),
      0,
    );
    revisionCache.set(key, maxRevision);
    return maxRevision;
  }

  async function setInternal(key: string, value: string): Promise<void> {
    const revision = (await currentRevision(key)) + 1;
    let primaryIndex: number | null = null;
    const failedHigher: number[] = [];

    for (let index = 0; index < layers.length; index += 1) {
      if (quarantined(index) && index < layers.length - 1) {
        failedHigher.push(index);
        continue;
      }
      try {
        await writeLayer(index, key, value, revision);
        if (primaryIndex === null) primaryIndex = index;
      } catch {
        markFailure(index);
        if (primaryIndex === null) failedHigher.push(index);
      }
    }

    if (primaryIndex === null) {
      throw new Error("No writable persistence layer available");
    }

    // Retry skipped higher-priority layers once immediately. This preserves the
    // fast repair behaviour for one-shot bridge failures while the revision
    // sidecar still protects the next launch when the outage lasts longer.
    for (const index of failedHigher) {
      if (index >= primaryIndex) continue;
      try {
        await writeLayer(index, key, value, revision);
      } catch {
        markFailure(index);
      }
    }

    activeIndex = primaryIndex;
    revisionCache.set(key, revision);
  }

  return {
    get kind(): StorageKind {
      return layers[activeIndex]!.kind;
    },
    get durable(): boolean {
      return layers[activeIndex]!.kind !== "memory";
    },
    get(key: string): Promise<string | null> {
      return serialized(() => getInternal(key));
    },
    set(key: string, value: string): Promise<void> {
      return serialized(() => setInternal(key, value));
    },
  };
}
