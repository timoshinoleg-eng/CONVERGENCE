import { describe, expect, it } from "vitest";
import { createPlatformAdapter } from "./index";
import { createFakeHost, createFakeWebApp, createTestStorage } from "./hostFixture";
import { createTelegramAdapter, readTelegramWebApp, type TelegramWebApp } from "./telegram";
import type { LifecyclePhase } from "./types";

describe("current Telegram Mini App API integration", () => {
  it("does not classify a standalone browser as Telegram just because the bridge exists", () => {
    const host = createFakeHost({
      Telegram: {
        WebApp: {
          version: "9.0",
          platform: "unknown",
          initData: "",
          ready: () => undefined,
          expand: () => undefined,
        },
      },
    });

    expect(readTelegramWebApp(host.window)).toBeNull();
    expect(createPlatformAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      native: false,
      storage: createTestStorage(),
    }).kind).toBe("browser");
  });

  it("uses official activated/deactivated events as lifecycle input", () => {
    const { webApp: rawWebApp } = createFakeWebApp();
    const host = createFakeHost({ Telegram: { WebApp: rawWebApp } });
    const webApp = readTelegramWebApp(host.window) as TelegramWebApp;
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    const seen: LifecyclePhase[] = [];
    adapter.onLifecycle((phase) => seen.push(phase));

    (webApp as unknown as { fire(eventType: string): void }).fire("deactivated");
    (webApp as unknown as { fire(eventType: string): void }).fire("activated");

    expect(seen).toEqual(["background", "active"]);
  });

  it("republishes CSS metrics after Telegram safe-area changes", () => {
    const { webApp: rawWebApp } = createFakeWebApp({ safeAreaInset: { bottom: 8 } });
    const host = createFakeHost({ Telegram: { WebApp: rawWebApp } });
    const webApp = readTelegramWebApp(host.window) as TelegramWebApp;
    createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });

    (webApp.safeAreaInset as { bottom?: number }).bottom = 34;
    (webApp as unknown as { fire(eventType: string): void }).fire("safeAreaChanged");

    expect(host.cssVariables.get("--cv-safe-bottom")).toBe("34px");
  });

  it("selects Telegram DeviceStorage at the platform boundary", async () => {
    const values = new Map<string, string>();
    const { webApp } = createFakeWebApp({ version: "9.0" });
    (webApp as Record<string, unknown>).DeviceStorage = {
      getItem(key: string, callback: (error: string | null, value?: string | null) => void) {
        callback(null, values.get(key) ?? null);
      },
      setItem(
        key: string,
        value: string,
        callback?: (error: string | null, stored?: boolean) => void,
      ) {
        values.set(key, value);
        callback?.(null, true);
      },
    };
    const host = createFakeHost({ Telegram: { WebApp: webApp } });
    const adapter = createPlatformAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      native: false,
    });

    await adapter.storage.set("probe", "ok");
    expect(adapter.storage.kind).toBe("telegram-device");
    expect(await adapter.storage.get("probe")).toBe("ok");
  });
});
