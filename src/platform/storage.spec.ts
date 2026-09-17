import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "../game/save";
import {
  createPlatformStorage,
  type TelegramDeviceStoragePort,
} from "./storage";

function memoryPreferences(options: { failGet?: boolean; failSet?: boolean } = {}): KeyValueStore {
  const values = new Map<string, string>();
  return {
    async get(key) {
      if (options.failGet) throw new Error("get failed");
      return values.get(key) ?? null;
    },
    async set(key, value) {
      if (options.failSet) throw new Error("set failed");
      values.set(key, value);
    },
  };
}

function deviceStore(options: { failGet?: boolean; failSet?: boolean } = {}) {
  const values = new Map<string, string>();
  const port: TelegramDeviceStoragePort = {
    getItem(key, callback) {
      if (options.failGet) callback("device get failed");
      else callback(null, values.get(key) ?? null);
      return port;
    },
    setItem(key, value, callback) {
      if (options.failSet) callback?.("device set failed", false);
      else {
        values.set(key, value);
        callback?.(null, true);
      }
      return port;
    },
  };
  return { port, values };
}

describe("platform storage", () => {
  it("prefers Telegram DeviceStorage when available", async () => {
    const device = deviceStore();
    const storage = createPlatformStorage({
      native: false,
      telegramDeviceStorage: device.port,
      preferences: memoryPreferences(),
    });

    await storage.set("save", "telegram");
    expect(await storage.get("save")).toBe("telegram");
    expect(storage.kind).toBe("telegram-device");
    expect(storage.durable).toBe(true);
  });

  it("retries the same failed DeviceStorage write in Preferences", async () => {
    const device = deviceStore({ failSet: true });
    const preferences = memoryPreferences();
    const storage = createPlatformStorage({
      native: false,
      telegramDeviceStorage: device.port,
      preferences,
    });

    await storage.set("save", "fallback-value");
    expect(storage.kind).toBe("web-localstorage");
    expect(await storage.get("save")).toBe("fallback-value");
    expect(storage.durable).toBe(true);
  });

  it("degrades all the way to memory and preserves the failed write", async () => {
    const device = deviceStore({ failSet: true });
    const storage = createPlatformStorage({
      native: false,
      telegramDeviceStorage: device.port,
      preferences: memoryPreferences({ failSet: true }),
    });

    await storage.set("save", "session-value");
    expect(storage.kind).toBe("memory");
    expect(storage.durable).toBe(false);
    expect(await storage.get("save")).toBe("session-value");
  });
});
