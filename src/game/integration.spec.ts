import { describe, expect, it } from "vitest";
import { capabilityGraph } from "./capabilities";
import { createTickRng } from "./engine/rng";
import { createInitialGameState } from "./model";
import { ConvergenceRuntime } from "./runtime";
import { deserializeSave, loadSnapshot, saveSnapshot, type KeyValueStore } from "./save";
import { incidentProbability } from "./simulation";

class TestStore implements KeyValueStore {
  readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

describe("CONVERGENCE integration spike", () => {
  it("runs InkJS -> IdleKit -> Yggdrasil through one canonical GameState", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(1_000, 42));
    const prompt = runtime.beginObjectiveSemantics();

    expect(prompt.choices).toHaveLength(2);
    const reserve = prompt.choices.find((choice) => choice.effectId === "reserve-compute");
    expect(reserve).toBeDefined();

    const outcome = runtime.chooseInterpretation(reserve!.index);
    const snapshot = runtime.getSnapshot();

    expect(outcome.ok).toBe(true);
    expect(snapshot.resources.capital).toBe(16);
    expect(snapshot.resources.compute).toBe(24);
    expect(snapshot.capabilities["sub-agent-spawning"]).toBe(true);
    expect(capabilityGraph.distanceBetween("delegated-compute", "sovereign-power-grid")).toBe(2);
  });

  it("blocks a donor transaction when containment removes a control domain", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(1_000, 42));
    runtime.applyContainment("financial");
    const before = runtime.getSnapshot();
    const prompt = runtime.beginObjectiveSemantics();
    const reserve = prompt.choices.find((choice) => choice.effectId === "reserve-compute")!;

    const outcome = runtime.chooseInterpretation(reserve.index);
    const after = runtime.getSnapshot();

    expect(outcome.ok).toBe(false);
    expect(after.resources.capital).toBe(before.resources.capital);
    expect(outcome.failures.some((failure) => failure.kind === "requirement-failed")).toBe(true);
    expect(after.scars.length).toBe(1);
  });

  it("keeps RNG deterministic across equivalent states", () => {
    const left = createInitialGameState(0, 12345);
    const right = createInitialGameState(0, 12345);
    const leftRng = createTickRng(left);
    const rightRng = createTickRng(right);

    expect([leftRng.next(), leftRng.next(), leftRng.int(1, 20)])
      .toEqual([rightRng.next(), rightRng.next(), rightRng.int(1, 20)]);
    expect(left.meta.rngCounter).toBe(3);
  });

  it("round-trips saves and recovers from a corrupted newest slot", async () => {
    const store = new TestStore();
    const older = createInitialGameState(10, 7);
    older.resources.capital = 31;
    await saveSnapshot(store, older);

    const newer = structuredClone(older);
    newer.resources.capital = 77;
    await saveSnapshot(store, newer);
    store.values.set("convergence.save.b", "{corrupted");

    const restored = await loadSnapshot(store);
    expect(restored?.resources.capital).toBe(31);
  });

  it("detects checksum tampering", () => {
    const state = createInitialGameState(10, 7);
    const store = new TestStore();
    void store;
    const serialized = JSON.stringify({
      version: 1,
      generation: 1,
      savedAt: 10,
      checksum: 0,
      data: state,
    });
    expect(() => deserializeSave(serialized)).toThrow("checksum");
  });

  it("uses time-normalized hazard probability", () => {
    const tenSeconds = incidentProbability(60, 10);
    const twentySeconds = incidentProbability(60, 20);
    expect(tenSeconds).toBeGreaterThan(0);
    expect(twentySeconds).toBeGreaterThan(tenSeconds);
    expect(twentySeconds).toBeLessThan(1);
  });
});
