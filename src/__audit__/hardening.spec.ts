import { describe, expect, it, vi } from "vitest";
import { Scheduler } from "../game/engine/scheduler";
import { createInitialGameState } from "../game/model";
import {
  loadSnapshot,
  saveSnapshot,
  type KeyValueStore,
} from "../game/save";
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

describe("additional production-correctness hardening", () => {
  it("R5 · scheduler preserves a one-hour stall as bounded backlog", () => {
    const calls: Array<{ currentTime: number; deltaMs: number }> = [];
    const scheduler = new Scheduler((input) => calls.push(input), 1_000);
    const internal = scheduler as unknown as {
      lastTickTime: number;
      onInterval(): void;
    };

    internal.lastTickTime = 1_000;
    vi.spyOn(Date, "now").mockReturnValue(3_601_000);

    for (let index = 0; index < 60; index += 1) {
      internal.onInterval();
    }

    expect(calls).toHaveLength(60);
    expect(calls.every((call) => call.deltaMs === 60_000)).toBe(true);
    expect(calls[0]).toEqual({ currentTime: 61_000, deltaMs: 60_000 });
    expect(calls.at(-1)).toEqual({
      currentTime: 3_601_000,
      deltaMs: 60_000,
    });

    vi.restoreAllMocks();
  });

  it("B-08 · persistent device outage cannot roll back on next launch", async () => {
    const deviceBacking = new Map<string, string>();
    const prefs = new MapStore();
    let failDevice = false;

    const port: TelegramDeviceStoragePort = {
      getItem(key, callback) {
        if (failDevice) callback("device unavailable");
        else callback(null, deviceBacking.get(key) ?? null);
        return port;
      },
      setItem(key, value, callback) {
        if (failDevice) callback?.("device unavailable", false);
        else {
          deviceBacking.set(key, value);
          callback?.(null, true);
        }
        return port;
      },
    };

    const firstLaunch = createPlatformStorage({
      native: false,
      telegramDeviceStorage: port,
      preferences: prefs,
      failureCooldownMs: 0,
      deviceTimeoutMs: 50,
    });

    await firstLaunch.set("save", "gen-1");
    failDevice = true;
    await firstLaunch.set("save", "gen-2");
    failDevice = false;

    const secondLaunch = createPlatformStorage({
      native: false,
      telegramDeviceStorage: port,
      preferences: prefs,
      failureCooldownMs: 0,
      deviceTimeoutMs: 50,
    });

    expect(await secondLaunch.get("save")).toBe("gen-2");
  });

  it("E-2 · queued save snapshots state at call time", async () => {
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let blockFirstSet = true;
    const backing = new MapStore();
    const store: KeyValueStore = {
      get: (key) => backing.get(key),
      async set(key, value) {
        if (blockFirstSet) {
          blockFirstSet = false;
          await gate;
        }
        await backing.set(key, value);
      },
    };

    const first = createInitialGameState(0, 1);
    first.resources.capital = 1;
    const second = createInitialGameState(0, 1);
    second.resources.capital = 2;

    const firstSave = saveSnapshot(store, first);
    const secondSave = saveSnapshot(store, second);
    second.resources.capital = 999;

    await Promise.resolve();
    releaseFirst();

    await Promise.all([firstSave, secondSave]);
    expect((await loadSnapshot(store))?.resources.capital).toBe(2);
  });
});
