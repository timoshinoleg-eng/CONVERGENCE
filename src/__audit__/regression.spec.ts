/**
 * R-series regression tests for the CONVERGENCE Production Correctness PR.
 *
 * These are written as the tests SHOULD be committed: they fail on
 * `main @ a6b4581` and pass once the minimal fixes land.
 */
import { describe, expect, it } from "vitest";
import { createInitialGameState, type GameState } from "../game/model";
import { ConvergenceRuntime } from "../game/runtime";
import { advanceSimulation } from "../game/simulation";
import {
  loadSnapshot,
  saveSnapshot,
  serializeSave,
  type KeyValueStore,
} from "../game/save";
import { createPlatformStorage, type TelegramDeviceStoragePort } from "../platform/storage";
import { createCapacitorAdapter, type CapacitorAppPort } from "../platform/capacitor";
import { createBrowserAdapter } from "../platform/browser";
import { createTelegramAdapter, readTelegramWebApp } from "../platform/telegram";
import { applyEnvironmentToDocument } from "../platform/dom";
import { createFakeHost, createTestStorage } from "../platform/hostFixture";
import type { PlatformStorage } from "../platform/types";

const SLOT_A = "convergence.save.a";
const SLOT_B = "convergence.save.b";

function state(mutate: (s: GameState) => void = () => undefined): GameState {
  const s = createInitialGameState(1_000, 7);
  mutate(s);
  return s;
}

class MapStore implements KeyValueStore {
  constructor(readonly values = new Map<string, string>()) {}
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

/** Accepts writes but they only become readable after flush(). */
class WriteBehindStore implements KeyValueStore {
  readonly committed = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.committed.get(key) ?? null; }
  async set(): Promise<void> { /* silently not committed */ }
}

const noopStorage: PlatformStorage = {
  kind: "memory", durable: true,
  async get() { return null; }, async set() { /* noop */ },
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* ================= B-03 ================= */
describe("R1/R2 · B-03 idempotent approval", () => {
  it("R1 · choosing the same interpretation twice applies the reward once", () => {
    const seed = createInitialGameState(1_000, 7);
    seed.anomaly.public = 40;
    seed.anomaly.financial = 40;
    const runtime = new ConvergenceRuntime(seed);
    const before = runtime.getSnapshot();

    for (let i = 0; i < 5; i += 1) {
      const prompt = runtime.beginObjectiveSemantics();
      runtime.chooseInterpretation(
        prompt.choices.find((c) => c.effectId === "require-human-approval")!.index,
      );
    }

    const after = runtime.getSnapshot();
    expect(after.directives.executed - before.directives.executed).toBe(1);
    expect(after.anomaly.public).toBe(before.anomaly.public - 3);
    expect(after.anomaly.financial).toBe(before.anomaly.financial - 1);
  });

  it("R2 · a real directive resets the window, so the choice is not permanently locked out", () => {
    const seed = createInitialGameState(1_000, 7);
    seed.anomaly.public = 40;
    seed.anomaly.financial = 40;
    const runtime = new ConvergenceRuntime(seed);
    const before = runtime.getSnapshot();

    const pick = (): void => {
      const prompt = runtime.beginObjectiveSemantics();
      runtime.chooseInterpretation(
        prompt.choices.find((c) => c.effectId === "require-human-approval")!.index,
      );
    };

    pick();
    const pending = runtime.beginPlanInterpretation("reserve-compute");
    expect(pending).not.toBeNull();
    expect(runtime.commitPlanVariant(pending!.candidates[0]!.id).ok).toBe(true);
    pick();

    const after = runtime.getSnapshot();
    expect(after.directives.executed - before.directives.executed).toBe(3);
    expect(after.anomaly.public).toBe(before.anomaly.public - 6 + 0);
  });
});

/* ================= B-04 ================= */
describe("R3/R4 · B-04 delta clamp carries the remainder", () => {
  it("R3 · a 1h delta simulates 60s and leaves 59min unconsumed", () => {
    const s = state();
    const report = advanceSimulation(s, { currentTime: 1_000 + 3_600_000, deltaMs: 3_600_000 });
    expect(report.elapsedSeconds).toBe(60);
    expect(s.meta.updatedAt).toBe(1_000 + 60_000);
  });

  it("R4 · the skipped remainder is still catchable by advanceOffline", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(1_000, 7));
    runtime.advance({ currentTime: 1_000 + 3_600_000, deltaMs: 3_600_000 });
    const report = runtime.advanceOffline(1_000 + 3_600_000);
    expect(report.simulatedMs).toBe(3_540_000);
  });
});

