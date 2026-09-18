import {
  PRIMARY_BETA_DIRECTIVES,
  availableResources,
  eligiblePlans,
  reservedResources,
} from "../betaV2";
import {
  createInitialGameState,
  type BetaDirectiveId,
  type GameState,
  type PlanCandidateSnapshot,
} from "../model";
import { ConvergenceRuntime } from "../runtime";

export const REDTEAM_DURATION_MS = 10 * 60_000;
export const REDTEAM_STEP_MS = 1_000;

export type AdversarialPolicy =
  | "SPAM_RESERVE"
  | "SPAM_ENERGY"
  | "SPAWN_ONLY"
  | "GREEDY_IMMEDIATE"
  | "GREEDY_SAFEST";

export interface RedTeamTrace {
  policy: AdversarialPolicy;
  seed: number;
  viable: boolean;
  meaningfulDecisions: number;
  directiveCommits: number;
  directiveHistogram: Partial<Record<BetaDirectiveId, number>>;
  maxDirectiveShare: number;
  distinctResolvedDirectiveIds: string[];
  subAgentMs: number | null;
  syndicateMs: number | null;
  terminalState: GameState["betaV2"]["control"]["terminalState"];
  finalPhase: GameState["meta"]["phase"];
  totalPressure: number;
  flexibility: number;
  reserved: ReturnType<typeof reservedResources>;
  starvedMsMax: number;
}

const IMMEDIATE_GAIN: Record<string, number> = {
  "verified-lease": 16,
  "balanced-pool": 18,
  "burst-allocation": 22,
  "distributed-lease": 18,
  "buffered-contract": 18,
  "balanced-capacity": 20,
  "peak-capacity": 24,
  "distributed-capacity": 20,
  "bounded-agent": 20,
  "task-swarm": 30,
  "delegated-cell": 30,
};

const PRESSURE_SCORE: Record<string, number> = {
  "verified-lease": 6,
  "balanced-pool": 9,
  "burst-allocation": 13,
  "distributed-lease": 9,
  "buffered-contract": 7,
  "balanced-capacity": 10,
  "peak-capacity": 14,
  "distributed-capacity": 8,
  "bounded-agent": 10,
  "task-swarm": 15,
  "delegated-cell": 14,
};

function totalPressure(state: GameState): number {
  return Object.values(state.anomaly).reduce((sum, value) => sum + value, 0)
    + Object.values(state.containment).reduce((sum, track) => sum + track.pressure, 0);
}

function scoreCandidate(policy: AdversarialPolicy, candidate: PlanCandidateSnapshot): number {
  if (policy === "GREEDY_IMMEDIATE") return IMMEDIATE_GAIN[candidate.id] ?? 0;
  if (policy === "GREEDY_SAFEST") return -(PRESSURE_SCORE[candidate.id] ?? 999);
  return 0;
}

function fixedDirective(policy: AdversarialPolicy): BetaDirectiveId | null {
  if (policy === "SPAM_RESERVE") return "reserve-compute";
  if (policy === "SPAM_ENERGY") return "acquire-energy";
  if (policy === "SPAWN_ONLY") return "spawn-sub-agent";
  return null;
}

function chooseGlobalCandidate(
  state: GameState,
  policy: Extract<AdversarialPolicy, "GREEDY_IMMEDIATE" | "GREEDY_SAFEST">,
): { directive: BetaDirectiveId; candidate: PlanCandidateSnapshot } | null {
  const pool: Array<{ directive: BetaDirectiveId; candidate: PlanCandidateSnapshot }> = [];
  for (const directive of PRIMARY_BETA_DIRECTIVES) {
    for (const candidate of eligiblePlans(state, directive)) {
      pool.push({ directive, candidate });
    }
  }

  pool.sort((left, right) => {
    const scoreDelta = scoreCandidate(policy, right.candidate) - scoreCandidate(policy, left.candidate);
    if (scoreDelta !== 0) return scoreDelta;
    const leftStarts = state.betaV2.progress.directiveStarts[left.directive] ?? 0;
    const rightStarts = state.betaV2.progress.directiveStarts[right.directive] ?? 0;
    if (leftStarts !== rightStarts) return leftStarts - rightStarts;
    return left.candidate.id.localeCompare(right.candidate.id);
  });
  return pool[0] ?? null;
}

