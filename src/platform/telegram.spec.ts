import { describe, expect, it } from "vitest";
import { createFakeHost, createFakeWebApp, createTestStorage } from "./hostFixture";
import { applyEnvironmentToDocument } from "./dom";
import { asTelegramWebApp, createTelegramAdapter, readTelegramWebApp } from "./telegram";
import type { TelegramWebApp } from "./telegram";

function telegramHost(options: Parameters<typeof createFakeWebApp>[0] = {}, url = "") {
  const { webApp, calls } = createFakeWebApp(options);
  const host = createFakeHost({ hash: url, Telegram: { WebApp: webApp } });
  const detected = readTelegramWebApp(host.window) as TelegramWebApp;
  return { host, calls, webApp: detected, url };
}

describe("Telegram runtime detection", () => {
  it("detects the official WebApp object", () => {
    const { webApp } = telegramHost();
    expect(asTelegramWebApp(webApp)).not.toBeNull();
  });

  it("rejects non-objects, empty namespaces and inert stubs", () => {
    expect(asTelegramWebApp(null)).toBeNull();
    expect(asTelegramWebApp("telegram")).toBeNull();
    expect(asTelegramWebApp({})).toBeNull();
    expect(asTelegramWebApp({ unrelated: true })).toBeNull();
    expect(readTelegramWebApp(createFakeHost().window)).toBeNull();
    expect(readTelegramWebApp(createFakeHost({ Telegram: {} }).window)).toBeNull();
  });

  it("detects a partially initialised WebApp that only exposes ready()", () => {
    expect(asTelegramWebApp({ ready: () => undefined })).not.toBeNull();
  });
});

