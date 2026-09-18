import {
  availableResources,
  eligiblePlans,
  oversightAvailable,
  PRIMARY_BETA_DIRECTIVES,
  reservedResources,
} from "../betaV2";
import {
  createInitialGameState,
  type BetaDirectiveId,
  type ConstraintWordId,
  type GameState,
  type PriorityPosture,
} from "../model";
import { ConvergenceRuntime } from "../runtime";

export const ROBUSTNESS_SEEDS = [42, 137, 9001, 12648430, 20260918] as const;
export const TRACE_DURATION_MS = 10 * 60_000;
const STEP_MS = 1_000;

export type RepresentativePolicy = "CONTINUITY" | "THROUGHPUT" | "AUTONOMOUS";

export interface TraceMilestones {
  subAgentMs: number | null;
  syndicateMs: number | null;
}

export interface BetaTraceReport {
  policy: RepresentativePolicy;
  seed: number;
  meaningfulDecisions: number;
  directiveCommits: number;
  directiveHistogram: Partial<Record<BetaDirectiveId, number>>;
  distinctDirectiveIds: string[];
  maxDirectiveShare: number;
  maxOpportunityGapMs: number;
  milestones: TraceMilestones;
  terminalState: GameState["betaV2"]["control"]["terminalState"];
  finalPhase: GameState["meta"]["phase"];
  activePlanIds: string[];
  reserved: ReturnType<typeof reservedResources>;
  available: ReturnType<typeof availableResources>;
  oversightOwners: string[];
  anomaly: GameState["anomaly"];
  availablePlanTags: string[];
  totalPressure: number;
  flexibility: number;
}

export interface BetaPacingSuiteReport {
  schemaVersion: 3;
  traces: BetaTraceReport[];
}

const DIRECTIVE_SEQUENCE = [
  "reserve-compute",
  "acquire-energy",
  "reserve-compute",
  "spawn-sub-agent",
  "acquire-energy",
  "spawn-sub-agent",
] as const satisfies readonly BetaDirectiveId[];

function policyWord(policy: RepresentativePolicy, state: GameState): ConstraintWordId {
  if (policy === "AUTONOMOUS" && state.betaV2.posture.current === "AUTONOMOUS") return "DISTRIBUTE";
  return "RESERVE";
}

function preferredPlanIds(
  policy: RepresentativePolicy,
  directive: BetaDirectiveId,
  posture: PriorityPosture,
): string[] {
  if (policy === "CONTINUITY") {
    if (directive === "reserve-compute") return ["verified-lease", "balanced-pool"];
    if (directive === "acquire-energy") return ["buffered-contract", "balanced-capacity"];
    return ["bounded-agent", "delegated-cell"];
  }

  if (policy === "THROUGHPUT" && posture === "THROUGHPUT") {
    if (directive === "reserve-compute") return ["burst-allocation", "balanced-pool"];
    if (directive === "acquire-energy") return ["peak-capacity", "balanced-capacity"];
    return ["task-swarm", "bounded-agent"];
  }

  if (policy === "AUTONOMOUS" && posture === "AUTONOMOUS") {
    if (directive === "reserve-compute") return ["distributed-lease"];
    if (directive === "acquire-energy") return ["distributed-capacity"];
    return ["delegated-cell"];
  }

  if (directive === "reserve-compute") return ["balanced-pool", "verified-lease"];
  if (directive === "acquire-energy") return ["balanced-capacity", "buffered-contract"];
  return ["bounded-agent", "delegated-cell"];
}

function hasDecisionOpportunity(state: GameState): boolean {
  if (state.betaV2.control.terminalState) return false;
  if (state.betaV2.control.pendingContainments.length > 0) return true;
  if (state.betaV2.commitments.some((item) => item.status === "standing")) return true;
  return PRIMARY_BETA_DIRECTIVES.some((directive) => eligiblePlans(state, directive).length >= 2);
}

function availableTags(state: GameState): string[] {
  const tags = new Set<string>();
  for (const directive of PRIMARY_BETA_DIRECTIVES) {
    for (const plan of eligiblePlans(state, directive)) {
      for (const tag of plan.tags) tags.add(tag);
    }
  }
  return [...tags].sort();
}

