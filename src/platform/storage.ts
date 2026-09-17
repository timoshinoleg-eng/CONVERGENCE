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
  constructor(private readonly deviceStorage: TelegramDeviceStoragePort) {}

  get(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      try {
        this.deviceStorage.getItem(key, (error, value) => {
          if (error) reject(new Error(error));
          else resolve(typeof value === "string" ? value : null);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  set(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.deviceStorage.setItem(key, value, (error, stored) => {
          if (error || stored === false) reject(new Error(error || "Telegram DeviceStorage write failed"));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

export interface PlatformStorageOptions {
  /** True when running inside a real Capacitor native WebView. */
  native: boolean;
  /** Telegram Bot API 9.0+ DeviceStorage when available. */
  telegramDeviceStorage?: TelegramDeviceStoragePort | null;
  /** Test seam. */
  preferences?: KeyValueStore;
}

interface StorageLayer {
  kind: StorageKind;
  store: KeyValueStore;
}

export function createPlatformStorage(options: PlatformStorageOptions): PlatformStorage {
  const layers: StorageLayer[] = [];

  if (options.telegramDeviceStorage) {
    layers.push({
      kind: "telegram-device",
      store: new TelegramDeviceStore(options.telegramDeviceStorage),
    });
  }

  layers.push({
    kind: options.native ? "capacitor-native" : "web-localstorage",
    store: options.preferences ?? new PreferencesStore(),
  });
  layers.push({ kind: "memory", store: new MemoryStore() });

  let activeIndex = 0;
  const active = (): StorageLayer => layers[activeIndex];
  const degrade = (): boolean => {
    if (activeIndex >= layers.length - 1) return false;
    activeIndex += 1;
    return true;
  };

  return {
    get kind(): StorageKind {
      return active().kind;
    },
    get durable(): boolean {
      return active().kind !== "memory";
    },
    async get(key: string): Promise<string | null> {
      while (true) {
        try {
          return await active().store.get(key);
        } catch {
          if (!degrade()) return null;
        }
      }
    },
    async set(key: string, value: string): Promise<void> {
      while (true) {
        try {
          await active().store.set(key, value);
          return;
        } catch {
          // Retry the SAME write in the next layer. This is essential because
          // saveSnapshot immediately verifies the value it just persisted.
          if (!degrade()) {
            // MemoryStore is the final layer and should not throw, but keep the
            // contract explicit if a custom test store violates that premise.
            throw new Error("No writable persistence layer available");
          }
        }
      }
    },
  };
}