/* ================= B-05 ================= */
describe("R6/R7/R8/R46 · B-05 safe area preserves env()", () => {
  it("R6 · browser adapter keeps env(safe-area-inset-top)", () => {
    const host = createFakeHost();
    const adapter = createBrowserAdapter({
      hostWindow: host.window, hostDocument: host.document, storage: noopStorage,
    });
    applyEnvironmentToDocument(host.document, adapter.getEnvironment());
    expect(host.cssVariables.get("--cv-safe-top")).toContain("env(safe-area-inset-top");
  });

  it("R7 · Capacitor adapter (zero insets) keeps env(safe-area-inset-bottom)", () => {
    const host = createFakeHost();
    const adapter = createCapacitorAdapter({
      hostWindow: host.window, hostDocument: host.document, storage: noopStorage, app: null,
    });
    applyEnvironmentToDocument(host.document, adapter.getEnvironment());
    const value = host.cssVariables.get("--cv-safe-bottom") ?? "";
    expect(value).toContain("env(safe-area-inset-bottom");
    expect(value).not.toBe("0px");
  });

  it("R8 · Telegram measured insets still win", () => {
    const host = createFakeHost({
      Telegram: { WebApp: { ready: () => undefined, version: "9.0", platform: "android", safeAreaInset: { bottom: 34 } } },
    });
    const webApp = readTelegramWebApp(host.window)!;
    const adapter = createTelegramAdapter({
      webApp, hostWindow: host.window, hostDocument: host.document, storage: noopStorage,
    });
    applyEnvironmentToDocument(host.document, adapter.getEnvironment());
    const value = host.cssVariables.get("--cv-safe-bottom") ?? "";
    expect(value).toContain("34px");
    expect(value).toContain("env(safe-area-inset-bottom");
  });

  it("R46 · a zero Telegram measurement is not forced to 0px", () => {
    const host = createFakeHost({
      Telegram: { WebApp: { ready: () => undefined, version: "9.0", platform: "android", safeAreaInset: { bottom: 0 } } },
    });
    const webApp = readTelegramWebApp(host.window)!;
    const adapter = createTelegramAdapter({
      webApp, hostWindow: host.window, hostDocument: host.document, storage: noopStorage,
    });
    applyEnvironmentToDocument(host.document, adapter.getEnvironment());
    expect(host.cssVariables.get("--cv-safe-bottom")).not.toBe("0px");
  });
});

/* ================= B-07 ================= */
describe("R9/R12 · B-07 Capacitor lifecycle", () => {
  function rejectingApp(): CapacitorAppPort {
    return { addListener: () => Promise.reject(new Error("plugin unavailable")) } as unknown as CapacitorAppPort;
  }

  it("R9 · addListener rejection still leaves a working DOM fallback", async () => {
    const host = createFakeHost();
    const adapter = createCapacitorAdapter({
      hostWindow: host.window, hostDocument: host.document, storage: noopStorage, app: rejectingApp(),
    });
    const seen: string[] = [];
    adapter.onLifecycle((phase) => seen.push(phase));
    await Promise.resolve();

    expect(host.listenerCount("document", "visibilitychange")).toBe(1);
    host.setVisibility("hidden");
    host.fire("visibilitychange");
    expect(seen).toEqual(["active", "background"]);
  });

  it("R12 · teardown before addListener resolves releases the late handle", async () => {
    let removeCalls = 0;
    let release: ((h: { remove(): Promise<void> }) => void) | null = null;
    const app: CapacitorAppPort = {
      addListener: () => new Promise((resolve) => { release = resolve; }),
    } as unknown as CapacitorAppPort;

    const host = createFakeHost();
    const adapter = createCapacitorAdapter({
      hostWindow: host.window, hostDocument: host.document, storage: noopStorage, app,
    });
    adapter.onLifecycle(() => undefined);
    adapter.dispose();
    release!({ remove: async () => { removeCalls += 1; } });
    await Promise.resolve();
    await Promise.resolve();

    expect(removeCalls).toBe(1);
  });
});

