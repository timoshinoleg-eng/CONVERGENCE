import { describe, expect, it } from "vitest";
import { createBrowserAdapter } from "./browser";
import { createCapacitorAdapter, type CapacitorAppPort } from "./capacitor";
import { createFakeHost, createTestStorage } from "./hostFixture";
import type { LifecyclePhase } from "./types";

describe("standalone browser adapter", () => {
  it("works unchanged when no Telegram API is present", async () => {
    const host = createFakeHost();
    const adapter = createBrowserAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });

    await adapter.ready();

    expect(adapter.kind).toBe("browser");
    expect(adapter.getEnvironment().platform).toBe("browser");
    expect(adapter.getEnvironment().launchIntent).toEqual({ type: "default", reason: "none" });
    expect(adapter.getEnvironment().capabilities).toMatchObject({
      expand: false,
      fullscreen: false,
      backButton: false,
      homeScreen: false,
    });
  });

  it("leaves safe-area insets to CSS env()", () => {
    const host = createFakeHost();
    const adapter = createBrowserAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    expect(adapter.getEnvironment().safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("follows the host colour scheme", () => {
    const host = createFakeHost({
      matchMedia: (query) => ({ matches: query.includes("light") }),
    });
    const adapter = createBrowserAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    expect(adapter.getEnvironment().theme.colorScheme).toBe("light");
  });

  it("maps DOM visibility onto the shared lifecycle", () => {
    const host = createFakeHost();
    const adapter = createBrowserAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    const seen: LifecyclePhase[] = [];
    adapter.onLifecycle((phase) => seen.push(phase));

    host.setVisibility("hidden");
    host.fire("visibilitychange");
    host.setVisibility("visible");
    host.fire("visibilitychange");

    expect(seen).toEqual(["background", "active"]);
  });

  it("does not hijack browser history for the back slot", () => {
    const host = createFakeHost();
    const adapter = createBrowserAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });
    let fired = 0;
    adapter.setBackHandler(() => {
      fired += 1;
    });
    host.fire("pagehide");
    expect(fired).toBe(0);
    expect(host.listenerCount("window", "popstate")).toBe(0);
  });
});

describe("Capacitor adapter", () => {
  interface FakeApp {
    state: boolean;
    port: CapacitorAppPort;
    emitActive(active: boolean): void;
    emitBack(): void;
    appStateListeners(): number;
    backListeners(): number;
  }

  function fakeApp(): FakeApp {
    const stateListeners = new Set<(state: { isActive: boolean }) => void>();
    const backListeners = new Set<() => void>();
    const app: FakeApp = {
      state: true,
      port: {
        addListener(event: "appStateChange" | "backButton", listener: (arg: never) => void) {
          const target = event === "appStateChange" ? stateListeners : backListeners;
          target.add(listener as never);
          return Promise.resolve({
            remove: () => {
              target.delete(listener as never);
              return Promise.resolve();
            },
          });
        },
      } as unknown as CapacitorAppPort,
      emitActive(active: boolean): void {
        app.state = active;
        for (const listener of [...stateListeners]) listener({ isActive: active });
      },
      emitBack(): void {
        for (const listener of [...backListeners]) listener();
      },
      appStateListeners: () => stateListeners.size,
      backListeners: () => backListeners.size,
    };
    return app;
  }

  it("preserves PR #9 Android lifecycle semantics", () => {
    const host = createFakeHost();
    const app = fakeApp();
    const adapter = createCapacitorAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
      app: app.port,
    });

    const seen: LifecyclePhase[] = [];
    adapter.onLifecycle((phase) => seen.push(phase));

    app.emitActive(false);
    app.emitActive(true);

    expect(adapter.kind).toBe("capacitor");
    expect(seen).toEqual(["background", "active"]);
  });

  it("registers the native back listener only while a handler exists", async () => {
    const host = createFakeHost();
    const app = fakeApp();
    const adapter = createCapacitorAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
      app: app.port,
    });

    expect(app.backListeners()).toBe(0);

    let fired = 0;
    adapter.setBackHandler(() => {
      fired += 1;
    });
    await Promise.resolve();

    expect(app.backListeners()).toBe(1);
    app.emitBack();
    expect(fired).toBe(1);

    adapter.setBackHandler(null);
    expect(app.backListeners()).toBe(0);
    app.emitBack();
    expect(fired).toBe(1);
  });

  it("falls back to DOM visibility when the App plugin is unavailable", () => {
    const host = createFakeHost();
    const adapter = createCapacitorAdapter({
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
      app: null,
    });
    const seen: LifecyclePhase[] = [];
    adapter.onLifecycle((phase) => seen.push(phase));

    host.setVisibility("hidden");
    host.fire("visibilitychange");

    expect(seen).toEqual(["background"]);
  });
});
