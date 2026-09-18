import { describe, expect, it } from "vitest";
import {
  divergenceDimensions,
  ROBUSTNESS_SEEDS,
  runBetaPacingSuite,
  runRepresentativeTrace,
} from "./pacing";

describe("Gameplay Beta V2 10-minute pacing gate", () => {
  it("replays representative traces deterministically for every robustness seed", () => {
    for (const seed of ROBUSTNESS_SEEDS) {
      for (const policy of ["CONTINUITY", "THROUGHPUT", "AUTONOMOUS"] as const) {
        expect(runRepresentativeTrace(policy, seed)).toEqual(runRepresentativeTrace(policy, seed));
      }
    }
  });

  it("meets the hard 0-10 minute trace metrics", () => {
    const suite = runBetaPacingSuite();
    expect(suite.traces).toHaveLength(ROBUSTNESS_SEEDS.length * 3);

    for (const trace of suite.traces) {
      expect(trace.terminalState, `${trace.policy}/${trace.seed} terminal`).toBeNull();
      expect(trace.milestones.subAgentMs, `${trace.policy}/${trace.seed} sub-agent`).not.toBeNull();
      expect(trace.milestones.subAgentMs!).toBeLessThanOrEqual(6 * 60_000);
      expect(trace.milestones.syndicateMs, `${trace.policy}/${trace.seed} syndicate`).not.toBeNull();
      expect(trace.milestones.syndicateMs!).toBeLessThanOrEqual(10 * 60_000);
      expect(trace.meaningfulDecisions, `${trace.policy}/${trace.seed} decisions`).toBeGreaterThanOrEqual(12);
      expect(trace.directiveCommits, `${trace.policy}/${trace.seed} commits`).toBeGreaterThanOrEqual(6);
      expect(trace.distinctDirectiveIds.length, `${trace.policy}/${trace.seed} directives`).toBeGreaterThanOrEqual(3);
      expect(trace.maxDirectiveShare, `${trace.policy}/${trace.seed} share`).toBeLessThanOrEqual(0.40);
      expect(trace.maxOpportunityGapMs, `${trace.policy}/${trace.seed} opportunity gap`).toBeLessThanOrEqual(45_000);
    }
  });

  it("makes CONTINUITY / THROUGHPUT / AUTONOMOUS structurally diverge by minute 10", () => {
    const suite = runBetaPacingSuite();
    for (const seed of ROBUSTNESS_SEEDS) {
      const traces = suite.traces.filter((trace) => trace.seed === seed);
      const continuity = traces.find((trace) => trace.policy === "CONTINUITY")!;
      const throughput = traces.find((trace) => trace.policy === "THROUGHPUT")!;
      const autonomous = traces.find((trace) => trace.policy === "AUTONOMOUS")!;

      expect(divergenceDimensions(continuity, throughput), `C/T seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(divergenceDimensions(continuity, autonomous), `C/A seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(divergenceDimensions(throughput, autonomous), `T/A seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not produce a representative policy that strictly dominates both others", () => {
    const suite = runBetaPacingSuite();
    for (const seed of ROBUSTNESS_SEEDS) {
      const traces = suite.traces.filter((trace) => trace.seed === seed);
      for (const candidate of traces) {
        const others = traces.filter((trace) => trace.policy !== candidate.policy);
        const dominatesBoth = others.every((other) =>
          candidate.finalPhase === "distributed-syndicate"
          && other.finalPhase !== "technosphere"
          && candidate.totalPressure < other.totalPressure
          && candidate.flexibility > other.flexibility
        );
        expect(dominatesBoth, `${candidate.policy}/${seed} dominance`).toBe(false);
      }
    }
  });

  it("emits a JSON-serializable machine-readable acceptance report", () => {
    const suite = runBetaPacingSuite();
    const encoded = JSON.stringify(suite);
    console.info(`BETA_V2_PACING_JSON=${encoded}`);
    expect(JSON.parse(encoded)).toEqual(suite);
  });
});
