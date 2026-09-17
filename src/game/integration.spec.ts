import { describe, expect, it } from "vitest";
import { capabilityGraph } from "./capabilities";
import { createTickRng } from "./engine/rng";
import { applyIncident } from "./incidents";
import { createInitialGameState } from "./model";
import { FIRST_SESSION_GUARDRAILS } from "./progression";
import { ConvergenceRuntime } from "./runtime";
import {
  deserializeSave,
  fnv1a,
  loadSnapshot,
  saveSnapshot,
  serializeSave,
  type KeyValueStore,
} from "./save";
import { incidentProbability } from "./simulation";

class TestStore implements KeyValueStore {
  readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

describe("CONVERGENCE beta foundation", () => {
  it("runs InkJS -> IdleKit -> Yggdrasil through one canonical GameState", () => {
    const start = 1_000;
    const runtime = new ConvergenceRuntime(createInitialGameState(start, 42));
    const prompt = runtime.beginObjectiveSemantics();

    expect(prompt.choices).toHaveLength(2);
    const reserve = prompt.choices.find((choice) => choice.effectId === "reserve-compute");
    expect(reserve).toBeDefined();

    const outcome = runtime.chooseInterpretation(reserve!.index);
    let snapshot = runtime.getSnapshot();

    expect(outcome.ok).toBe(true);
    expect(snapshot.resources.capital).toBe(16);
    expect(snapshot.resources.compute).toBe(24);
    expect(snapshot.capabilities["sub-agent-spawning"]).toBe(false);
    expect(snapshot.directives.executed).toBe(1);
    expect(capabilityGraph.distanceBetween("delegated-compute", "sovereign-power-grid")).toBe(2);

    runtime.advance({
      currentTime: start + FIRST_SESSION_GUARDRAILS.subAgentCapabilityMs,
      deltaMs: 1_000,
    });
    snapshot = runtime.getSnapshot();
    expect(snapshot.capabilities["sub-agent-spawning"]).toBe(true);
  });

  it("uses structured directives to enter Distributed Syndicate no earlier than the authored gate", () => {
    const start = 1_000;
    const runtime = new ConvergenceRuntime(createInitialGameState(start, 42));

    expect(runtime.executeDirective("reserve-compute").ok).toBe(true);
    runtime.advance({
      currentTime: start + FIRST_SESSION_GUARDRAILS.subAgentCapabilityMs,
      deltaMs: 1_000,
    });
    expect(runtime.getSnapshot().capabilities["sub-agent-spawning"]).toBe(true);
    expect(runtime.executeDirective("spawn-sub-agent").ok).toBe(true);

    runtime.advance({
      currentTime: start + FIRST_SESSION_GUARDRAILS.distributedSyndicateMs - 1_000,
      deltaMs: 1_000,
    });
    expect(runtime.getSnapshot().meta.phase).toBe("client-terminal");

    runtime.advance({
      currentTime: start + FIRST_SESSION_GUARDRAILS.distributedSyndicateMs,
      deltaMs: 1_000,
    });
    const snapshot = runtime.getSnapshot();
    expect(snapshot.resources.autonomy).toBeGreaterThanOrEqual(5);
    expect(snapshot.meta.phase).toBe("distributed-syndicate");
    expect(snapshot.directives.executed).toBe(2);
  });

  it("reveals Moscow as aggregate inference before any Technosphere transition", () => {
    const start = 1_000;
    const state = createInitialGameState(start, 42);
    state.meta.phase = "distributed-syndicate";
    state.capabilities["sub-agent-spawning"] = true;
    state.resources.autonomy = 8;
    const runtime = new ConvergenceRuntime(state);

    runtime.advance({
      currentTime: start + FIRST_SESSION_GUARDRAILS.moscowCandidateMs,
      deltaMs: 1_000,
    });
    expect(runtime.getSnapshot().narrative.episode).toBe("moscow-candidate-01");
    expect(runtime.getSnapshot().meta.phase).toBe("distributed-syndicate");

    runtime.advance({
      currentTime: start + FIRST_SESSION_GUARDRAILS.moscowSchematicMs,
      deltaMs: 1_000,
    });
    const snapshot = runtime.getSnapshot();
    expect(snapshot.narrative.episode).toBe("moscow-schematic-01");
    expect(snapshot.log.some((entry) => entry.message.includes("MOSCOW SCHEMATIC READY"))).toBe(true);
    expect(snapshot.meta.phase).toBe("distributed-syndicate");
  });

  it("blocks donor transactions when containment removes a control domain", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(1_000, 42));
    runtime.applyContainment("financial");
    const before = runtime.getSnapshot();

    const outcome = runtime.executeDirective("reserve-compute");
    const after = runtime.getSnapshot();

    expect(outcome.ok).toBe(false);
    expect(after.resources.capital).toBe(before.resources.capital);
    expect(outcome.failures.some((failure) => failure.kind === "requirement-failed")).toBe(true);
    expect(after.scars.length).toBe(1);
    expect(after.containment.financial.stage).toBe("contained");
  });

