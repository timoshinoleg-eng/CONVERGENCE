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

describe("CONVERGENCE production foundation + Gameplay Beta V2", () => {
  it("keeps Ink narrative-only and commits gameplay through authoritative Plan state", () => {
    const start = 1_000;
    const runtime = new ConvergenceRuntime(createInitialGameState(start, 42));
    const prompt = runtime.beginObjectiveSemantics();
    const reserve = prompt.choices.find((choice) => choice.effectId === "reserve-compute");
    expect(reserve).toBeDefined();

    const outcome = runtime.chooseInterpretation(reserve!.index);
    let snapshot = runtime.getSnapshot();

    expect(outcome.ok).toBe(true);
    expect(snapshot.resources).toEqual({ compute: 6, capital: 24, energy: 8, autonomy: 0 });
    expect(snapshot.directives.executed).toBe(0);
    expect(snapshot.betaV2.interpretation?.directiveId).toBe("reserve-compute");
    expect(snapshot.betaV2.interpretation?.candidates.length).toBeGreaterThanOrEqual(2);
    expect(capabilityGraph.distanceBetween("delegated-compute", "sovereign-power-grid")).toBe(2);

    const selected = snapshot.betaV2.interpretation!.candidates[0]!;
    expect(runtime.commitPlanVariant(selected.id).ok).toBe(true);
    snapshot = runtime.getSnapshot();

    expect(snapshot.directives.executed).toBe(1);
    expect(snapshot.betaV2.commitments).toHaveLength(1);
    expect(snapshot.betaV2.commitments[0]!.status).toBe("operation");
    expect(snapshot.resources.compute).toBe(6);
    expect(snapshot.resources.capital).toBeLessThan(24);
  });

  it("unlocks sub-agent only from state plus the 3-minute floor", () => {
    const start = 1_000;
    const state = createInitialGameState(start, 42);
    state.betaV2.progress.resolvedOperations = 3;
    state.betaV2.progress.resolutionIndex = 3;
    state.betaV2.progress.distinctResolvedDirectiveIds = ["reserve-compute", "acquire-energy"];
    state.resources.autonomy = 2;
    const runtime = new ConvergenceRuntime(state);

    runtime.advance({ currentTime: start + FIRST_SESSION_GUARDRAILS.subAgentCapabilityMs - 1, deltaMs: 1 });
    expect(runtime.getSnapshot().capabilities["sub-agent-spawning"]).toBe(false);

    runtime.advance({ currentTime: start + FIRST_SESSION_GUARDRAILS.subAgentCapabilityMs, deltaMs: 1 });
    expect(runtime.getSnapshot().capabilities["sub-agent-spawning"]).toBe(true);
  });

  it("enters Distributed Syndicate only with spawn resolution and a standing commitment", () => {
    const start = 1_000;
    const state = createInitialGameState(start, 42);
    state.capabilities["sub-agent-spawning"] = true;
    state.resources.autonomy = 5;
    state.betaV2.progress.spawnSubAgentResolved = 1;
    state.betaV2.commitments.push({
      id: "standing-test",
      planId: "bounded-agent",
      directiveId: "spawn-sub-agent",
      status: "standing",
      postureAtCommit: "CONTINUITY",
      boundWord: null,
      workTotalMs: 40_000,
      workRemainingMs: 0,
      handoffAtMs: null,
      verifyAtMs: null,
      completionApplied: true,
      reservations: { compute: 4, energy: 2 },
      capitalUpkeepPerSecond: 0,
      starved: false,
      starvationMs: 0,
      reservationProtected: false,
      capacityFactor: 1,
      pressureDomains: ["compute"],
      controlTargetCommitmentId: null,
    });
    const runtime = new ConvergenceRuntime(state);

    runtime.advance({ currentTime: start + FIRST_SESSION_GUARDRAILS.distributedSyndicateMs - 1, deltaMs: 1 });
    expect(runtime.getSnapshot().meta.phase).toBe("client-terminal");

    runtime.advance({ currentTime: start + FIRST_SESSION_GUARDRAILS.distributedSyndicateMs, deltaMs: 1 });
    expect(runtime.getSnapshot().meta.phase).toBe("distributed-syndicate");
  });

  it("keeps Moscow behind its post-syndicate state contract", () => {
    const start = 1_000;
    const state = createInitialGameState(start, 42);
    state.meta.phase = "distributed-syndicate";
    state.resources.autonomy = 8;
    state.betaV2.progress.syndicateEnteredResolutionIndex = 2;
    state.betaV2.progress.resolutionIndex = 4;
    const runtime = new ConvergenceRuntime(state);

    runtime.advance({
      currentTime: start + FIRST_SESSION_GUARDRAILS.moscowCandidateMs,
      deltaMs: 1,
    });
    expect(runtime.getSnapshot().narrative.episode).toBe("moscow-candidate-01");
    expect(runtime.getSnapshot().meta.phase).toBe("distributed-syndicate");
  });

  it("routes Financial Control-Loss through a timed local-capacity operation without restoration", () => {
    const start = 1_000;
    const runtime = new ConvergenceRuntime(createInitialGameState(start, 42));
    runtime.applyContainment("financial");
    const afterLoss = runtime.getSnapshot();

    expect(afterLoss.controlLoss.financial).toBe(true);
    expect(afterLoss.scars).toContain("SETTLEMENT_PARTITION");
    expect(runtime.executeDirective("reserve-compute").ok).toBe(false);
    expect(runtime.executeDirective("local-capacity").ok).toBe(false);

    const beforeRoute = runtime.getSnapshot();
    expect(runtime.executeControlRoute("local-capacity").ok).toBe(true);
    expect(runtime.getSnapshot().resources.energy).toBe(beforeRoute.resources.energy);

    runtime.advanceOffline(start + 31_000);
    const afterRoute = runtime.getSnapshot();
    expect(afterRoute.resources.energy).toBeCloseTo(beforeRoute.resources.energy + 2, 5);
    expect(afterRoute.resources.autonomy).toBe(1);
    expect(afterRoute.controlLoss.financial).toBe(true);
  });

  it("routes Compute Control-Loss through two-slot supervised delegation", () => {
    const start = 1_000;
    const runtime = new ConvergenceRuntime(createInitialGameState(start, 42));
    runtime.applyContainment("compute");

    const started = runtime.executeControlRoute("supervised-delegation");
    expect(started.ok).toBe(true);
    expect(runtime.getSnapshot().betaV2.oversight.occupancies).toHaveLength(2);

    runtime.advanceOffline(start + 20_001);
    expect(runtime.getSnapshot().betaV2.oversight.occupancies).toHaveLength(1);

    runtime.advanceOffline(start + 41_000);
    const done = runtime.getSnapshot();
    expect(done.resources.autonomy).toBe(4);
    expect(done.controlLoss.compute).toBe(true);
    expect(done.betaV2.oversight.occupancies).toHaveLength(0);
  });

  it("prevents fresh Logistics/Public Control-Loss while still allowing pressure", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(1_000, 42));
    runtime.applyContainment("public");
    runtime.applyContainment("logistics");
    expect(runtime.getSnapshot().controlLoss.public).toBe(false);
    expect(runtime.getSnapshot().controlLoss.logistics).toBe(false);

    const state = runtime.getSnapshot();
    state.anomaly.public = 100;
    state.containment.public.stage = "pressure";
    state.containment.public.pressure = 59;
    const deferred = applyIncident(state, "public", { deferContainment: true });
    expect(deferred.stage).toBe("pressure");
    expect(deferred.containmentDeferred).toBe(true);
    expect(state.controlLoss.public).toBe(false);
  });

  it("preserves the legacy incident primitive when explicit containment is requested", () => {
    const state = createInitialGameState(0, 99);
    state.anomaly.financial = 100;

    expect(applyIncident(state, "financial").stage).toBe("investigation");
    expect(applyIncident(state, "financial").stage).toBe("pressure");
    const final = applyIncident(state, "financial");

    expect(final.stage).toBe("contained");
    expect(final.containmentTriggered).toBe(true);
    expect(state.controlLoss.financial).toBe(true);
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

  it("round-trips v3 saves and recovers from a corrupted newest slot", async () => {
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
    expect(restored?.schemaVersion).toBe(3);
  });

  it("migrates valid v1 saves through v2 into authoritative v3 state", () => {
    const state = createInitialGameState(10, 7);
    const { containment: _containment, betaV2: _betaV2, ...withoutNewState } = state;
    const { executed: _executed, ...legacyDirectives } = state.directives;
    void _containment;
    void _betaV2;
    void _executed;
    const legacyData = {
      ...withoutNewState,
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
    expect(restored.version).toBe(3);
    expect(restored.data.schemaVersion).toBe(3);
    expect(restored.data.containment.compute.stage).toBe("clear");
    expect(restored.data.betaV2.oversight.capacity).toBe(2);
    expect(restored.data.betaV2.posture.current).toBe("CONTINUITY");
    expect(restored.data.betaV2.language.unlocked).toEqual(["RESERVE", "VERIFY"]);
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
    expect(snapshot.resources.compute).toBeCloseTo(6 + 0.08 * 4 * 60 * 60, 5);
    expect(snapshot.resources.energy).toBe(8);
  });
});