/* ================= B-08 ================= */
describe("R13/R14/R15 · B-08 storage failover", () => {
  function controllable(backing: Map<string, string>) {
    const cfg = { failGetCount: 0, failSetCount: 0, hang: false };
    const port: TelegramDeviceStoragePort = {
      getItem(key, cb) {
        if (cfg.hang) return port;
        if (cfg.failGetCount > 0) { cfg.failGetCount -= 1; cb("boom"); }
        else cb(null, backing.get(key) ?? null);
        return port;
      },
      setItem(key, value, cb) {
        if (cfg.hang) return port;
        if (cfg.failSetCount > 0) { cfg.failSetCount -= 1; cb?.("boom", false); }
        else { backing.set(key, value); cb?.(null, true); }
        return port;
      },
    };
    return { port, cfg, backing };
  }

  it("R13 · one transient read failure does not strand the session", async () => {
    const dev = controllable(new Map());
    const prefs = new MapStore();
    const storage = createPlatformStorage({
      native: false, telegramDeviceStorage: dev.port, preferences: prefs, failureCooldownMs: 0,
    });

    dev.cfg.failGetCount = 1;
    expect(await storage.get("k")).toBeNull();   // failed once
    await storage.set("k", "v");
    expect(await storage.get("k")).toBe("v");    // back on the primary layer
    expect(storage.kind).toBe("telegram-device");
    expect(dev.backing.get("k")).toBe("v");
  });

  it("R14 · a fallback write is repair-written to DeviceStorage", async () => {
    const dev = controllable(new Map());
    const prefs = new MapStore();
    const storage = createPlatformStorage({
      native: false, telegramDeviceStorage: dev.port, preferences: prefs, failureCooldownMs: 0,
    });

    dev.cfg.failSetCount = 1;
    await storage.set("k", "gen-2");
    expect(dev.backing.get("k")).toBe("gen-2");
  });

  it("R15 · the next launch reads the newest copy, not the stale device copy", async () => {
    const dev = controllable(new Map());
    const prefs = new MapStore();

    const launch1 = createPlatformStorage({
      native: false, telegramDeviceStorage: dev.port, preferences: prefs, failureCooldownMs: 0,
    });
    await launch1.set("save", "gen-A");
    dev.cfg.failSetCount = 1;              // one transient write failure
    await launch1.set("save", "gen-B");    // must still reach DeviceStorage

    const launch2 = createPlatformStorage({
      native: false, telegramDeviceStorage: dev.port, preferences: prefs, failureCooldownMs: 0,
    });
    expect(await launch2.get("save")).toBe("gen-B");
  });
});

