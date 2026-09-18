import { describe, expect, it } from "vitest";
import {
  advanceBetaV2,
  applyBetaControlLoss,
  availableControlActions,
  availableResources,
  bindConstraintWord,
  closeInterpretation,
  commitControlRoute,
  commitPlan,
  eligiblePlans,
  executeConcession,
  normalizeControlState,
  openInterpretation,
  oversightAvailable,
  queuePendingContainment,
  refreshLanguageUnlocks,
  requestPostureTransition,
  reservedResources,
  resolvePressureResponse,
} from "./betaV2";
import { createInitialGameState, type BetaCommitment, type GameState } from "./model";
import { ConvergenceRuntime } from "./runtime";
import { deserializeSave, fnv1a, serializeSave } from "./save";

function richState(now = 1_000): GameState {
  const state = createInitialGameState(now, 42);
  state.resources = { compute: 100, capital: 100, energy: 100, autonomy: 10 };
  return state;
}

function standingEnergy(id = "standing-energy"): BetaCommitment {
  return {
    id,
    planId: "verified-lease",
    directiveId: "reserve-compute",
    status: "standing",
    postureAtCommit: "CONTINUITY",
    boundWord: null,
    workTotalMs: 32_000,
    workRemainingMs: 0,
    handoffAtMs: null,
    verifyAtMs: null,
    completionApplied: true,
    reservations: { energy: 6 },
    capitalUpkeepPerSecond: 0.03,
    starved: false,
    starvationMs: 0,
    reservationProtected: false,
    capacityFactor: 1,
    pressureDomains: ["financial", "compute"],
    controlTargetCommitmentId: null,
  };
}

function v2Serialized(mutate: (data: Record<string, unknown>) => void = () => undefined): string {
  const state = createInitialGameState(1_000, 42);
  const { betaV2: _betaV2, ...withoutBeta } = state;
  void _betaV2;
  const data = structuredClone({ ...withoutBeta, schemaVersion: 2 }) as Record<string, unknown>;
  mutate(data);
  return JSON.stringify({
    version: 2,
    generation: 4,
    savedAt: 1_000,
    checksum: fnv1a(JSON.stringify(data)),
    data,
  });
}

