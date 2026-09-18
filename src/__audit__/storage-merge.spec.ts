import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/model";
import { loadSnapshot, serializeSave, type KeyValueStore } from "../game/save";
import {
  createPlatformStorage,
  type TelegramDeviceStoragePort,
} from "../platform/storage";

class MapStore implements KeyValueStore {
  constructor(readonly values = new Map<string, string>()) {}
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe("R16 · cross-layer save reconciliation", () => {
  it("loads the newest generation and repairs stale DeviceStorage", async () => {
    const deviceValues = new Map<string, string>();
    const preferenceValues = new Map<string, string>();
    const stale = createInitialGameState(1_000, 7);
    stale.resources.capital = 30;
    const fresh = createInitialGameState(1_000, 7);
    fresh.resources.capital = 80;

    deviceValues.set("convergence.save.a", serializeSave(stale, 3, 3_000));
    preferenceValues.set("convergence.save.a", serializeSave(fresh, 8, 8_000));

    const device: TelegramDeviceStoragePort = {
      getItem(key, callback) {
        callback(null, deviceValues.get(key) ?? null);
      },
      setItem(key, value, callback) {
        deviceValues.set(key, value);
        callback?.(null, true);
      },
    };
    const storage = createPlatformStorage({
      native: false,
      telegramDeviceStorage: device,
      preferences: new MapStore(preferenceValues),
      failureCooldownMs: 0,
    });

    const restored = await loadSnapshot(storage);

    expect(restored?.resources.capital).toBe(80);
    const repaired = deviceValues.get("convergence.save.a");
    expect(repaired).toBe(preferenceValues.get("convergence.save.a"));
  });
});