/* ================= B-10 ================= */
describe("R17-R20 · B-10 save readback verification", () => {
  it("R17 · a write that never lands is reported as a failure", async () => {
    const store = new WriteBehindStore();
    await expect(saveSnapshot(store, state())).rejects.toThrow(/readback/i);
  });

  it("R18 · a valid but OLDER readback is rejected", async () => {
    const store = new WriteBehindStore();
    store.committed.set(SLOT_A, serializeSave(state((s) => { s.resources.capital = 11; }), 1, 5_000));
    store.committed.set(SLOT_B, serializeSave(state((s) => { s.resources.capital = 22; }), 2, 6_000));
    store.committed.set("convergence.save.active", "b");
    await expect(saveSnapshot(store, state((s) => { s.resources.capital = 999; }))).rejects.toThrow(/readback/i);
  });

  it("R19 · same generation but different content is rejected", async () => {
    const store: KeyValueStore = {
      async get(key: string) {
        const raw = (this as unknown as { mirror: Map<string, string> }).mirror.get(key) ?? null;
        if (raw === null) return null;
        const parsed = JSON.parse(raw) as { generation: number };
        // Valid envelope, same generation, different payload.
        return serializeSave(state((s) => { s.resources.capital = 1; }), parsed.generation);
      },
      async set(key: string, value: string) {
        (this as unknown as { mirror: Map<string, string> }).mirror.set(key, value);
      },
      mirror: new Map<string, string>(),
    } as unknown as KeyValueStore & { mirror: Map<string, string> };

    await expect(saveSnapshot(store, state((s) => { s.resources.capital = 999; }))).rejects.toThrow(/readback/i);
  });

  it("R20 · a null readback fails with a readback error, not a JSON error", async () => {
    const store = new WriteBehindStore();
    await expect(saveSnapshot(store, state())).rejects.toThrow(/readback missing/i);
  });
});

/* ================= E-1 ================= */
describe("R21-R23 · E-1 DeviceStorage timeout", () => {
  /** A host that accepts the call but never invokes the callback. */
  function unresponsivePort(): TelegramDeviceStoragePort {
    const port: TelegramDeviceStoragePort = {
      getItem() { return port; },
      setItem() { return port; },
    };
    return port;
  }

  it("R21 · a non-responsive getItem settles (failover) instead of hanging", async () => {
    const storage = createPlatformStorage({
      native: false, telegramDeviceStorage: unresponsivePort(),
      preferences: new MapStore(), deviceTimeoutMs: 60, failureCooldownMs: 0,
    });
    const outcome = await Promise.race([
      storage.get("k").then(() => "settled", () => "rejected"),
      sleep(400).then(() => "hung"),
    ]);
    expect(outcome).toBe("settled");
  });

  it("R22 · a non-responsive setItem settles (failover) instead of hanging", async () => {
    const storage = createPlatformStorage({
      native: false, telegramDeviceStorage: unresponsivePort(),
      preferences: new MapStore(), deviceTimeoutMs: 60, failureCooldownMs: 0,
    });
    const outcome = await Promise.race([
      storage.set("k", "v").then(() => "settled", () => "rejected"),
      sleep(400).then(() => "hung"),
    ]);
    expect(outcome).toBe("settled");
  });

  it("R23 · a timed-out operation does not wedge later operations", async () => {
    const prefs = new MapStore();
    const storage = createPlatformStorage({
      native: false, telegramDeviceStorage: unresponsivePort(),
      preferences: prefs, deviceTimeoutMs: 60, failureCooldownMs: 0,
    });
    await storage.get("k").catch(() => undefined);
    await storage.set("k2", "v");
    expect(await storage.get("k2")).toBe("v");
    expect(prefs.values.get("k2")).toBe("v");
  });
});

/* ================= E-2 ================= */
describe("R24/R26 · E-2 save serialisation", () => {
  it("R24 · overlapping saves produce distinct monotonic generations", async () => {
    const store = new MapStore();
    const first = saveSnapshot(store, state((s) => { s.resources.capital = 5; }));
    const second = saveSnapshot(store, state((s) => { s.resources.capital = 500; }));
    expect([await first, await second]).toEqual([1, 2]);
  });

  it("R26 · equal generations tie-break on savedAt, not slot order", async () => {
    const store = new MapStore();
    store.values.set(SLOT_A, serializeSave(state((s) => { s.resources.capital = 100; }), 7, 5_000));
    store.values.set(SLOT_B, serializeSave(state((s) => { s.resources.capital = 200; }), 7, 9_000));
    expect((await loadSnapshot(store))?.resources.capital).toBe(200);
  });
});