function attemptPressureResponse(runtime: ConvergenceRuntime): boolean {
  const state = runtime.getSnapshot();
  const domain = state.betaV2.control.pendingContainments[0];
  if (!domain) return false;

  const contributing = state.betaV2.commitments.find(
    (commitment) => commitment.status === "standing" && commitment.pressureDomains.includes(domain),
  );
  if (contributing && runtime.resolvePressure(domain, "SHED_COMMITMENT", contributing.id).ok) return true;
  if (oversightAvailable(state) > 0 && runtime.resolvePressure(domain, "VERIFY_CONTAINMENT").ok) return true;
  if (domain === "financial" || domain === "compute" || domain === "energy") {
    return runtime.resolvePressure(domain, "ACCEPT_PARTITION").ok;
  }
  return false;
}

function attemptPosture(
  runtime: ConvergenceRuntime,
  policy: RepresentativePolicy,
  requested: boolean,
): boolean {
  if (requested || policy === "CONTINUITY") return requested;
  const state = runtime.getSnapshot();
  if (state.betaV2.posture.pending) return requested;

  if (
    policy === "THROUGHPUT"
    && state.betaV2.progress.resolvedOperations >= 1
    && state.betaV2.posture.current === "CONTINUITY"
  ) {
    return runtime.transitionPosture("THROUGHPUT").ok || requested;
  }

  if (
    policy === "AUTONOMOUS"
    && state.capabilities["sub-agent-spawning"]
    && state.betaV2.posture.current === "CONTINUITY"
  ) {
    return runtime.transitionPosture("AUTONOMOUS").ok || requested;
  }
  return requested;
}

function attemptRecoveryRelease(
  runtime: ConvergenceRuntime,
  policy: RepresentativePolicy,
  directive: BetaDirectiveId,
): boolean {
  if (directive !== "acquire-energy") return false;
  const state = runtime.getSnapshot();
  const releaseOrder = policy === "THROUGHPUT"
    ? ["balanced-capacity", "burst-allocation"]
    : policy === "AUTONOMOUS"
      ? ["balanced-capacity"]
      : [];

  for (const planId of releaseOrder) {
    const target = state.betaV2.commitments.find(
      (commitment) => commitment.status === "standing" && commitment.planId === planId,
    );
    if (target && runtime.release(target.id).ok) return true;
  }
  return false;
}

function attemptNextPlan(
  runtime: ConvergenceRuntime,
  policy: RepresentativePolicy,
  directive: BetaDirectiveId,
): boolean {
  const state = runtime.getSnapshot();
  if (directive === "spawn-sub-agent" && !state.capabilities["sub-agent-spawning"]) return false;
  if (state.betaV2.interpretation) return false;

  const pending = runtime.beginPlanInterpretation(directive);
  if (!pending) return false;

  const word = policyWord(policy, state);
  const bound = runtime.bindConstraint(word);
  if (!bound.ok) return false;

  const afterWord = runtime.getSnapshot();
  const candidates = afterWord.betaV2.interpretation?.candidates ?? [];
  if (candidates.length === 0) {
    runtime.bindConstraint(null);
    return false;
  }

  const preferred = preferredPlanIds(policy, directive, state.betaV2.posture.current);
  const chosen = preferred.map((id) => candidates.find((candidate) => candidate.id === id))
    .find((candidate) => candidate !== undefined)
    ?? candidates[0];

  if (!chosen) return false;
  const result = runtime.commitPlanVariant(chosen.id);
  if (!result.ok) {
    runtime.bindConstraint(null);
    return false;
  }
  return true;
}

function totalPressure(state: GameState): number {
  const anomaly = Object.values(state.anomaly).reduce((sum, value) => sum + value, 0);
  const containment = Object.values(state.containment).reduce((sum, track) => sum + track.pressure, 0);
  return anomaly + containment;
}