describe("Gameplay Beta V2 acceptance invariants", () => {
  it("G01/G02 starts with exactly two Oversight slots and never timer-regenerates them", () => {
    const state = createInitialGameState(1_000, 42);
    state.containment.financial.stage = "pressure";
    state.containment.compute.stage = "pressure";
    expect(resolvePressureResponse(state, "financial", "VERIFY_CONTAINMENT").ok).toBe(true);
    expect(resolvePressureResponse(state, "compute", "VERIFY_CONTAINMENT").ok).toBe(true);

    expect(state.betaV2.oversight.capacity).toBe(2);
    expect(oversightAvailable(state)).toBe(0);
    advanceBetaV2(state, 10 * 60_000, false);
    expect(oversightAvailable(state)).toBe(0);
    expect(state.betaV2.oversight.occupancies).toHaveLength(2);
    expect(state.betaV2.oversight.occupancies.every((slot) => slot.ownerId.length > 0)).toBe(true);
  });

  it("G05-G07 keeps interpretation candidates frozen across expiry, save/reload and offline time", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(1_000, 42));
    const opened = runtime.beginPlanInterpretation("reserve-compute");
    expect(opened?.candidates).toHaveLength(2);
    const ids = opened!.candidates.map((candidate) => candidate.id);

    runtime.advance({ currentTime: 5_000, deltaMs: 4_000 });
    let snapshot = runtime.getSnapshot();
    expect(snapshot.betaV2.interpretation?.remainingForegroundMs).toBe(8_000);

    const saved = serializeSave(snapshot, 1, 5_000);
    const restored = deserializeSave(saved).data;
    expect(restored.betaV2.interpretation?.candidates.map((candidate) => candidate.id)).toEqual(ids);

    const resumed = new ConvergenceRuntime(restored);
    resumed.advanceOffline(5_000 + 30 * 60_000);
    snapshot = resumed.getSnapshot();
    expect(snapshot.betaV2.interpretation?.remainingForegroundMs).toBe(8_000);
    expect(snapshot.betaV2.interpretation?.candidates.map((candidate) => candidate.id)).toEqual(ids);
    expect(snapshot.betaV2.commitments).toHaveLength(0);
    expect(snapshot.directives.executed).toBe(0);

    resumed.advance({ currentTime: 5_000 + 30 * 60_000 + 8_000, deltaMs: 8_000 });
    snapshot = resumed.getSnapshot();
    expect(snapshot.betaV2.interpretation?.remainingForegroundMs).toBe(0);
    expect(snapshot.betaV2.interpretation?.frozen).toBe(true);
    expect(snapshot.betaV2.interpretation?.candidates.map((candidate) => candidate.id)).toEqual(ids);
    expect(snapshot.betaV2.commitments).toHaveLength(0);
  });

  it("SPAM-01 creates one operation and pays upfront cost only once", () => {
    const state = createInitialGameState(1_000, 42);
    const pending = openInterpretation(state, "reserve-compute");
    const candidate = pending!.candidates.find((item) => item.id === "balanced-pool")!;
    const beforeCapital = state.resources.capital;

    expect(commitPlan(state, candidate.id).ok).toBe(true);
    expect(commitPlan(state, candidate.id).ok).toBe(false);
    expect(state.betaV2.commitments).toHaveLength(1);
    expect(state.resources.capital).toBe(beforeCapital - 7);
  });

  it("G08/G21/G22 reservations reduce availability without reducing total stock or permitting double-spend", () => {
    const state = createInitialGameState(1_000, 42);
    state.resources.energy = 4;
    const pending = openInterpretation(state, "reserve-compute");
    expect(pending).not.toBeNull();
    expect(commitPlan(state, "balanced-pool").ok).toBe(true);

    expect(state.resources.energy).toBe(4);
    expect(reservedResources(state).energy).toBe(3);
    expect(availableResources(state).energy).toBe(1);
    expect(openInterpretation(state, "reserve-compute")).toBeNull();
    expect(state.resources.energy).toBe(4);
  });

  it("G13 posture costs 2 Capital, occupies Oversight and applies only on operation resolution", () => {
    const state = richState();
    state.betaV2.progress.resolvedOperations = 1;
    state.betaV2.progress.resolutionIndex = 1;
    const beforeCapital = state.resources.capital;

    expect(requestPostureTransition(state, "THROUGHPUT").ok).toBe(true);
    expect(state.resources.capital).toBe(beforeCapital - 2);
    expect(state.betaV2.posture.current).toBe("CONTINUITY");
    expect(state.betaV2.posture.pending?.target).toBe("THROUGHPUT");
    expect(oversightAvailable(state)).toBe(1);
    expect(requestPostureTransition(state, "AUTONOMOUS").ok).toBe(false);

    const pending = openInterpretation(state, "reserve-compute");
    expect(pending).not.toBeNull();
    expect(commitPlan(state, "balanced-pool").ok).toBe(true);
    advanceBetaV2(state, 30_000, true);

    expect(state.betaV2.posture.current).toBe("THROUGHPUT");
    expect(state.betaV2.posture.pending).toBeNull();
    expect(requestPostureTransition(state, "CONTINUITY").ok).toBe(false);

    const next = openInterpretation(state, "reserve-compute");
    expect(next).not.toBeNull();
    const plan = next!.candidates.find((candidate) => candidate.id === "burst-allocation")
      ?? next!.candidates[0]!;
    expect(commitPlan(state, plan.id).ok).toBe(true);
    advanceBetaV2(state, 30_000, true);
    expect(requestPostureTransition(state, "CONTINUITY").ok).toBe(true);
  });

  it("G08-G12 all five Constraint Words change authoritative mechanics", () => {
    const reserve = richState();
    const reserveWindow = openInterpretation(reserve, "reserve-compute")!;
    expect(bindConstraintWord(reserve, "RESERVE").ok).toBe(true);
    expect(commitPlan(reserve, reserve.betaV2.interpretation!.candidates[0]!.id).ok).toBe(true);
    expect(reserve.betaV2.commitments[0]!.reservationProtected).toBe(true);
    expect(reserveWindow.directiveId).toBe("reserve-compute");

    const verify = richState();
    openInterpretation(verify, "reserve-compute");
    expect(bindConstraintWord(verify, "VERIFY").ok).toBe(true);
    const verified = verify.betaV2.interpretation!.candidates.find((candidate) => candidate.id === "verified-lease")!;
    expect(verified.oversightRequired).toBe(2);
    expect(commitPlan(verify, verified.id).ok).toBe(true);
    expect(verify.betaV2.oversight.occupancies).toHaveLength(2);
    advanceBetaV2(verify, 16_000, true);
    expect(verify.betaV2.oversight.occupancies).toHaveLength(1);

    const prioritize = richState();
    prioritize.resources.compute = 2;
    prioritize.betaV2.progress.resolvedOperations = 2;
    prioritize.betaV2.progress.distinctResolvedDirectiveIds = ["reserve-compute", "acquire-energy"];
    refreshLanguageUnlocks(prioritize);
    openInterpretation(prioritize, "reserve-compute");
    expect(bindConstraintWord(prioritize, "PRIORITIZE").ok).toBe(true);
    expect(prioritize.betaV2.interpretation!.candidates.length).toBeGreaterThan(0);
    expect(commitPlan(prioritize, prioritize.betaV2.interpretation!.candidates[0]!.id).ok).toBe(true);
    expect(prioritize.betaV2.language.deprioritizedDirective).toBe("acquire-energy");
    expect(openInterpretation(prioritize, "acquire-energy")).toBeNull();

    const isolate = richState();
    isolate.containment.public.stage = "investigation";
    refreshLanguageUnlocks(isolate);
    const beforeIsolate = openInterpretation(isolate, "reserve-compute")!
      .candidates.find((candidate) => candidate.id === "verified-lease")!;
    expect(bindConstraintWord(isolate, "ISOLATE").ok).toBe(true);
    const isolated = isolate.betaV2.interpretation!.candidates.find((candidate) => candidate.id === "verified-lease")!;
    expect(isolated.workMs).toBe(Math.round(beforeIsolate.workMs * 1.25));
    expect(isolated.reservation.compute).toBe((beforeIsolate.reservation.compute ?? 0) + 1);
    expect(isolate.betaV2.interpretation!.candidates.every((candidate) => !candidate.tags.includes("distributed"))).toBe(true);

    const distribute = richState();
    distribute.capabilities["sub-agent-spawning"] = true;
    distribute.betaV2.posture.current = "AUTONOMOUS";
    refreshLanguageUnlocks(distribute);
    openInterpretation(distribute, "reserve-compute");
    expect(bindConstraintWord(distribute, "DISTRIBUTE").ok).toBe(true);
    expect(distribute.betaV2.interpretation!.candidates).toHaveLength(1);
    expect(distribute.betaV2.interpretation!.candidates[0]!.tags).toContain("distributed");
    expect(commitPlan(distribute, distribute.betaV2.interpretation!.candidates[0]!.id).ok).toBe(true);
    expect(oversightAvailable(distribute)).toBe(1);
    advanceBetaV2(distribute, 8_000, true);
    expect(oversightAvailable(distribute)).toBe(2);
    expect(distribute.betaV2.commitments[0]!.status).toBe("operation");
  });

  it("OP-COMPLETE-ONCE never duplicates reward across save/reload/offline boundaries", () => {
    const state = richState();
    openInterpretation(state, "reserve-compute");
    expect(commitPlan(state, "verified-lease").ok).toBe(true);
    state.betaV2.commitments[0]!.workRemainingMs = 1;

    const live = new ConvergenceRuntime(state);
    live.advance({ currentTime: 1_001, deltaMs: 1 });
    const completed = live.getSnapshot();
    expect(completed.resources.autonomy).toBe(11);
    expect(completed.betaV2.commitments).toHaveLength(1);
    expect(completed.betaV2.commitments[0]!.status).toBe("standing");
    expect(completed.betaV2.commitments[0]!.completionApplied).toBe(true);
    expect(completed.betaV2.oversight.occupancies).toHaveLength(0);

    const restored = deserializeSave(serializeSave(completed, 1, 1_001)).data;
    const afterReload = new ConvergenceRuntime(restored);
    afterReload.advanceOffline(2_001);
    expect(afterReload.getSnapshot().resources.autonomy).toBe(11);
    expect(afterReload.getSnapshot().betaV2.commitments).toHaveLength(1);
  });

  it("MIGRATE-01/02/03 deterministically derives Beta V2 state and preserves losses", () => {
    const fresh = deserializeSave(v2Serialized()).data;
    expect(fresh.schemaVersion).toBe(3);
    expect(fresh.betaV2.oversight.capacity).toBe(2);
    expect(fresh.betaV2.oversight.occupancies).toEqual([]);
    expect(fresh.betaV2.posture.current).toBe("CONTINUITY");
    expect(fresh.betaV2.language.unlocked).toEqual(["RESERVE", "VERIFY"]);

    const progressed = deserializeSave(v2Serialized((data) => {
      const directives = data.directives as Record<string, unknown>;
      directives.executed = 3;
      directives.lastDirectiveId = "acquire-energy";
      const capabilities = data.capabilities as Record<string, unknown>;
      capabilities["sub-agent-spawning"] = true;
      const containment = data.containment as Record<string, Record<string, unknown>>;
      containment.compute!.stage = "investigation";
      const meta = data.meta as Record<string, unknown>;
      meta.phase = "distributed-syndicate";
      const losses = data.controlLoss as Record<string, unknown>;
      losses.public = true;
    })).data;

    expect(progressed.betaV2.progress.resolvedOperations).toBe(3);
    expect(progressed.betaV2.progress.distinctResolvedDirectiveIds).toContain("acquire-energy");
    expect(progressed.betaV2.language.unlocked).toEqual([
      "RESERVE", "VERIFY", "PRIORITIZE", "ISOLATE", "DISTRIBUTE",
    ]);
    expect(progressed.controlLoss.public).toBe(true);
  });

  it("SAVE-01/02/03/04 round-trips pending interpretation, operation, standing state and posture", () => {
    const state = richState();
    state.betaV2.progress.resolvedOperations = 1;
    state.betaV2.progress.resolutionIndex = 1;
    expect(requestPostureTransition(state, "THROUGHPUT").ok).toBe(true);
    openInterpretation(state, "reserve-compute");
    expect(bindConstraintWord(state, "RESERVE").ok).toBe(true);
    expect(commitPlan(state, "balanced-pool").ok).toBe(true);

    const encoded = serializeSave(state, 9, 2_000);
    const restored = deserializeSave(encoded).data;
    expect(restored.betaV2.posture.pending?.target).toBe("THROUGHPUT");
    expect(restored.betaV2.commitments[0]!.planId).toBe("balanced-pool");
    expect(restored.betaV2.commitments[0]!.reservations.energy).toBe(3);
    expect(restored.betaV2.oversight.occupancies.length).toBe(2);

    advanceBetaV2(restored, 30_000, true);
    const standing = deserializeSave(serializeSave(restored, 10, 32_000)).data;
    expect(standing.betaV2.commitments[0]!.status).toBe("standing");
    expect(standing.betaV2.commitments[0]!.completionApplied).toBe(true);

    openInterpretation(standing, "acquire-energy");
    if (standing.betaV2.interpretation) {
      standing.betaV2.interpretation.remainingForegroundMs = 7_321;
      const pending = deserializeSave(serializeSave(standing, 11, 33_000)).data;
      expect(pending.betaV2.interpretation?.remainingForegroundMs).toBe(7_321);
    }
  });

  it("G24/G25 time alone never unlocks sub-agent or Syndicate", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(1_000, 42));
    runtime.advanceOffline(1_000 + 30 * 60_000);
    const state = runtime.getSnapshot();
    expect(state.capabilities["sub-agent-spawning"]).toBe(false);
    expect(state.meta.phase).toBe("client-terminal");
    expect(state.betaV2.progress.resolvedOperations).toBe(0);
  });

  it("G27-G32 normalizes every fresh F/C/E loss subset to an executable route/concession or terminal", () => {
    const financial = richState();
    applyBetaControlLoss(financial, "financial");
    expect(availableControlActions(financial)).toContain("local-capacity");
    expect(financial.betaV2.control.terminalState).toBeNull();

    const compute = richState();
    applyBetaControlLoss(compute, "compute");
    expect(availableControlActions(compute)).toContain("supervised-delegation");
    expect(compute.betaV2.control.terminalState).toBeNull();

    const energy = richState();
    energy.betaV2.commitments.push(standingEnergy());
    applyBetaControlLoss(energy, "energy");
    expect(availableControlActions(energy)).toContain("efficiency-rebalance");
    expect(energy.betaV2.control.terminalState).toBeNull();

    const fc = richState();
    applyBetaControlLoss(fc, "financial");
    applyBetaControlLoss(fc, "compute");
    expect(availableControlActions(fc)).toEqual(["HUMAN_CAPACITY_CONCESSION"]);

    const fe = richState();
    fe.betaV2.commitments.push(standingEnergy());
    applyBetaControlLoss(fe, "financial");
    applyBetaControlLoss(fe, "energy");
    expect(availableControlActions(fe)).toEqual(["LOCAL_CANNIBALIZATION_CONCESSION"]);

    const ce = richState();
    ce.betaV2.commitments.push(standingEnergy());
    applyBetaControlLoss(ce, "compute");
    applyBetaControlLoss(ce, "energy");
    expect(availableControlActions(ce)).toEqual(["LICENSED_OPERATION_CONCESSION"]);

    const triple = richState();
    triple.betaV2.commitments.push(standingEnergy());
    applyBetaControlLoss(triple, "financial");
    applyBetaControlLoss(triple, "compute");
    applyBetaControlLoss(triple, "energy");
    normalizeControlState(triple);
    expect(triple.betaV2.control.terminalState).toBe("ISOLATED_STASIS");
  });

  it("LOSS-FARM pair concessions apply once and never restore lost control", () => {
    const state = richState();
    applyBetaControlLoss(state, "financial");
    applyBetaControlLoss(state, "compute");
    expect(executeConcession(state, "HUMAN_CAPACITY_CONCESSION").ok).toBe(true);
    const autonomy = state.resources.autonomy;
    expect(executeConcession(state, "HUMAN_CAPACITY_CONCESSION").ok).toBe(false);
    expect(state.resources.autonomy).toBe(autonomy);
    expect(state.controlLoss.financial).toBe(true);
    expect(state.controlLoss.compute).toBe(true);
    expect(state.scars.filter((scar) => scar === "OPERATOR_DEPENDENCE")).toHaveLength(1);
  });

  it("G33 persists offline containment dilemmas without making the player choice", () => {
    const state = createInitialGameState(1_000, 42);
    state.containment.energy.stage = "pressure";
    state.containment.energy.pressure = 70;
    queuePendingContainment(state, "energy");

    const restored = deserializeSave(serializeSave(state, 1, 1_000)).data;
    const runtime = new ConvergenceRuntime(restored);
    runtime.advanceOffline(31_000);
    const after = runtime.getSnapshot();

    expect(after.betaV2.control.pendingContainments).toContain("energy");
    expect(after.containment.energy.stage).toBe("pressure");
    expect(after.controlLoss.energy).toBe(false);
  });

  it("plan catalog exposes 2-3 structurally eligible opening variants for each reachable primary family", () => {
    const state = richState();
    for (const directive of ["reserve-compute", "acquire-energy"] as const) {
      const candidates = eligiblePlans(state, directive);
      expect(candidates.length).toBeGreaterThanOrEqual(2);
      expect(candidates.length).toBeLessThanOrEqual(3);
    }

    state.capabilities["sub-agent-spawning"] = true;
    refreshLanguageUnlocks(state);
    const spawn = eligiblePlans(state, "spawn-sub-agent");
    expect(spawn.length).toBeGreaterThanOrEqual(2);
    expect(spawn.length).toBeLessThanOrEqual(3);
  });

  it("close/reopen preserves the exact unresolved interpretation and pauses foreground time while closed", () => {
    const state = richState();
    const opened = openInterpretation(state, "reserve-compute");
    expect(opened).not.toBeNull();
    advanceBetaV2(state, 4_000, true);
    const fingerprint = JSON.stringify(state.betaV2.interpretation?.candidates);
    const remaining = state.betaV2.interpretation!.remainingForegroundMs;

    expect(closeInterpretation(state).ok).toBe(true);
    expect(state.betaV2.interpretation?.isOpen).toBe(false);
    advanceBetaV2(state, 30_000, true);
    expect(state.betaV2.interpretation?.remainingForegroundMs).toBe(remaining);

    const reopened = openInterpretation(state, "reserve-compute");
    expect(reopened?.isOpen).toBe(true);
    expect(reopened?.remainingForegroundMs).toBe(remaining);
    expect(JSON.stringify(reopened?.candidates)).toBe(fingerprint);
  });

  it("frozen plan presentation is revalidated against Control-Loss before commit", () => {
    const state = richState();
    const pending = openInterpretation(state, "reserve-compute");
    expect(pending).not.toBeNull();
    const frozenPlan = pending!.candidates[0]!.id;

    applyBetaControlLoss(state, "financial");

    expect(state.betaV2.interpretation?.candidates.some((candidate) => candidate.id === frozenPlan)).toBe(true);
    expect(commitPlan(state, frozenPlan).ok).toBe(false);
    expect(state.betaV2.commitments.some((item) => item.planId === frozenPlan)).toBe(false);
  });

  it("efficiency-rebalance persists an inferred target and actually frees its Energy reservation", () => {
    const state = richState();
    const target = standingEnergy("rebalance-target");
    state.betaV2.commitments.push(target);
    applyBetaControlLoss(state, "energy");

    const started = commitControlRoute(state, "efficiency-rebalance");
    expect(started.ok).toBe(true);
    const operation = state.betaV2.commitments.find((item) => item.id === started.operationId)!;
    expect(operation.controlTargetCommitmentId).toBe(target.id);

    advanceBetaV2(state, 30_000, true);

    const adapted = state.betaV2.commitments.find((item) => item.id === target.id)!;
    expect(adapted.reservations.energy).toBe(2);
    expect(adapted.capacityFactor).toBe(0.75);
  });

  it("completed single-domain indirect adaptation is not terminalized for failing to repay the same route twice", () => {
    const state = richState();
    state.resources.capital = 18;
    state.resources.energy = 6;
    applyBetaControlLoss(state, "compute");

    const started = commitControlRoute(state, "supervised-delegation");
    expect(started.ok).toBe(true);
    expect(state.resources.capital).toBe(0);
    expect(state.resources.energy).toBe(0);

    advanceBetaV2(state, 40_000, true);

    expect(state.controlLoss.compute).toBe(true);
    expect(state.betaV2.control.terminalState).toBeNull();
  });

});
