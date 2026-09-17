/**
 * Storage resolution for the platform boundary.
 *
 * The core save system (`src/game/save.ts`) only knows the `KeyValueStore`
 * contract. Which concrete store backs it is a platform decision, made here.
 *
 * Decision for the Telegram beta: keep ONE store implementation family
 * (Capacitor Preferences) for all three runtimes.
 *
 *   - Capacitor/Android -> native Preferences (SharedPreferences), unchanged.
 *   - browser           -> Capacitor Preferences web fallback = localStorage.
 *   - Telegram WebView  -> same web fallback, therefore the same localStorage.
 *
 * Keeping browser and Telegram on the identical key space is deliberate: it
 * avoids three divergent save paths and it means this PR cannot regress any
 * existing web/APK save. A cloud save is NOT implemented; the `KeyValueStore`
 * seam is the place where it would later be added.
 *
 * If the host storage throws (private mode, blocked WebView storage, quota),
 * the adapter degrades to an in-memory store instead of crashing, and reports
 * `durable: false` so the UI can warn the player.
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

export interface PlatformStorageOptions {
  /** True when running inside a real Capacitor native WebView. */
  native: boolean;
}

export function createPlatformStorage(options: PlatformStorageOptions): PlatformStorage {
  const baseKind: StorageKind = options.native ? "capacitor-native" : "web-localstorage";
  const primary: KeyValueStore = new PreferencesStore();
  let fallback: MemoryStore | null = null;

  const active = (): KeyValueStore => fallback ?? primary;

  return {
    get kind(): StorageKind {
      return fallback ? "memory" : baseKind;
    },
    get durable(): boolean {
      return fallback === null;
    },
    async get(key: string): Promise<string | null> {
      try {
        return await active().get(key);
      } catch {
        fallback = fallback ?? new MemoryStore();
        return null;
      }
    },
    async set(key: string, value: string): Promise<void> {
      try {
        await active().set(key, value);
      } catch {
        // Losing a write is preferable to losing the session; `durable`
        // becomes false so the player is told the save will not survive.
        fallback = fallback ?? new MemoryStore();
      }
    },
  };
}