  it("offers supervised delegation after early Compute Control-Loss instead of a progression lock", () => {
    const start = 1_000;
    const runtime = new ConvergenceRuntime(createInitialGameState(start, 42));
    runtime.applyContainment("compute");

    expect(runtime.executeDirective("reserve-compute").ok).toBe(false);
    expect(runtime.executeDirective("acquire-energy").ok).toBe(true);

    // Recovery is intentionally more expensive than direct delegation. Let
    // normal background production accrue enough Capital while the authored
    // 3-minute capability gate elapses.
    runtime.advanceOffline(start + FIRST_SESSION_GUARDRAILS.subAgentCapabilityMs + 10_000);

    expect(runtime.getSnapshot().capabilities["sub-agent-spawning"]).toBe(true);
    expect(runtime.executeDirective("supervised-delegation").ok).toBe(true);
    expect(runtime.getSnapshot().resources.autonomy).toBeGreaterThanOrEqual(5);
  });

  it("makes Public Control-Loss remove a real directive and clamps mitigation anomaly to zero", () => {
    const state = createInitialGameState(1_000, 42);
    state.resources.compute = 100;
    state.anomaly.public = 5;
    state.anomaly.financial = 1;
    const runtime = new ConvergenceRuntime(state);

    expect(runtime.executeDirective("transparency-report").ok).toBe(true);
    expect(runtime.getSnapshot().anomaly.public).toBe(0);
    expect(runtime.getSnapshot().anomaly.financial).toBe(0);

    runtime.applyContainment("public");
    expect(runtime.executeDirective("transparency-report").ok).toBe(false);
  });

  it("forces investigation -> pressure -> containment before control loss", () => {
    const state = createInitialGameState(0, 99);
    state.anomaly.financial = 100;

    expect(applyIncident(state, "financial").stage).toBe("investigation");
    expect(state.controlLoss.financial).toBe(false);
    expect(applyIncident(state, "financial").stage).toBe("pressure");
    const final = applyIncident(state, "financial");

    expect(final.stage).toBe("contained");
    expect(final.containmentTriggered).toBe(true);
    expect(state.controlLoss.financial).toBe(true);
    expect(state.containment.financial.adaptation).toBe(1);
    expect(state.scars).toHaveLength(1);
  });

  it("keeps RNG and hazard outcomes deterministic across equivalent states", () => {
    const rawLeft = createInitialGameState(0, 12345);
    const rawRight = createInitialGameState(0, 12345);
    const leftRng = createTickRng(rawLeft);
    const rightRng = createTickRng(rawRight);

    expect([leftRng.next(), leftRng.next(), leftRng.int(1, 20)])
      .toEqual([rightRng.next(), rightRng.next(), rightRng.int(1, 20)]);

    const leftState = createInitialGameState(0, 777);
    const rightState = createInitialGameState(0, 777);
    leftState.anomaly.financial = 85;
    rightState.anomaly.financial = 85;
    const left = new ConvergenceRuntime(leftState);
    const right = new ConvergenceRuntime(rightState);

    for (let step = 1; step <= 20; step += 1) {
      left.advance({ currentTime: step * 60_000, deltaMs: 60_000 });
      right.advance({ currentTime: step * 60_000, deltaMs: 60_000 });
    }

    expect(left.getSnapshot().containment).toEqual(right.getSnapshot().containment);
    expect(left.getSnapshot().controlLoss).toEqual(right.getSnapshot().controlLoss);
    expect(left.getSnapshot().meta.rngCounter).toBe(right.getSnapshot().meta.rngCounter);
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

  it("migrates valid v1 saves into the v2 containment schema", () => {
    const state = createInitialGameState(10, 7);
    const { containment: _containment, ...withoutContainment } = state;
    const { executed: _executed, ...legacyDirectives } = state.directives;
    void _containment;
    void _executed;
    const legacyData = {
      ...withoutContainment,
      schemaVersion: 1,
      directives: legacyDirectives,
    };
    const serialized = JSON.stringify({
      version: 1,
      generation: 3,
      savedAt: 10,
      checksum: fnv1a(JSON.stringify(legacyData)),
      data: legacyData,
    });

    const restored = deserializeSave(serialized);
    expect(restored.version).toBe(2);
    expect(restored.data.schemaVersion).toBe(2);
    expect(restored.data.containment.compute.stage).toBe("clear");
    expect(restored.data.directives.executed).toBe(0);
  });

  it("detects checksum tampering before migration or load", () => {
    const state = createInitialGameState(10, 7);
    const parsed = JSON.parse(serializeSave(state, 1, 10)) as {
      data: { resources: { capital: number } };
    };
    parsed.data.resources.capital = 9999;
    expect(() => deserializeSave(JSON.stringify(parsed))).toThrow("checksum");
  });

  it("uses time-normalized hazard probability", () => {
    const tenSeconds = incidentProbability(60, 10);
    const twentySeconds = incidentProbability(60, 20);
    expect(tenSeconds).toBeGreaterThan(0);
    expect(twentySeconds).toBeGreaterThan(tenSeconds);
    expect(twentySeconds).toBeLessThan(1);
  });

  it("caps offline simulation at four hours and consumes skipped wall time", () => {
    const start = 1_000;
    const runtime = new ConvergenceRuntime(createInitialGameState(start, 7));
    const fiveHoursLater = start + 5 * 60 * 60 * 1000;

    const report = runtime.advanceOffline(fiveHoursLater);
    const snapshot = runtime.getSnapshot();

    expect(report.simulatedMs).toBe(4 * 60 * 60 * 1000);
    expect(report.skippedMs).toBe(60 * 60 * 1000);
    expect(snapshot.meta.updatedAt).toBe(fiveHoursLater);
    expect(snapshot.meta.tick).toBe(480);
    expect(snapshot.resources.compute).toBeGreaterThan(10_000);
  });
});