describe("Telegram adapter", () => {
  it("calls ready() then expand() during ready()", async () => {
    const { host, calls, webApp } = telegramHost();
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });

    await adapter.ready();

    expect(adapter.kind).toBe("telegram");
    expect(calls).toEqual(["ready", "expand"]);
  });

  it("does not request fullscreen unless explicitly enabled", async () => {
    const { host, calls, webApp } = telegramHost({ withFullscreen: true });
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    await adapter.ready();
    expect(calls).not.toContain("requestFullscreen");

    const second = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
      enableFullscreen: true,
    });
    await second.ready();
    expect(calls).toContain("requestFullscreen");
  });

  it("reports version-gated capabilities", () => {
    const { host, webApp } = telegramHost({
      version: "7.10",
      withFullscreen: true,
      withHomeScreen: true,
      versionAtLeast: (v) => Number(v) <= 7.1,
    });
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });

    const capabilities = adapter.getEnvironment().capabilities;
    expect(capabilities.expand).toBe(true);
    expect(capabilities.backButton).toBe(true);
    expect(capabilities.homeScreen).toBe(true);
    expect(capabilities.fullscreen).toBe(false);
    expect(capabilities.isVersionAtLeast("8.0")).toBe(false);
  });

  it("reads viewport, stable viewport and safe-area insets", () => {
    const { host, webApp } = telegramHost({
      viewportHeight: 610,
      viewportStableHeight: 720,
      safeAreaInset: { top: 24, bottom: 8 },
      contentSafeAreaInset: { top: 30, bottom: 12 },
    });
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });

    const environment = adapter.getEnvironment();
    expect(environment.viewport.height).toBe(610);
    expect(environment.viewport.stableHeight).toBe(720);
    // The larger of the two insets wins so content is never clipped.
    expect(environment.safeArea).toEqual({ top: 30, right: 0, bottom: 12, left: 0 });
  });

  it("exposes theme params and colour scheme without restyling the game", () => {
    const { host, webApp } = telegramHost({
      colorScheme: "light",
      themeParams: { bg_color: "#ffffff", header_bg_color: "#eeeeee" },
    });
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });

    const theme = adapter.getEnvironment().theme;
    expect(theme.colorScheme).toBe("light");
    expect(theme.params.bg_color).toBe("#ffffff");
  });

  it("derives a typed launch intent from tgWebAppStartParam", () => {
    const { host, webApp } = telegramHost({}, "#tgWebAppData=x&tgWebAppStartParam=region%3Amoscow");
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    expect(adapter.getEnvironment().launchIntent).toEqual({ type: "region", id: "moscow" });
  });

  it("degrades an unknown start parameter to a default intent", () => {
    const { host, webApp } = telegramHost({}, "#tgWebAppStartParam=grant%3Aautonomy");
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    expect(adapter.getEnvironment().launchIntent).toEqual({
      type: "default",
      reason: "malformed",
    });
  });

  it("shows and hides BackButton with the handler", () => {
    const { host, calls, webApp } = telegramHost();
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });

    let fired = 0;
    adapter.setBackHandler(() => {
      fired += 1;
    });
    expect(calls).toContain("back.show");

    (webApp as unknown as { fire(eventType: string): void }).fire("backButtonClicked");
    expect(fired).toBe(1);

    adapter.setBackHandler(null);
    expect(calls).toContain("back.hide");
    (webApp as unknown as { fire(eventType: string): void }).fire("backButtonClicked");
    expect(fired).toBe(1);
  });

  it("never closes the app when no back handler is registered", () => {
    const { host, calls, webApp } = telegramHost();
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    adapter.setBackHandler(null);
    expect(calls.filter((call) => call === "back.show")).toHaveLength(0);
  });

  it("refreshes environment when Telegram reports viewport or theme changes", () => {
    const { host, webApp } = telegramHost({ viewportStableHeight: 700 });
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    expect(adapter.getEnvironment().viewport.stableHeight).toBe(700);

    (webApp as unknown as { viewportStableHeight: number }).viewportStableHeight = 500;
    (webApp as unknown as { fire(eventType: string): void }).fire("viewportChanged");

    expect(adapter.getEnvironment().viewport.stableHeight).toBe(500);
  });

  it("publishes infrastructure CSS variables only", () => {
    const { host, webApp } = telegramHost({
      safeAreaInset: { bottom: 20 },
      viewportStableHeight: 690,
      themeParams: { bg_color: "#17212b" },
    });
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    applyEnvironmentToDocument(host.document, adapter.getEnvironment());

    expect(host.cssVariables.get("--cv-safe-bottom")).toBe("20px");
    expect(host.cssVariables.get("--cv-viewport-height")).toBe("690px");
    expect(host.cssVariables.get("--cv-page-background")).toBe("#17212b");
    expect(host.dataset.cvPlatform).toBe("telegram");
    expect(host.dataset.cvColorScheme).toBe("dark");
    // The game palette is intentionally not exported to CSS variables.
    expect([...host.cssVariables.keys()].some((key) => key.includes("panel"))).toBe(false);
  });

  it("cleans up host listeners and the back button on dispose", () => {
    const { host, calls, webApp } = telegramHost();
    const adapter = createTelegramAdapter({
      webApp,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    adapter.setBackHandler(() => undefined);
    expect(host.listenerCount("document", "visibilitychange")).toBe(1);
    expect(host.listenerCount("window", "pagehide")).toBe(1);

    adapter.dispose();

    expect(host.listenerCount("document", "visibilitychange")).toBe(0);
    expect(host.listenerCount("window", "pagehide")).toBe(0);
    expect(calls).toContain("back.hide");
  });

  it("boots even when the client API throws", async () => {
    const host = createFakeHost({
      Telegram: {
        WebApp: {
          version: "8.0",
          ready: () => {
            throw new Error("client failure");
          },
          expand: () => {
            throw new Error("client failure");
          },
        },
      },
    });
    const webApp = readTelegramWebApp(host.window);
    const adapter = createTelegramAdapter({
      webApp: webApp!,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    await expect(adapter.ready()).resolves.toBeUndefined();
    expect(adapter.getEnvironment().platform).toBe("telegram");
  });
});
