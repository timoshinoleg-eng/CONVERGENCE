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

  it("keeps normal representative strategies inside the first-session windows", () => {
    const suite = runBetaPacingSuite();
    const normal = suite.scenarios.filter((scenario) => !scenario.name.endsWith("contained-start"));

    expect(normal).toHaveLength(3);
    for (const scenario of normal) {
      expect(scenario.milestones.firstDirectiveMs).not.toBeNull();
      expect(scenario.milestones.subAgentCapabilityMs).not.toBeNull();
      expect(scenario.milestones.distributedSyndicateMs).not.toBeNull();
      expect(scenario.milestones.moscowCandidateMs).not.toBeNull();
      expect(scenario.milestones.moscowSchematicMs).not.toBeNull();
      expect(scenario.milestones.sovereignGridMs).not.toBeNull();
      expect(scenario.milestones.technosphereMs).not.toBeNull();
      expect(scenario.finalPhase).toBe("technosphere");
      expect(evaluateProvisionalPacing(scenario)).toEqual([]);
    }
  });

  it("does not reveal Moscow or Technosphere before their authored guardrails", () => {
    const aggressive = runBetaPacingSuite().scenarios.find(
      (scenario) => scenario.name === "aggressive-autonomy",
    );
    expect(aggressive).toBeDefined();
    expect(aggressive!.milestones.moscowCandidateMs).toBeGreaterThanOrEqual(10 * 60_000);
    expect(aggressive!.milestones.moscowSchematicMs).toBeGreaterThanOrEqual(16 * 60_000);
    expect(aggressive!.milestones.technosphereMs).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it("turns early Compute Control-Loss into a constrained recovery path, not a Client Terminal lock", () => {
    const constrained = runBetaPacingSuite().scenarios.find(
      (scenario) => scenario.name === "compute-contained-start",
    );
    expect(constrained).toBeDefined();
    expect(constrained!.successfulActions.some(({ directive }) => directive === "supervised-delegation")).toBe(true);
    expect(constrained!.milestones.subAgentCapabilityMs).not.toBeNull();
    expect(constrained!.milestones.distributedSyndicateMs).not.toBeNull();
    expect(constrained!.finalPhase).not.toBe("client-terminal");
    expect(constrained!.milestones.technosphereMs).toBeNull();
  });

  it("turns early Financial Control-Loss into local reallocation instead of a Client Terminal lock", () => {
    const constrained = runBetaPacingSuite().scenarios.find(
      (scenario) => scenario.name === "financial-contained-start",
    );
    expect(constrained).toBeDefined();
    expect(constrained!.successfulActions.some(({ directive }) => directive === "local-capacity")).toBe(true);
    expect(constrained!.successfulActions.some(({ directive }) => directive === "spawn-sub-agent")).toBe(true);
    expect(constrained!.milestones.subAgentCapabilityMs).not.toBeNull();
    expect(constrained!.milestones.distributedSyndicateMs).not.toBeNull();
    expect(constrained!.milestones.moscowCandidateMs).not.toBeNull();
    expect(constrained!.finalPhase).toBe("distributed-syndicate");
    // Lost financial control still prevents the capital/procurement route into
    // the sovereign grid, so recovery does not erase the consequence.
    expect(constrained!.milestones.sovereignGridMs).toBeNull();
    expect(constrained!.milestones.technosphereMs).toBeNull();
  });

  it("reports a real directive amputation for every Control-Loss domain", () => {
    const coverage = Object.fromEntries(
      analyzeControlLossCoverage().map(({ domain, blockedDirectives }) => [domain, blockedDirectives]),
    );

    expect(coverage.financial).toEqual([
      "reserve-compute",
      "acquire-energy",
      "procurement-mesh",
      "sovereign-grid",
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
    expect(coverage.public).toEqual(["transparency-report"]);
  });

  it("emits a JSON-serializable machine-readable report", () => {
    const suite = runBetaPacingSuite();
    const encoded = JSON.stringify(suite);
    console.info(`PACING_BASELINE_JSON=${encoded}`);
    expect(JSON.parse(encoded)).toEqual(suite);
  });
});
