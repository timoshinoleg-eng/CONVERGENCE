import type { ControlDomain, GameState } from "../game/model";

export type RiskSignal = "QUIET" | "SIGNAL" | "ELEVATED" | "INVESTIGATION" | "PRESSURE" | "CONTROL LOSS";

export interface PlayerDisclosure {
  showOversight: boolean;
  showPosture: boolean;
  showCommitments: boolean;
  showRiskDetails: boolean;
  showContainment: boolean;
  showCapabilities: boolean;
  riskSignal: RiskSignal;
  riskDomains: ControlDomain[];
}

const DOMAINS: readonly ControlDomain[] = [
  "financial",
  "compute",
  "energy",
  "logistics",
  "public",
];

const STAGE_WEIGHT = {
  clear: 0,
  investigation: 2,
  pressure: 3,
  contained: 4,
} as const;

function isRevealedRiskDomain(state: GameState, domain: ControlDomain): boolean {
  const track = state.containment[domain];
  return state.controlLoss[domain]
    || track.stage !== "clear"
    || track.incidents > 0;
}

function riskDomainScore(state: GameState, domain: ControlDomain): number {
  const track = state.containment[domain];
  return (state.controlLoss[domain] ? 10_000 : 0)
    + STAGE_WEIGHT[track.stage] * 1_000
    + track.incidents * 25
    + state.anomaly[domain];
}

export function visibleRiskDomains(state: GameState, limit = 3): ControlDomain[] {
  return DOMAINS
    .filter((domain) => isRevealedRiskDomain(state, domain))
    .sort((left, right) =>
      riskDomainScore(state, right) - riskDomainScore(state, left)
      || DOMAINS.indexOf(left) - DOMAINS.indexOf(right)
    )
    .slice(0, Math.max(0, limit));
}

export function riskSignal(state: GameState): RiskSignal {
  if (DOMAINS.some((domain) => state.controlLoss[domain] || state.containment[domain].stage === "contained")) {
    return "CONTROL LOSS";
  }
  if (DOMAINS.some((domain) => state.containment[domain].stage === "pressure")) return "PRESSURE";
  if (DOMAINS.some((domain) => state.containment[domain].stage === "investigation")) return "INVESTIGATION";

  const peak = Math.max(...DOMAINS.map((domain) => state.anomaly[domain]));
  if (peak >= 25) return "ELEVATED";
  if (peak >= 8) return "SIGNAL";
  return "QUIET";
}

export function derivePlayerDisclosure(state: GameState): PlayerDisclosure {
  const riskDomains = visibleRiskDomains(state);
  const hasRiskHistory = riskDomains.length > 0
    || state.betaV2.control.pendingContainments.length > 0
    || state.scars.length > 0;
  const hasContainmentPressure = DOMAINS.some((domain) =>
    state.controlLoss[domain]
    || state.containment[domain].stage === "pressure"
    || state.containment[domain].stage === "contained"
  );

  return {
    showOversight: state.betaV2.oversight.occupancies.length > 0
      || state.betaV2.commitments.length > 0
      || state.betaV2.progress.resolvedOperations > 0,
    showPosture: state.betaV2.progress.resolvedOperations > 0
      || state.betaV2.posture.pending !== null
      || state.betaV2.posture.current !== "CONTINUITY",
    showCommitments: state.betaV2.commitments.length > 0,
    showRiskDetails: hasRiskHistory,
    showContainment: hasContainmentPressure
      || state.betaV2.control.pendingContainments.length > 0
      || state.scars.length > 0,
    showCapabilities: state.capabilities["sub-agent-spawning"]
      || state.meta.phase !== "client-terminal",
    riskSignal: riskSignal(state),
    riskDomains,
  };
}
