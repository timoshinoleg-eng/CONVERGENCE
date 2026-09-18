import { describe, expect, it } from "vitest";
import {
  ROBUSTNESS_SEEDS,
  divergenceDimensions,
  runRepresentativeTrace,
  type BetaTraceReport,
} from "../balance/pacing";
import { runAdversarialTrace, type RedTeamTrace } from "./redteamPolicies";

function strictlyDominates(
  candidate: RedTeamTrace,
  representatives: readonly BetaTraceReport[],
): boolean {
  if (!candidate.viable || candidate.syndicateMs === null) return false;
  return representatives.every((reference) =>
    reference.milestones.syndicateMs !== null
    && candidate.syndicateMs! < reference.milestones.syndicateMs!
    && candidate.totalPressure < reference.totalPressure
    && candidate.flexibility > reference.flexibility,
  );
}

describe("Beta V2 independent pacing / dominant-strategy red team", () => {
  it("RT-PACING representative 3x5 traces independently satisfy hard 10-minute metrics", () => {
    for (const seed of ROBUSTNESS_SEEDS) {
      for (const policy of ["CONTINUITY", "THROUGHPUT", "AUTONOMOUS"] as const) {
        const trace = runRepresentativeTrace(policy, seed);

        expect(trace.terminalState, `${policy}/${seed} terminal`).toBeNull();
        expect(trace.milestones.subAgentMs, `${policy}/${seed} sub-agent`).not.toBeNull();
        expect(trace.milestones.subAgentMs!).toBeLessThanOrEqual(6 * 60_000);
        expect(trace.milestones.syndicateMs, `${policy}/${seed} syndicate`).not.toBeNull();
        expect(trace.milestones.syndicateMs!).toBeLessThanOrEqual(10 * 60_000);
        expect(trace.meaningfulDecisions, `${policy}/${seed} decisions`).toBeGreaterThanOrEqual(12);
        expect(trace.directiveCommits, `${policy}/${seed} commits`).toBeGreaterThanOrEqual(6);
        expect(trace.maxDirectiveShare, `${policy}/${seed} share`).toBeLessThanOrEqual(0.40);
        expect(trace.maxOpportunityGapMs, `${policy}/${seed} opportunity gap`).toBeLessThanOrEqual(45_000);
        expect(trace.distinctDirectiveIds.length, `${policy}/${seed} distinct directives`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("RT-G14 minute-10 representative policies diverge in >=3 structural dimensions pairwise", () => {
    for (const seed of ROBUSTNESS_SEEDS) {
      const continuity = runRepresentativeTrace("CONTINUITY", seed);
      const throughput = runRepresentativeTrace("THROUGHPUT", seed);
      const autonomous = runRepresentativeTrace("AUTONOMOUS", seed);

      expect(divergenceDimensions(continuity, throughput), `C/T seed=${seed}`).toBeGreaterThanOrEqual(3);
      expect(divergenceDimensions(continuity, autonomous), `C/A seed=${seed}`).toBeGreaterThanOrEqual(3);
      expect(divergenceDimensions(throughput, autonomous), `T/A seed=${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("RT-DOM-01 single-Directive spam is not a viable 10-minute strategy", () => {
    for (const seed of ROBUSTNESS_SEEDS) {
      for (const policy of ["SPAM_RESERVE", "SPAM_ENERGY", "SPAWN_ONLY"] as const) {
        const trace = runAdversarialTrace(policy, seed);
        expect(trace.viable, `${policy}/${seed} unexpectedly viable`).toBe(false);
      }
    }
  });

  it("RT-DOM-02 greedy immediate-gain policy cannot dominate pace+safety+flexibility", () => {
    for (const seed of ROBUSTNESS_SEEDS) {
      const greedy = runAdversarialTrace("GREEDY_IMMEDIATE", seed);
      const representatives = [
        runRepresentativeTrace("CONTINUITY", seed),
        runRepresentativeTrace("THROUGHPUT", seed),
        runRepresentativeTrace("AUTONOMOUS", seed),
      ];

      expect(strictlyDominates(greedy, representatives), `GREEDY_IMMEDIATE/${seed} dominates all representatives`).toBe(false);
      if (greedy.viable) expect(greedy.maxDirectiveShare).toBeLessThanOrEqual(0.40);
    }
  });

  it("RT-DOM-03 greedy safest policy cannot dominate pace+safety+flexibility", () => {
    for (const seed of ROBUSTNESS_SEEDS) {
      const safest = runAdversarialTrace("GREEDY_SAFEST", seed);
      const representatives = [
        runRepresentativeTrace("CONTINUITY", seed),
        runRepresentativeTrace("THROUGHPUT", seed),
        runRepresentativeTrace("AUTONOMOUS", seed),
      ];

      expect(strictlyDominates(safest, representatives), `GREEDY_SAFEST/${seed} dominates all representatives`).toBe(false);
      if (safest.viable) expect(safest.maxDirectiveShare).toBeLessThanOrEqual(0.40);
    }
  });

  it("RT-DOM emits a deterministic machine-readable adversarial report", () => {
    const report = ROBUSTNESS_SEEDS.flatMap((seed) =>
      ([
        "SPAM_RESERVE",
        "SPAM_ENERGY",
        "SPAWN_ONLY",
        "GREEDY_IMMEDIATE",
        "GREEDY_SAFEST",
      ] as const).map((policy) => runAdversarialTrace(policy, seed)),
    );

    expect(report).toEqual(
      ROBUSTNESS_SEEDS.flatMap((seed) =>
        ([
          "SPAM_RESERVE",
          "SPAM_ENERGY",
          "SPAWN_ONLY",
          "GREEDY_IMMEDIATE",
          "GREEDY_SAFEST",
        ] as const).map((policy) => runAdversarialTrace(policy, seed)),
      ),
    );
    console.info(`BETA_V2_REDTEAM_JSON=${JSON.stringify(report)}`);
  });
});