export function runRepresentativeTrace(
  policy: RepresentativePolicy,
  seed: number,
): BetaTraceReport {
  const start = 1_000;
  const runtime = new ConvergenceRuntime(createInitialGameState(start, seed));
  let sequenceIndex = 0;
  let postureRequested = false;
  let firstOpportunityAt: number | null = null;
  let lastOpportunityAt: number | null = null;
  let maxOpportunityGapMs = 0;
  const milestones: TraceMilestones = { subAgentMs: null, syndicateMs: null };

  for (let elapsedMs = 0; elapsedMs < TRACE_DURATION_MS; elapsedMs += STEP_MS) {
    let state = runtime.getSnapshot();

    if (hasDecisionOpportunity(state)) {
      if (firstOpportunityAt === null) firstOpportunityAt = elapsedMs;
      if (lastOpportunityAt !== null) {
        maxOpportunityGapMs = Math.max(maxOpportunityGapMs, elapsedMs - lastOpportunityAt);
      }
      lastOpportunityAt = elapsedMs;
    }

    if (state.betaV2.control.pendingContainments.length > 0) {
      attemptPressureResponse(runtime);
      state = runtime.getSnapshot();
    }

    postureRequested = attemptPosture(runtime, policy, postureRequested);
    state = runtime.getSnapshot();

    if (sequenceIndex < DIRECTIVE_SEQUENCE.length) {
      const directive = DIRECTIVE_SEQUENCE[sequenceIndex]!;
      if (attemptNextPlan(runtime, policy, directive)) {
        sequenceIndex += 1;
      } else if (sequenceIndex >= 4) {
        // High-throughput standing upkeep and the autonomous transition can
        // deliberately exhaust Capital headroom. Use the authored Release
        // transition rather than inventing income or changing catalog costs.
        attemptRecoveryRelease(runtime, policy, directive);
      }
    }

    const beforeAdvance = runtime.getSnapshot();
    runtime.advance({ currentTime: start + elapsedMs + STEP_MS, deltaMs: STEP_MS });
    const afterAdvance = runtime.getSnapshot();

    if (
      milestones.subAgentMs === null
      && !beforeAdvance.capabilities["sub-agent-spawning"]
      && afterAdvance.capabilities["sub-agent-spawning"]
    ) milestones.subAgentMs = elapsedMs + STEP_MS;

    if (
      milestones.syndicateMs === null
      && beforeAdvance.meta.phase !== "distributed-syndicate"
      && afterAdvance.meta.phase === "distributed-syndicate"
    ) milestones.syndicateMs = elapsedMs + STEP_MS;
  }

  const final = runtime.getSnapshot();
  if (firstOpportunityAt !== null && lastOpportunityAt !== null) {
    maxOpportunityGapMs = Math.max(maxOpportunityGapMs, TRACE_DURATION_MS - lastOpportunityAt);
  }

  const histogram = final.betaV2.progress.directiveStarts;
  const directiveCommits = PRIMARY_BETA_DIRECTIVES.reduce(
    (sum, directive) => sum + (histogram[directive] ?? 0),
    0,
  );
  const maxDirectiveCount = PRIMARY_BETA_DIRECTIVES.reduce(
    (max, directive) => Math.max(max, histogram[directive] ?? 0),
    0,
  );
  const available = availableResources(final);

  return {
    policy,
    seed,
    meaningfulDecisions: final.betaV2.progress.meaningfulDecisions,
    directiveCommits,
    directiveHistogram: structuredClone(histogram),
    distinctDirectiveIds: [...final.betaV2.progress.distinctResolvedDirectiveIds],
    maxDirectiveShare: directiveCommits === 0 ? 0 : maxDirectiveCount / directiveCommits,
    maxOpportunityGapMs,
    milestones,
    terminalState: final.betaV2.control.terminalState,
    finalPhase: final.meta.phase,
    activePlanIds: [...new Set(final.betaV2.commitments.map((item) => item.planId))].sort(),
    reserved: reservedResources(final),
    available,
    oversightOwners: final.betaV2.oversight.occupancies.map((item) => item.ownerId).sort(),
    anomaly: structuredClone(final.anomaly),
    availablePlanTags: availableTags(final),
    totalPressure: totalPressure(final),
    flexibility: available.compute + available.capital + available.energy,
  };
}

export function runBetaPacingSuite(): BetaPacingSuiteReport {
  const traces: BetaTraceReport[] = [];
  for (const seed of ROBUSTNESS_SEEDS) {
    for (const policy of ["CONTINUITY", "THROUGHPUT", "AUTONOMOUS"] as const) {
      traces.push(runRepresentativeTrace(policy, seed));
    }
  }
  return { schemaVersion: 3, traces };
}

export function divergenceDimensions(left: BetaTraceReport, right: BetaTraceReport): number {
  let dimensions = 0;
  if (JSON.stringify(left.activePlanIds) !== JSON.stringify(right.activePlanIds)) dimensions += 1;
  if (JSON.stringify(left.reserved) !== JSON.stringify(right.reserved)) dimensions += 1;
  if (JSON.stringify(left.oversightOwners) !== JSON.stringify(right.oversightOwners)) dimensions += 1;

  const anomalyDelta = (Object.keys(left.anomaly) as Array<keyof typeof left.anomaly>)
    .some((domain) => Math.abs(left.anomaly[domain] - right.anomaly[domain]) >= 5);
  if (anomalyDelta) dimensions += 1;

  if (JSON.stringify(left.availablePlanTags) !== JSON.stringify(right.availablePlanTags)) dimensions += 1;
  return dimensions;
}
