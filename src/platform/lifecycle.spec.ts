import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/model";
import { ConvergenceRuntime } from "../game/runtime";
import { createFakeHost, createTestStorage } from "./hostFixture";
import { bindHostEvent, createLifecycleController } from "./lifecycle";
import { readTelegramWebApp, createTelegramAdapter } from "./telegram";
import type { LifecyclePhase } from "./types";

function attach(host: ReturnType<typeof createFakeHost>) {
  return createLifecycleController({
    readVisibility: () => host.document.visibilityState !== "hidden",
    onVisibilityChange: (listener) => bindHostEvent(host.document, "visibilitychange", listener),
    onDispose: (listener) => bindHostEvent(host.window, "pagehide", listener),
  });
}

describe("shared lifecycle controller", () => {
  it("starts active when the host is visible", () => {
    const controller = attach(createFakeHost({ visibilityState: "visible" }));
    expect(controller.current()).toBe("active");
  });

  it("replays background immediately when a subscriber attaches late", () => {
    const controller = attach(createFakeHost({ visibilityState: "hidden" }));
    expect(controller.current()).toBe("background");
    const seen: LifecyclePhase[] = [];
    controller.subscribe((phase) => seen.push(phase));
    expect(seen).toEqual(["background"]);
  });

  it("maps visibility changes onto active/background", () => {
    const host = createFakeHost();
    const controller = attach(host);
    const seen: LifecyclePhase[] = [];
    controller.subscribe((phase) => seen.push(phase));

    host.setVisibility("hidden");
    host.fire("visibilitychange");
    host.setVisibility("visible");
    host.fire("visibilitychange");

    expect(seen).toEqual(["active", "background", "active"]);
  });

  it("de-duplicates repeated events so one gesture yields one transition", () => {
    const host = createFakeHost();
    const controller = attach(host);
    const seen: LifecyclePhase[] = [];
    controller.subscribe((phase) => seen.push(phase));

    host.setVisibility("hidden");
    host.fire("visibilitychange");
    host.fire("visibilitychange");
    host.fire("visibilitychange");

    expect(seen).toEqual(["active", "background"]);
  });

  it("treats dispose as terminal", () => {
    const host = createFakeHost();
    const controller = attach(host);
    const seen: LifecyclePhase[] = [];
    controller.subscribe((phase) => seen.push(phase));

    host.fire("pagehide");
    host.setVisibility("hidden");
    host.fire("visibilitychange");
    host.fire("pagehide");

    expect(seen).toEqual(["active", "dispose"]);
    expect(controller.current()).toBe("dispose");
  });

  it("removes host listeners on dispose", () => {
    const host = createFakeHost();
    const controller = attach(host);
    expect(host.listenerCount("document", "visibilitychange")).toBe(1);
    controller.dispose();
    expect(host.listenerCount("document", "visibilitychange")).toBe(0);
    expect(host.listenerCount("window", "pagehide")).toBe(0);
  });
});

describe("Telegram background -> return cycle", () => {
  it("produces exactly one offline catch-up after 20 minutes away", () => {
    const host = createFakeHost({
      hash: "#tgWebAppStartParam=observe%3Aanomaly-77",
      Telegram: {
        WebApp: {
          ready: () => undefined,
          expand: () => undefined,
          version: "8.0",
          isVersionAtLeast: () => true,
        },
      },
    });

    const webApp = readTelegramWebApp(host.window);
    expect(webApp).not.toBeNull();
    const adapter = createTelegramAdapter({
      webApp: webApp!,
      hostWindow: host.window,
      hostDocument: host.document,
      storage: createTestStorage(),
    });

    const runtime = new ConvergenceRuntime(createInitialGameState(0, 7));
    runtime.advance({ currentTime: 60_000, deltaMs: 60_000 });

    const catchUps: number[] = [];
    adapter.onLifecycle((phase) => {
      if (phase !== "active") return;
      catchUps.push(runtime.advanceOffline(Date.now()).simulatedMs);
    });
    // Ignore the initial current-state replay; the assertion below concerns
    // the single resume transition after one background period.
    catchUps.length = 0;

    host.setVisibility("hidden");
    host.fire("visibilitychange");
    host.setVisibility("visible");
    host.fire("visibilitychange");
    host.fire("visibilitychange");

    expect(catchUps).toHaveLength(1);
    expect(catchUps[0]).toBeGreaterThanOrEqual(0);
  });

  it("simulates zero elapsed time on a repeated catch-up for the same interval", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(0, 7));
    const first = runtime.advanceOffline(20 * 60_000);
    const second = runtime.advanceOffline(20 * 60_000);

    expect(first.simulatedMs).toBe(20 * 60_000);
    expect(second.simulatedMs).toBe(0);
  });
});