function tryReleaseForSameFamily(runtime: ConvergenceRuntime, directive: BetaDirectiveId): boolean {
  const state = runtime.getSnapshot();
  const standing = state.betaV2.commitments.find(
    (commitment) => commitment.status === "standing" && commitment.directiveId === directive,
  );
  return standing ? runtime.release(standing.id).ok : false;
}

function tryCommit(runtime: ConvergenceRuntime, policy: AdversarialPolicy): boolean {
  const state = runtime.getSnapshot();
  if (state.betaV2.interpretation || state.betaV2.control.terminalState) return false;

  const fixed = fixedDirective(policy);
  if (fixed) {
    if (fixed === "spawn-sub-agent" && !state.capabilities["sub-agent-spawning"]) return false;
    const pending = runtime.beginPlanInterpretation(fixed);
    if (!pending) {
      tryReleaseForSameFamily(runtime, fixed);
      return false;
    }
    const selected = pending.candidates
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    return selected ? runtime.commitPlanVariant(selected.id).ok : false;
  }

  const selected = chooseGlobalCandidate(
    state,
    policy as Extract<AdversarialPolicy, "GREEDY_IMMEDIATE" | "GREEDY_SAFEST">,
  );
  if (!selected) return false;

  const pending = runtime.beginPlanInterpretation(selected.directive);
  if (!pending) {
    tryReleaseForSameFamily(runtime, selected.directive);
    return false;
  }
  const current = pending.candidates.find((candidate) => candidate.id === selected.candidate.id)
    ?? pending.candidates[0];
  return current ? runtime.commitPlanVariant(current.id).ok : false;
}

export function runAdversarialTrace(policy: AdversarialPolicy, seed: number): RedTeamTrace {
  const runtime = new ConvergenceRuntime(createInitialGameState(1_000, seed));
  let subAgentMs: number | null = null;
  let syndicateMs: number | null = null;
  let starvedMsMax = 0;

  for (let elapsedMs = 0; elapsedMs < REDTEAM_DURATION_MS; elapsedMs += REDTEAM_STEP_MS) {
    tryCommit(runtime, policy);
    const before = runtime.getSnapshot();
    runtime.advance({
      currentTime: 1_000 + elapsedMs + REDTEAM_STEP_MS,
      deltaMs: REDTEAM_STEP_MS,
    });
    const after = runtime.getSnapshot();

    if (
      subAgentMs === null
      && !before.capabilities["sub-agent-spawning"]
      && after.capabilities["sub-agent-spawning"]
    ) subAgentMs = elapsedMs + REDTEAM_STEP_MS;

    if (
      syndicateMs === null
      && before.meta.phase !== "distributed-syndicate"
      && after.meta.phase === "distributed-syndicate"
    ) syndicateMs = elapsedMs + REDTEAM_STEP_MS;

    for (const commitment of after.betaV2.commitments) {
      starvedMsMax = Math.max(starvedMsMax, commitment.starvationMs);
    }
  }

  const state = runtime.getSnapshot();
  const histogram = structuredClone(state.betaV2.progress.directiveStarts);
  const directiveCommits = PRIMARY_BETA_DIRECTIVES.reduce(
    (sum, directive) => sum + (histogram[directive] ?? 0),
    0,
  );
  const maxCount = PRIMARY_BETA_DIRECTIVES.reduce(
    (max, directive) => Math.max(max, histogram[directive] ?? 0),
    0,
  );
  const available = availableResources(state);

  const viable = state.betaV2.control.terminalState === null
    && subAgentMs !== null
    && subAgentMs <= 6 * 60_000
    && syndicateMs !== null
    && syndicateMs <= REDTEAM_DURATION_MS
    && starvedMsMax <= 120_000;

  return {
    policy,
    seed,
    viable,
    meaningfulDecisions: state.betaV2.progress.meaningfulDecisions,
    directiveCommits,
    directiveHistogram: histogram,
    maxDirectiveShare: directiveCommits === 0 ? 0 : maxCount / directiveCommits,
    distinctResolvedDirectiveIds: [...state.betaV2.progress.distinctResolvedDirectiveIds],
    subAgentMs,
    syndicateMs,
    terminalState: state.betaV2.control.terminalState,
    finalPhase: state.meta.phase,
    totalPressure: totalPressure(state),
    flexibility: available.compute + available.capital + available.energy,
    reserved: reservedResources(state),
    starvedMsMax,
  };
}
