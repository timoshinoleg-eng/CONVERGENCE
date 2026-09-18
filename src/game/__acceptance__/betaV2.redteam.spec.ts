import { describe, expect, it } from "vitest";
import {
  PRIMARY_BETA_DIRECTIVES,
  advanceBetaV2,
  applyBetaControlLoss,
  availableControlActions,
  availableResources,
  bindConstraintWord,
  commitPlan,
  eligiblePlans,
  normalizeControlState,
  openInterpretation,
  oversightAvailable,
  queuePendingContainment,
  releaseCommitment,
  requestPostureTransition,
  reservedResources,
} from "../betaV2";
import {
  createInitialGameState,
  type BetaCommitment,
  type ControlDomain,
  type GameState,
} from "../model";
import { ConvergenceRuntime } from "../runtime";
import { deserializeSave, fnv1a, serializeSave } from "../save";

const START = 1_000;
const FCE = ["financial", "compute", "energy"] as const;
const ALL_DOMAINS = ["financial", "compute", "energy", "logistics", "public"] as const;

function richState(seed = 42): GameState {
  const state = createInitialGameState(START, seed);
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

function economicSnapshot(state: GameState) {
  return {
    resources: structuredClone(state.resources),
    anomaly: structuredClone(state.anomaly),
    controlLoss: structuredClone(state.controlLoss),
    commitments: structuredClone(state.betaV2.commitments),
    oversight: structuredClone(state.betaV2.oversight),
    resolvedOperations: state.betaV2.progress.resolvedOperations,
    resolutionIndex: state.betaV2.progress.resolutionIndex,
    directiveStarts: structuredClone(state.betaV2.progress.directiveStarts),
    phase: state.meta.phase,
  };
}

function legacyV2Serialized(losses: Partial<Record<ControlDomain, boolean>>): string {
  const state = createInitialGameState(START, 42);
  const { betaV2: _betaV2, ...withoutBeta } = state;
  void _betaV2;
  const data = structuredClone({ ...withoutBeta, schemaVersion: 2 }) as unknown as Record<string, unknown>;
  const controlLoss = data.controlLoss as Record<string, boolean>;
  for (const domain of ALL_DOMAINS) controlLoss[domain] = losses[domain] ?? false;
  return JSON.stringify({
    version: 2,
    generation: 7,
    savedAt: START,
    checksum: fnv1a(JSON.stringify(data)),
    data,
  });
}

function normalPlanOpportunity(state: GameState): boolean {
  return PRIMARY_BETA_DIRECTIVES.some((directive) => eligiblePlans(state, directive).length >= 2);
}

function releaseCanOpenRoute(state: GameState): boolean {
  return state.betaV2.commitments.some((commitment) => {
    const clone = structuredClone(state);
    const result = releaseCommitment(clone, commitment.id);
    return result.ok
      && clone.betaV2.control.terminalState === null
      && availableControlActions(clone).length > 0;
  });
}

function hasImmediateMeaningfulAction(state: GameState): boolean {
  return availableControlActions(state).length > 0
    || normalPlanOpportunity(state)
    || releaseCanOpenRoute(state);
}

function applyLossSubset(state: GameState, domains: readonly (typeof FCE)[number][]): void {
  for (const domain of domains) applyBetaControlLoss(state, domain);
  normalizeControlState(state);
}

describe("Beta V2 red-team invariants", () => {
  it("RT-G01/G02 Oversight is exactly two and generic time never regenerates occupied slots", () => {
    const state = richState();
    state.betaV2.oversight.occupancies = [
      { id: "fixture-a", ownerId: "fixture-a", kind: "containment", reason: "fixture", releasable: false },
      { id: "fixture-b", ownerId: "fixture-b", kind: "containment", reason: "fixture", releasable: false },
    ];
    const runtime = new ConvergenceRuntime(state);

    expect(runtime.getSnapshot().betaV2.oversight.capacity).toBe(2);
    expect(oversightAvailable(runtime.getSnapshot())).toBe(0);

    runtime.advance({ currentTime: START + 60_000, deltaMs: 60_000 });
    expect(oversightAvailable(runtime.getSnapshot())).toBe(0);

    runtime.advanceOffline(START + 10 * 60_000);
    expect(oversightAvailable(runtime.getSnapshot())).toBe(0);
  });

  it("RT-RESERVATION-ATOMIC never spends stock already reserved by a first operation", () => {
    const state = richState();
    state.resources.energy = 7;

    const first = openInterpretation(state, "reserve-compute");
    expect(first).not.toBeNull();
    expect(commitPlan(state, "balanced-pool").ok).toBe(true);
    expect(reservedResources(state).energy).toBe(3);
    expect(availableResources(state).energy).toBe(4);

    // A second Balanced Pool needs another 3 Energy reservation, but also a
    // free Oversight slot. If it starts, availability must still never go negative.
    const second = openInterpretation(state, "reserve-compute");
    if (second) {
      const attempt = commitPlan(state, "balanced-pool");
      if (attempt.ok) {
        expect(availableResources(state).energy).toBeGreaterThanOrEqual(0);
        expect(reservedResources(state).energy).toBeLessThanOrEqual(state.resources.energy);
      }
    }

    expect(state.resources.energy).toBe(7);
    expect(availableResources(state).energy).toBeGreaterThanOrEqual(0);
  });

  it("RT-SPAM-01 double-submit creates one operation and charges upfront exactly once", () => {
    const state = richState();
    openInterpretation(state, "reserve-compute");
    const before = state.resources.capital;

    const first = commitPlan(state, "balanced-pool");
    const second = commitPlan(state, "balanced-pool");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(state.betaV2.commitments).toHaveLength(1);
    expect(state.resources.capital).toBe(before - 7);
  });

  it("RT-SPAM-02 opening the same interpretation 100x has zero authoritative gain and no reroll", () => {
    const runtime = new ConvergenceRuntime(richState());
    const first = runtime.beginPlanInterpretation("reserve-compute");
    expect(first).not.toBeNull();
    const fingerprint = JSON.stringify(first);
    const before = economicSnapshot(runtime.getSnapshot());

    for (let index = 0; index < 100; index += 1) {
      expect(JSON.stringify(runtime.beginPlanInterpretation("reserve-compute"))).toBe(fingerprint);
    }

    expect(economicSnapshot(runtime.getSnapshot())).toEqual(before);
  });

  it("RT-SPAM-02 exposes a public cancel/close boundary for the required close/reopen defense", () => {
    const methodNames = Object.getOwnPropertyNames(ConvergenceRuntime.prototype);
    const hasCancelBoundary = methodNames.some((name) =>
      /(?:cancel|close|clear).*interpret|interpret.*(?:cancel|close|clear)/i.test(name),
    );

    expect(
      hasCancelBoundary,
      "Acceptance T-G07/T-SPAM-02 requires close/reopen testing; current runtime exposes no interpretation cancel/close boundary.",
    ).toBe(true);
  });

  it("RT-WORD-SPAM cannot create economic/progression gain by bind/unbind cycling", () => {
    const state = richState();
    openInterpretation(state, "reserve-compute");
    const before = economicSnapshot(state);

    for (let index = 0; index < 100; index += 1) {
      expect(bindConstraintWord(state, "RESERVE").ok).toBe(true);
      expect(bindConstraintWord(state, null).ok).toBe(true);
    }

    const after = economicSnapshot(state);
    expect(after).toEqual(before);
    expect(state.betaV2.commitments).toHaveLength(0);
  });

  it("RT-METRIC word bind/unbind spam cannot farm MeaningfulDecision count", () => {
    const state = richState();
    openInterpretation(state, "reserve-compute");
    const before = state.betaV2.progress.meaningfulDecisions;

    for (let index = 0; index < 100; index += 1) {
      expect(bindConstraintWord(state, "RESERVE").ok).toBe(true);
      expect(bindConstraintWord(state, null).ok).toBe(true);
    }

    expect(
      state.betaV2.progress.meaningfulDecisions - before,
      "Repeatedly returning to the same Constraint consequence inside one pending interpretation must not manufacture the >=12 decision metric.",
    ).toBeLessThanOrEqual(1);
  });

  it("RT-POSTURE-SPAM charges Capital/Oversight once and rejects repeats while pending", () => {
    const state = richState();
    state.betaV2.progress.resolvedOperations = 1;
    state.betaV2.progress.resolutionIndex = 1;
    const beforeCapital = state.resources.capital;

    expect(requestPostureTransition(state, "THROUGHPUT").ok).toBe(true);
    const afterFirst = structuredClone(state);

    for (let index = 0; index < 100; index += 1) {
      expect(requestPostureTransition(state, "AUTONOMOUS").ok).toBe(false);
      expect(requestPostureTransition(state, "THROUGHPUT").ok).toBe(false);
    }

    expect(state.resources.capital).toBe(beforeCapital - 2);
    expect(state.betaV2.oversight.occupancies).toEqual(afterFirst.betaV2.oversight.occupancies);
    expect(state.betaV2.posture.pending).toEqual(afterFirst.betaV2.posture.pending);
  });

  it("RT-G06 expiry freezes candidates without auto-executing or mutating gameplay", () => {
    const state = richState();
    const pending = openInterpretation(state, "reserve-compute")!;
    const candidateFingerprint = JSON.stringify(pending.candidates);
    const before = economicSnapshot(state);

    // Advance only the foreground-attention/gameplay mechanic clock. Passive
    // economy is a separate simulation concern and must not be confused with
    // Interpretation expiry mutation.
    advanceBetaV2(state, 12_000, true);

    expect(state.betaV2.interpretation?.remainingForegroundMs).toBe(0);
    expect(state.betaV2.interpretation?.frozen).toBe(true);
    expect(JSON.stringify(state.betaV2.interpretation?.candidates)).toBe(candidateFingerprint);
    expect(economicSnapshot(state)).toEqual(before);
  });

  it("RT-G07 save/load keeps exact pending candidates, costs, risks, word and foreground time", () => {
    const runtime = new ConvergenceRuntime(richState());
    runtime.beginPlanInterpretation("reserve-compute");
    runtime.bindConstraint("VERIFY");
    runtime.advance({ currentTime: START + 4_000, deltaMs: 4_000 });
    const before = runtime.getSnapshot().betaV2.interpretation!;

    const restored = deserializeSave(
      serializeSave(runtime.getSnapshot(), 11, START + 4_000),
    ).data.betaV2.interpretation!;

    expect(restored).toEqual(before);
  });

  it("RT-OP-COMPLETE-ONCE survives 1ms boundary, duplicate lifecycle callback, save/reload and offline catch-up", () => {
    const state = richState();
    openInterpretation(state, "reserve-compute");
    expect(commitPlan(state, "verified-lease").ok).toBe(true);
    state.betaV2.commitments[0]!.workRemainingMs = 1;

    const runtime = new ConvergenceRuntime(state);
    runtime.advance({ currentTime: START + 1, deltaMs: 1 });
    runtime.advance({ currentTime: START + 1, deltaMs: 1 });

    const completed = runtime.getSnapshot();
    const rewardAutonomy = completed.resources.autonomy;
    const rewardCompute = completed.resources.compute;
    const resolutionIndex = completed.betaV2.progress.resolutionIndex;

    const reloaded = new ConvergenceRuntime(
      deserializeSave(serializeSave(completed, 12, START + 1)).data,
    );
    reloaded.advanceOffline(START + 60_000);
    const after = reloaded.getSnapshot();

    expect(after.resources.autonomy).toBe(rewardAutonomy);
    // Passive Compute is allowed after reload; the authored completion reward is
    // protected by completionApplied/resolutionIndex rather than raw total equality.
    expect(after.resources.compute).toBeGreaterThanOrEqual(rewardCompute);
    expect(after.betaV2.progress.resolutionIndex).toBe(resolutionIndex);
    expect(after.betaV2.commitments.filter((item) => item.planId === "verified-lease")).toHaveLength(1);
    expect(after.betaV2.commitments[0]!.completionApplied).toBe(true);
  });

  it("RT-RELEASE-LOCK blocks same plan until a different Directive resolves", () => {
    const state = richState();
    openInterpretation(state, "reserve-compute");
    expect(commitPlan(state, "verified-lease").ok).toBe(true);
    state.betaV2.commitments[0]!.workRemainingMs = 1;
    const runtime = new ConvergenceRuntime(state);
    runtime.advance({ currentTime: START + 1, deltaMs: 1 });

    const standing = runtime.getSnapshot().betaV2.commitments[0]!;
    expect(runtime.release(standing.id).ok).toBe(true);

    let snapshot = runtime.getSnapshot();
    expect(eligiblePlans(snapshot, "reserve-compute").some(
      (candidate) => candidate.id === "verified-lease",
    )).toBe(false);

    const energy = runtime.beginPlanInterpretation("acquire-energy");
    expect(energy).not.toBeNull();
    expect(runtime.commitPlanVariant(energy!.candidates[0]!.id).ok).toBe(true);
    snapshot = runtime.getSnapshot();
    snapshot.betaV2.commitments.find((item) => item.status === "operation")!.workRemainingMs = 1;
    runtime.replaceState(snapshot);
    runtime.advance({ currentTime: START + 2, deltaMs: 1 });

    snapshot = runtime.getSnapshot();
    expect(eligiblePlans(snapshot, "reserve-compute").some(
      (candidate) => candidate.id === "verified-lease",
    )).toBe(true);
  });

  it("RT-OFFLINE keeps foreground Interpretation time paused and never selects a plan", () => {
    const runtime = new ConvergenceRuntime(richState());
    runtime.beginPlanInterpretation("reserve-compute");
    runtime.advance({ currentTime: START + 4_000, deltaMs: 4_000 });
    expect(runtime.getSnapshot().betaV2.interpretation?.remainingForegroundMs).toBe(8_000);

    runtime.advanceOffline(START + 30 * 60_000);
    const after = runtime.getSnapshot();

    expect(after.betaV2.interpretation?.remainingForegroundMs).toBe(8_000);
    expect(after.betaV2.commitments).toHaveLength(0);
    expect(after.directives.executed).toBe(0);
  });

  it("RT-OFFLINE one catch-up can queue multiple incident-driven F/C/E dilemmas without auto-loss", () => {
    let observed: GameState | null = null;

    for (let seed = 1; seed <= 250 && observed === null; seed += 1) {
      const state = richState(seed);
      for (const domain of FCE) {
        state.anomaly[domain] = 100;
        state.containment[domain].stage = "pressure";
        state.containment[domain].pressure = 59;
      }
      const runtime = new ConvergenceRuntime(state);
      runtime.advanceOffline(START + 60_000);
      const after = runtime.getSnapshot();
      if (after.betaV2.control.pendingContainments.length >= 2) observed = after;
    }

    expect(observed, "expected deterministic seed search to find a multi-domain offline containment attempt").not.toBeNull();
    const pending = observed!.betaV2.control.pendingContainments;
    const order = ["financial", "compute", "energy"];
    expect(pending).toEqual([...pending].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    for (const domain of pending) {
      expect(observed!.controlLoss[domain]).toBe(false);
      expect(observed!.containment[domain].stage).toBe("pressure");
    }
  });

  it("RT-OFFLINE pendingContainments persists every queued F/C/E domain in deterministic order", () => {
    const state = richState();
    queuePendingContainment(state, "energy");
    queuePendingContainment(state, "financial");
    queuePendingContainment(state, "compute");
    queuePendingContainment(state, "energy");

    expect(state.betaV2.control.pendingContainments).toEqual([
      "financial", "compute", "energy",
    ]);

    const restored = deserializeSave(serializeSave(state, 13, START)).data;
    expect(restored.betaV2.control.pendingContainments).toEqual([
      "financial", "compute", "energy",
    ]);
  });

  it("RT-G37 fresh Logistics/Public pressure never newly enters Control-Loss", () => {
    for (const domain of ["logistics", "public"] as const) {
      const state = richState(137);
      state.anomaly[domain] = 100;
      state.containment[domain].stage = "pressure";
      state.containment[domain].pressure = 99;
      const runtime = new ConvergenceRuntime(state);

      for (let minute = 1; minute <= 20; minute += 1) {
        runtime.advance({ currentTime: START + minute * 60_000, deltaMs: 60_000 });
        expect(runtime.getSnapshot().controlLoss[domain]).toBe(false);
        expect(runtime.getSnapshot().containment[domain].stage).not.toBe("contained");
      }
    }
  });

  it("RT-G27-G32 every fresh F/C/E subset has an executable route/release-to-route or authored terminal", () => {
    const subsets: Array<readonly (typeof FCE)[number][]> = [
      ["financial"],
      ["compute"],
      ["energy"],
      ["financial", "compute"],
      ["financial", "energy"],
      ["compute", "energy"],
      ["financial", "compute", "energy"],
    ];

    for (const subset of subsets) {
      const state = richState();
      if (subset.includes("energy")) state.betaV2.commitments.push(standingEnergy());
      applyLossSubset(state, subset);

      const valid = state.betaV2.control.terminalState !== null
        || availableControlActions(state).length > 0
        || releaseCanOpenRoute(state);

      expect(valid, `softlock for ${subset.join("+")}`).toBe(true);
    }
  });

  it("RT-G30 below-cost pair losses normalize to terminal instead of passive-wait softlock", () => {
    const fixtures: Array<{
      domains: readonly (typeof FCE)[number][];
      mutate: (state: GameState) => void;
    }> = [
      {
        domains: ["financial", "compute"],
        mutate: (state) => { state.resources.energy = 7.9; },
      },
      {
        domains: ["financial", "energy"],
        mutate: (state) => {
          state.resources.compute = 11.9;
          state.betaV2.commitments.push(standingEnergy());
        },
      },
      {
        domains: ["compute", "energy"],
        mutate: (state) => {
          state.resources.capital = 19.9;
          state.betaV2.commitments.push(standingEnergy());
        },
      },
    ];

    for (const fixture of fixtures) {
      const state = richState();
      fixture.mutate(state);
      applyLossSubset(state, fixture.domains);
      expect(
        state.betaV2.control.terminalState !== null
          || availableControlActions(state).length > 0
          || releaseCanOpenRoute(state),
        `pair softlock for ${fixture.domains.join("+")}`,
      ).toBe(true);
    }
  });

  it("RT-G31 arbitrary pre-existing operation cannot suppress ISOLATED_STASIS for F+C+E", () => {
    const state = richState();
    openInterpretation(state, "reserve-compute");
    expect(commitPlan(state, "verified-lease").ok).toBe(true);
    expect(state.betaV2.commitments.some((item) => item.status === "operation")).toBe(true);

    applyLossSubset(state, ["financial", "compute", "energy"]);

    expect(
      state.betaV2.control.terminalState,
      "Only an operation that can resolve into a surviving authored route may postpone triple-loss terminal normalization.",
    ).toBe("ISOLATED_STASIS");
  });

  it("RT-G38 all 32 migrated legacy loss combinations are route/action OR CONTROL_SURFACE_COLLAPSE/ISOLATED_STASIS", () => {
    for (let mask = 0; mask < 32; mask += 1) {
      const losses: Partial<Record<ControlDomain, boolean>> = {};
      ALL_DOMAINS.forEach((domain, index) => {
        losses[domain] = Boolean(mask & (1 << index));
      });

      const migrated = deserializeSave(legacyV2Serialized(losses)).data;
      const runtime = new ConvergenceRuntime(migrated);
      const state = runtime.getSnapshot();

      for (const domain of ALL_DOMAINS) {
        expect(state.controlLoss[domain], `mask=${mask} domain=${domain}`).toBe(losses[domain] ?? false);
      }

      const safe = state.betaV2.control.terminalState !== null || hasImmediateMeaningfulAction(state);
      expect(
        safe,
        `legacy mask=${mask.toString(2).padStart(5, "0")} has no action and no terminal`,
      ).toBe(true);
    }
  });

  it("RT-WAIT passive-only 10 minutes unlocks neither sub-agent nor Syndicate", () => {
    const runtime = new ConvergenceRuntime(createInitialGameState(START, 42));
    runtime.advanceOffline(START + 10 * 60_000);
    const state = runtime.getSnapshot();

    expect(state.capabilities["sub-agent-spawning"]).toBe(false);
    expect(state.meta.phase).toBe("client-terminal");
    expect(state.betaV2.progress.resolvedOperations).toBe(0);
  });
});
