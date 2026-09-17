import { describe, expect, it } from "vitest";
import {
  analyzeControlLossCoverage,
  evaluateProvisionalPacing,
  runBetaPacingSuite,
} from "./pacing";

describe("beta pacing gate", () => {
  it("replays the full pacing suite deterministically", () => {
    expect(runBetaPacingSuite()).toEqual(runBetaPacingSuite());
  });

  it("keeps normal representative strategies capable of reaching technosphere", () => {
    const suite = runBetaPacingSuite();
    const normal = suite.scenarios.filter((scenario) => scenario.name !== "compute-contained-start");

    expect(normal).toHaveLength(3);
    for (const scenario of normal) {
      expect(scenario.milestones.firstDirectiveMs).not.toBeNull();
      expect(scenario.milestones.subAgentCapabilityMs).not.toBeNull();
      expect(scenario.milestones.distributedSyndicateMs).not.toBeNull();
      expect(scenario.milestones.sovereignGridMs).not.toBeNull();
      expect(scenario.milestones.technosphereMs).not.toBeNull();
      expect(scenario.finalPhase).toBe("technosphere");
    }
  });

  it("detects that the current aggressive path violates provisional first-session pacing", () => {
    const aggressive = runBetaPacingSuite().scenarios.find(
      (scenario) => scenario.name === "aggressive-autonomy",
    );
    expect(aggressive).toBeDefined();

    const violations = evaluateProvisionalPacing(aggressive!);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((violation) => violation.startsWith("technosphereMs:"))).toBe(true);
  });

  it("exposes the current compute-control progression lock", () => {
    const constrained = runBetaPacingSuite().scenarios.find(
      (scenario) => scenario.name === "compute-contained-start",
    );
    expect(constrained).toBeDefined();
    expect(constrained!.successfulActions.length).toBeGreaterThan(0);
    expect(constrained!.milestones.subAgentCapabilityMs).toBeNull();
    expect(constrained!.milestones.distributedSyndicateMs).toBeNull();
    expect(constrained!.milestones.technosphereMs).toBeNull();
    expect(constrained!.finalPhase).toBe("client-terminal");
  });

  it("reports which directive classes each Control-Loss domain actually removes", () => {
    const coverage = Object.fromEntries(
      analyzeControlLossCoverage().map(({ domain, blockedDirectives }) => [domain, blockedDirectives]),
    );

    expect(coverage.financial).toEqual([
      "reserve-compute",
      "acquire-energy",
      "procurement-mesh",
    ]);
    expect(coverage.compute).toEqual([
      "reserve-compute",
      "spawn-sub-agent",
      "sovereign-grid",
    ]);
    expect(coverage.energy).toEqual([
      "acquire-energy",
      "spawn-sub-agent",
      "sovereign-grid",
    ]);
    expect(coverage.logistics).toEqual([
      "procurement-mesh",
      "sovereign-grid",
    ]);
    expect(coverage.public).toEqual([]);
  });

  it("emits a JSON-serializable machine-readable report", () => {
    const suite = runBetaPacingSuite();
    const encoded = JSON.stringify(suite);
    expect(JSON.parse(encoded)).toEqual(suite);
  });
});
