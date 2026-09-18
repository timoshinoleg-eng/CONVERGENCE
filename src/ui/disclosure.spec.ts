import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/model";
import { derivePlayerDisclosure, riskSignal, visibleRiskDomains } from "./disclosure";

describe("player-facing progressive disclosure", () => {
  it("keeps the initial screen focused instead of exposing telemetry panels", () => {
    const state = createInitialGameState(1_000, 42);
    const view = derivePlayerDisclosure(state);

    expect(view.showOversight).toBe(false);
    expect(view.showPosture).toBe(false);
    expect(view.showCommitments).toBe(false);
    expect(view.showRiskDetails).toBe(false);
    expect(view.showContainment).toBe(false);
    expect(view.showCapabilities).toBe(false);
    expect(view.riskSignal).toBe("QUIET");
    expect(view.riskDomains).toEqual([]);
  });

  it("reveals commitments and Oversight only after the system creates an obligation", () => {
    const state = createInitialGameState(1_000, 42);
    state.betaV2.commitments.push({
      id: "operation-1",
      planId: "verified-lease",
      directiveId: "reserve-compute",
      status: "operation",
      postureAtCommit: "CONTINUITY",
      boundWord: null,
      workTotalMs: 32_000,
      workRemainingMs: 20_000,
      handoffAtMs: null,
      verifyAtMs: null,
      completionApplied: false,
      reservations: { energy: 2 },
      capitalUpkeepPerSecond: 0.03,
      starved: false,
      starvationMs: 0,
      reservationProtected: false,
      capacityFactor: 1,
      pressureDomains: ["financial", "compute"],
      controlTargetCommitmentId: null,
    });

    const view = derivePlayerDisclosure(state);
    expect(view.showCommitments).toBe(true);
    expect(view.showOversight).toBe(true);
    expect(view.showRiskDetails).toBe(false);
  });

  it("reveals posture controls only after the first resolved operation", () => {
    const state = createInitialGameState(1_000, 42);
    expect(derivePlayerDisclosure(state).showPosture).toBe(false);

    state.betaV2.progress.resolvedOperations = 1;
    expect(derivePlayerDisclosure(state).showPosture).toBe(true);
  });

  it("keeps exact risk domains hidden until investigation/history exists", () => {
    const state = createInitialGameState(1_000, 42);
    state.anomaly.financial = 40;

    expect(riskSignal(state)).toBe("ELEVATED");
    expect(visibleRiskDomains(state)).toEqual([]);
    expect(derivePlayerDisclosure(state).showRiskDetails).toBe(false);

    state.containment.financial.stage = "investigation";
    expect(visibleRiskDomains(state)).toEqual(["financial"]);
    expect(derivePlayerDisclosure(state).showRiskDetails).toBe(true);
    expect(derivePlayerDisclosure(state).showContainment).toBe(false);

    state.containment.financial.stage = "pressure";
    expect(derivePlayerDisclosure(state).showContainment).toBe(true);
  });

  it("shows at most three relevant domains, prioritizing control loss and pressure", () => {
    const state = createInitialGameState(1_000, 42);
    for (const domain of ["financial", "compute", "energy", "logistics", "public"] as const) {
      state.containment[domain].stage = "investigation";
      state.anomaly[domain] = 20;
    }
    state.containment.compute.stage = "pressure";
    state.controlLoss.energy = true;
    state.containment.energy.stage = "contained";

    expect(visibleRiskDomains(state)).toEqual(["energy", "compute", "financial"]);
    expect(riskSignal(state)).toBe("CONTROL LOSS");
  });

  it("reveals the capability graph only after sub-agent scale becomes relevant", () => {
    const state = createInitialGameState(1_000, 42);
    expect(derivePlayerDisclosure(state).showCapabilities).toBe(false);

    state.capabilities["sub-agent-spawning"] = true;
    expect(derivePlayerDisclosure(state).showCapabilities).toBe(true);
  });
});
