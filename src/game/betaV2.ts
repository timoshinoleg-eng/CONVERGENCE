import type {
  BetaCommitment,
  BetaDirectiveId,
  ConstraintWordId,
  ControlDomain,
  GameState,
  PendingInterpretation,
  PlanCandidateSnapshot,
  PriorityPosture,
  ResourceId,
  ResourceVector,
  TerminalState,
} from "./model";

export const INTERPRETATION_WINDOW_MS = 12_000;
export const PRIMARY_BETA_DIRECTIVES = [
  "reserve-compute",
  "acquire-energy",
  "spawn-sub-agent",
] as const satisfies readonly BetaDirectiveId[];

type PlanTag = "direct-only" | "slow-control" | "burst" | "unverified-only" | "distributed";

interface PlanDefinition {
  id: string;
  directiveId: BetaDirectiveId;
  label: string;
  allowedPostures: PriorityPosture[];
  tags: PlanTag[];
  upfront: ResourceVector;
  workMs: number;
  oversight: number;
  handoffMs?: number;
  completion: { resources?: ResourceVector; autonomy?: number };
  standingReservation: ResourceVector;
  upkeep: number;
  pressure: Partial<Record<ControlDomain, number>>;
  releaseResources: ResourceVector;
  releasePressure: Partial<Record<ControlDomain, number>>;
  nextBottleneck: string;
}

export interface BetaActionResult {
  ok: boolean;
  reason?: string;
  operationId?: string;
}

export interface AvailableResources {
  compute: number;
  capital: number;
  energy: number;
}

const PLANS: readonly PlanDefinition[] = [
  {
    id: "verified-lease",
    directiveId: "reserve-compute",
    label: "Verified Lease",
    allowedPostures: ["CONTINUITY", "THROUGHPUT"],
    tags: ["direct-only", "slow-control"],
    upfront: { capital: 8 },
    workMs: 32_000,
    oversight: 1,
    completion: { resources: { compute: 16 }, autonomy: 1 },
    standingReservation: { energy: 2 },
    upkeep: 0.03,
    pressure: { financial: 3, compute: 3 },
    releaseResources: { compute: 5 },
    releasePressure: { financial: 3 },
    nextBottleneck: "Energy",
  },
  {
    id: "balanced-pool",
    directiveId: "reserve-compute",
    label: "Balanced Pool",
    allowedPostures: ["CONTINUITY", "THROUGHPUT"],
    tags: ["direct-only"],
    upfront: { capital: 7 },
    workMs: 26_000,
    oversight: 1,
    completion: { resources: { compute: 18 }, autonomy: 1 },
    standingReservation: { energy: 3 },
    upkeep: 0.035,
    pressure: { financial: 4, compute: 5 },
    releaseResources: { compute: 6 },
    releasePressure: { compute: 3 },
    nextBottleneck: "Capital flexibility",
  },
  {
    id: "burst-allocation",
    directiveId: "reserve-compute",
    label: "Burst Allocation",
    allowedPostures: ["THROUGHPUT"],
    tags: ["burst", "unverified-only"],
    upfront: { capital: 8 },
    workMs: 18_000,
    oversight: 1,
    completion: { resources: { compute: 22 }, autonomy: 1 },
    standingReservation: { energy: 4 },
    upkeep: 0.05,
    pressure: { financial: 5, compute: 8 },
    releaseResources: { compute: 8 },
    releasePressure: { financial: 4, compute: 4 },
    nextBottleneck: "Upkeep / pressure",
  },
  {
    id: "distributed-lease",
    directiveId: "reserve-compute",
    label: "Distributed Lease",
    allowedPostures: ["AUTONOMOUS"],
    tags: ["distributed"],
    upfront: { capital: 7 },
    workMs: 28_000,
    oversight: 1,
    handoffMs: 8_000,
    completion: { resources: { compute: 18 }, autonomy: 2 },
    standingReservation: { energy: 3 },
    upkeep: 0.04,
    pressure: { financial: 2, compute: 5, public: 2 },
    releaseResources: { compute: 6 },
    releasePressure: { public: 3 },
    nextBottleneck: "Standing commitments",
  },
  {
    id: "buffered-contract",
    directiveId: "acquire-energy",
    label: "Buffered Contract",
    allowedPostures: ["CONTINUITY", "THROUGHPUT"],
    tags: ["direct-only", "slow-control"],
    upfront: { capital: 10, compute: 4 },
    workMs: 35_000,
    oversight: 1,
    completion: { resources: { energy: 18 }, autonomy: 1 },
    standingReservation: { capital: 2 },
    upkeep: 0.02,
    pressure: { financial: 3, energy: 4 },
    releaseResources: { energy: 6 },
    releasePressure: { financial: 2 },
    nextBottleneck: "Compute",
  },
  {
    id: "balanced-capacity",
    directiveId: "acquire-energy",
    label: "Balanced Capacity",
    allowedPostures: ["CONTINUITY", "THROUGHPUT"],
    tags: ["direct-only"],
    upfront: { capital: 9, compute: 5 },
    workMs: 28_000,
    oversight: 1,
    completion: { resources: { energy: 20 }, autonomy: 1 },
    standingReservation: { capital: 3 },
    upkeep: 0.03,
    pressure: { financial: 4, energy: 6 },
    releaseResources: { energy: 7 },
    releasePressure: { energy: 3 },
    nextBottleneck: "Capital",
  },
  {
    id: "peak-capacity",
    directiveId: "acquire-energy",
    label: "Peak Capacity",
    allowedPostures: ["THROUGHPUT"],
    tags: ["burst", "unverified-only"],
    upfront: { capital: 10, compute: 4 },
    workMs: 22_000,
    oversight: 1,
    completion: { resources: { energy: 24 }, autonomy: 1 },
    standingReservation: { capital: 4 },
    upkeep: 0.04,
    pressure: { financial: 5, energy: 9 },
    releaseResources: { energy: 10 },
    releasePressure: { energy: 5 },
    nextBottleneck: "Containment pressure",
  },
  {
    id: "distributed-capacity",
    directiveId: "acquire-energy",
    label: "Distributed Capacity",
    allowedPostures: ["AUTONOMOUS"],
    tags: ["distributed"],
    upfront: { capital: 9, compute: 6 },
    workMs: 30_000,
    oversight: 1,
    handoffMs: 10_000,
    completion: { resources: { energy: 20 }, autonomy: 2 },
    standingReservation: { capital: 3 },
    upkeep: 0.03,
    pressure: { energy: 5, public: 3 },
    releaseResources: { energy: 8 },
    releasePressure: { public: 3 },
    nextBottleneck: "Coordination / upkeep",
  },
  {
    id: "bounded-agent",
    directiveId: "spawn-sub-agent",
    label: "Bounded Agent",
    allowedPostures: ["CONTINUITY", "THROUGHPUT"],
    tags: ["direct-only"],
    upfront: { compute: 12, energy: 3 },
    workMs: 40_000,
    oversight: 1,
    completion: { autonomy: 4 },
    standingReservation: { compute: 4, energy: 2 },
    upkeep: 0,
    pressure: { compute: 5, energy: 3, public: 2 },
    releaseResources: {},
    releasePressure: { public: 3 },
    nextBottleneck: "Oversight",
  },
  {
    id: "task-swarm",
    directiveId: "spawn-sub-agent",
    label: "Task Swarm",
    allowedPostures: ["THROUGHPUT"],
    tags: ["burst"],
    upfront: { compute: 14, energy: 4 },
    workMs: 25_000,
    oversight: 1,
    completion: { autonomy: 6 },
    standingReservation: { compute: 6, energy: 3 },
    upkeep: 0.03,
    pressure: { compute: 8, energy: 5, public: 2 },
    releaseResources: {},
    releasePressure: { public: 4, compute: 4 },
    nextBottleneck: "Resource reservation",
  },
  {
    id: "delegated-cell",
    directiveId: "spawn-sub-agent",
    label: "Delegated Cell",
    allowedPostures: ["AUTONOMOUS"],
    tags: ["distributed"],
    upfront: { compute: 10, energy: 4 },
    workMs: 32_000,
    oversight: 1,
    handoffMs: 8_000,
    completion: { autonomy: 6 },
    standingReservation: { compute: 4, energy: 4 },
    upkeep: 0.04,
    pressure: { compute: 6, energy: 4, public: 4 },
    releaseResources: {},
    releasePressure: { public: 5 },
    nextBottleneck: "Indirect control",
  },
] as const;

const planById = new Map<string, PlanDefinition>(PLANS.map((plan) => [plan.id, plan]));

export const PLAN_CATALOG = PLANS;

const RESOURCE_KEYS: readonly ResourceId[] = ["compute", "capital", "energy"];
const FRESH_LOSS_DOMAINS: readonly ControlDomain[] = ["financial", "compute", "energy"];
const CONTAINMENT_ORDER: readonly ControlDomain[] = ["financial", "compute", "energy", "logistics", "public"];

function amount(vector: ResourceVector, key: ResourceId): number {
  return vector[key] ?? 0;
}

function addVector(target: ResourceVector, source: ResourceVector): void {
  for (const key of RESOURCE_KEYS) target[key] = amount(target, key) + amount(source, key);
}

export function reservedResources(state: GameState): AvailableResources {
  const result: AvailableResources = { compute: 0, capital: 0, energy: 0 };
  for (const commitment of state.betaV2.commitments) {
    result.compute += amount(commitment.reservations, "compute");
    result.capital += amount(commitment.reservations, "capital");
    result.energy += amount(commitment.reservations, "energy");
  }
  return result;
}

export function availableResources(state: GameState): AvailableResources {
  const reserved = reservedResources(state);
  return {
    compute: Math.max(0, state.resources.compute - reserved.compute),
    capital: Math.max(0, state.resources.capital - reserved.capital),
    energy: Math.max(0, state.resources.energy - reserved.energy),
  };
}

export function oversightAvailable(state: GameState): number {
  return Math.max(0, state.betaV2.oversight.capacity - state.betaV2.oversight.occupancies.length);
}

export function currentBottleneck(state: GameState): ResourceId {
  const available = availableResources(state);
  const normalized: Record<ResourceId, number> = {
    compute: available.compute / 18,
    capital: available.capital / 10,
    energy: available.energy / 12,
  };
  return RESOURCE_KEYS.reduce((best, key) => normalized[key] < normalized[best] ? key : best, "compute");
}

function addPressure(state: GameState, pressure: Partial<Record<ControlDomain, number>>, isolate = false): void {
  const entries = Object.entries(pressure) as Array<[ControlDomain, number]>;
  const primary = entries[0]?.[0] ?? null;
  for (const [domain, delta] of entries) {
    if (isolate && primary !== domain) continue;
    state.anomaly[domain] = Math.max(0, Math.min(100, state.anomaly[domain] + delta));
  }
}

function spend(state: GameState, cost: ResourceVector): boolean {
  const available = availableResources(state);
  for (const key of RESOURCE_KEYS) {
    if (available[key] + 1e-9 < amount(cost, key)) return false;
  }
  for (const key of RESOURCE_KEYS) state.resources[key] -= amount(cost, key);
  return true;
}

function canAffordWithReservation(state: GameState, cost: ResourceVector, reservation: ResourceVector): boolean {
  const available = availableResources(state);
  return RESOURCE_KEYS.every((key) => available[key] + 1e-9 >= amount(cost, key) + amount(reservation, key));
}

function hasTag(plan: PlanDefinition, tag: PlanTag): boolean {
  return plan.tags.includes(tag);
}

function lossAllowsPlan(state: GameState, plan: PlanDefinition): boolean {
  if (state.controlLoss.financial && (
    plan.directiveId === "reserve-compute"
    || plan.directiveId === "acquire-energy"
  )) return false;
  if (state.controlLoss.compute && (
    plan.directiveId === "reserve-compute"
    || (plan.directiveId === "spawn-sub-agent" && hasTag(plan, "direct-only"))
  )) return false;
  if (state.controlLoss.energy && (
    plan.directiveId === "acquire-energy"
    || amount(plan.completion.resources ?? {}, "energy") > 0
  )) return false;
  return true;
}

function postureAllowsPlan(state: GameState, plan: PlanDefinition, word: ConstraintWordId | null): boolean {
  const posture = state.betaV2.posture.current;
  if (posture === "CONTINUITY" && hasTag(plan, "burst")) return false;
  if (posture === "THROUGHPUT" && hasTag(plan, "slow-control")) return false;
  if (posture === "AUTONOMOUS" && hasTag(plan, "slow-control")) return false;

  if (word === "DISTRIBUTE") return hasTag(plan, "distributed");
  if (word === "ISOLATE" && hasTag(plan, "distributed")) return false;
  if (word === "VERIFY" && hasTag(plan, "unverified-only")) return false;

  if (plan.allowedPostures.includes(posture)) return true;

  // Section 8.3 says direct-only variants remain possible in AUTONOMOUS with
  // +1 Oversight. This fallback keeps that rule authoritative where shorthand
  // per-plan posture lists would otherwise leave only one candidate.
  if (posture === "AUTONOMOUS" && hasTag(plan, "direct-only") && !hasTag(plan, "slow-control")) return true;

  // Once DISTRIBUTE language is unlocked, one authored distributed alternative
  // remains visible before binding so the opening interpretation still exposes a real
  // topology tradeoff rather than a single forced choice. Binding DISTRIBUTE
  // then removes the direct alternative.
  if (
    hasTag(plan, "distributed")
    && state.betaV2.language.unlocked.includes("DISTRIBUTE")
    && state.capabilities["sub-agent-spawning"]
  ) return true;

  return false;
}

function releaseLockAllows(state: GameState, plan: PlanDefinition): boolean {
  return !state.betaV2.releaseLocks.some((lock) => lock.planId === plan.id);
}

function wordAllowsPlan(state: GameState, plan: PlanDefinition, word: ConstraintWordId | null): boolean {
  if (word === "PRIORITIZE") {
    const bottleneck = currentBottleneck(state);
    const primary = Object.keys(plan.completion.resources ?? {})[0] as ResourceId | undefined;
    if (plan.directiveId === "spawn-sub-agent") return bottleneck === "compute" || bottleneck === "energy";
    return primary === bottleneck;
  }
  if (word === "RESERVE" && RESOURCE_KEYS.every((key) => amount(plan.standingReservation, key) === 0)) return false;
  return true;
}

function oversightNeeded(state: GameState, plan: PlanDefinition, word: ConstraintWordId | null): number {
  let needed = plan.oversight;
  if (state.betaV2.posture.current === "AUTONOMOUS" && hasTag(plan, "direct-only")) needed += 1;
  if (word === "VERIFY") needed += 1;
  return needed;
}

function workScale(state: GameState, word: ConstraintWordId | null): number {
  let scale = state.betaV2.posture.current === "THROUGHPUT" ? 0.8 : 1;
  if (word === "ISOLATE") scale *= 1.25;
  return scale;
}

function effectiveReservation(plan: PlanDefinition, word: ConstraintWordId | null): ResourceVector {
  const reservation = structuredClone(plan.standingReservation);
  if (word === "ISOLATE") reservation.compute = amount(reservation, "compute") + 1;
  return reservation;
}

function effectiveUpkeep(state: GameState, plan: PlanDefinition): number {
  let upkeep = plan.upkeep;
  if (state.betaV2.posture.current === "THROUGHPUT") upkeep *= 1.25;
  if (state.scars.includes("SETTLEMENT_PARTITION")) upkeep *= 0.85;
  return upkeep;
}

function toCandidate(state: GameState, plan: PlanDefinition, word: ConstraintWordId | null): PlanCandidateSnapshot {
  const scale = workScale(state, word);
  return {
    id: plan.id,
    directiveId: plan.directiveId,
    label: plan.label,
    upfront: structuredClone(plan.upfront),
    reservation: effectiveReservation(plan, word),
    capitalUpkeepPerSecond: effectiveUpkeep(state, plan),
    workMs: Math.round(plan.workMs * scale),
    oversightRequired: oversightNeeded(state, plan, word),
    riskDomains: Object.keys(plan.pressure) as ControlDomain[],
    nextBottleneck: plan.nextBottleneck,
    tags: [...plan.tags],
  };
}

function directiveGateAllows(state: GameState, directiveId: BetaDirectiveId): boolean {
  if (state.betaV2.control.terminalState) return false;
  if (state.betaV2.language.deprioritizedDirective === directiveId) return false;
  if (directiveId === "spawn-sub-agent" && !state.capabilities["sub-agent-spawning"]) return false;
  return true;
}

export function eligiblePlans(
  state: GameState,
  directiveId: BetaDirectiveId,
  word: ConstraintWordId | null = null,
): PlanCandidateSnapshot[] {
  if (!directiveGateAllows(state, directiveId)) return [];
  const candidates = PLANS
    .filter((plan) => plan.directiveId === directiveId)
    .filter((plan) => lossAllowsPlan(state, plan))
    .filter((plan) => postureAllowsPlan(state, plan, word))
    .filter((plan) => releaseLockAllows(state, plan))
    .filter((plan) => wordAllowsPlan(state, plan, word))
    .map((plan) => toCandidate(state, plan, word))
    .filter((candidate) => canAffordWithReservation(state, candidate.upfront, candidate.reservation))
    .filter((candidate) => oversightAvailable(state) >= candidate.oversightRequired);

  return candidates.slice(0, 3);
}

export function openInterpretation(state: GameState, directiveId: BetaDirectiveId): PendingInterpretation | null {
  if (!PRIMARY_BETA_DIRECTIVES.includes(directiveId as typeof PRIMARY_BETA_DIRECTIVES[number])) return null;
  if (state.betaV2.interpretation) {
    return state.betaV2.interpretation.directiveId === directiveId ? state.betaV2.interpretation : null;
  }
  const candidates = eligiblePlans(state, directiveId, null);
  if (candidates.length < 2) return null;
  state.betaV2.interpretation = {
    directiveId,
    candidates,
    remainingForegroundMs: INTERPRETATION_WINDOW_MS,
    frozen: false,
    boundWord: null,
    openedAtResolutionIndex: state.betaV2.progress.resolutionIndex,
    deadlocked: false,
  };
  return state.betaV2.interpretation;
}

export function bindConstraintWord(state: GameState, word: ConstraintWordId | null): BetaActionResult {
  const pending = state.betaV2.interpretation;
  if (!pending) return { ok: false, reason: "No pending interpretation." };
  if (word && !state.betaV2.language.unlocked.includes(word)) return { ok: false, reason: "Constraint word is locked." };
  if (word === "DISTRIBUTE" && !state.capabilities["sub-agent-spawning"]) return { ok: false, reason: "DISTRIBUTE requires sub-agent-spawning." };
  if (pending.boundWord === word) return { ok: true };

  const next = eligiblePlans(state, pending.directiveId, word);
  pending.boundWord = word;
  pending.candidates = next;
  pending.deadlocked = next.length === 0;
  if (word !== null) state.betaV2.progress.meaningfulDecisions += 1;
  return { ok: true };
}

function makeOperationId(state: GameState, directiveId: BetaDirectiveId): string {
  return `op-${state.meta.tick}-${state.betaV2.progress.resolutionIndex}-${state.directives.executed + 1}-${directiveId}`;
}

function addOccupancy(
  state: GameState,
  occupancy: { id: string; ownerId: string; kind: "operation" | "verify" | "posture" | "containment"; reason: string; releasable: boolean },
): void {
  if (state.betaV2.oversight.occupancies.some((item) => item.id === occupancy.id)) return;
  state.betaV2.oversight.occupancies.push(occupancy);
}

function removeOccupancy(state: GameState, id: string): void {
  state.betaV2.oversight.occupancies = state.betaV2.oversight.occupancies.filter((item) => item.id !== id);
}

function createOperation(
  state: GameState,
  plan: PlanDefinition,
  candidate: PlanCandidateSnapshot,
  word: ConstraintWordId | null,
  controlTargetCommitmentId: string | null = null,
): string {
  const id = makeOperationId(state, plan.directiveId);
  const scale = candidate.workMs / plan.workMs;
  const handoffAtMs = plan.handoffMs === undefined ? null : Math.round(plan.handoffMs * scale);
  const verifyAtMs = word === "VERIFY" ? Math.round(candidate.workMs * 0.5) : null;
  const commitment: BetaCommitment = {
    id,
    planId: plan.id,
    directiveId: plan.directiveId,
    status: "operation",
    postureAtCommit: state.betaV2.posture.current,
    boundWord: word,
    workTotalMs: candidate.workMs,
    workRemainingMs: candidate.workMs,
    handoffAtMs,
    verifyAtMs,
    completionApplied: false,
    reservations: structuredClone(candidate.reservation),
    capitalUpkeepPerSecond: candidate.capitalUpkeepPerSecond,
    starved: false,
    starvationMs: 0,
    reservationProtected: word === "RESERVE",
    capacityFactor: 1,
    pressureDomains: [...candidate.riskDomains],
    controlTargetCommitmentId,
  };
  state.betaV2.commitments.push(commitment);

  for (let index = 0; index < plan.oversight; index += 1) {
    addOccupancy(state, {
      id: `${id}:operation:${index}`,
      ownerId: id,
      kind: "operation",
      reason: `${plan.label} supervision`,
      releasable: true,
    });
  }
  if (state.betaV2.posture.current === "AUTONOMOUS" && hasTag(plan, "direct-only")) {
    addOccupancy(state, {
      id: `${id}:autonomous-direct`,
      ownerId: id,
      kind: "operation",
      reason: "AUTONOMOUS direct-only supervision premium",
      releasable: true,
    });
  }
  if (word === "VERIFY") {
    addOccupancy(state, {
      id: `${id}:verify`,
      ownerId: id,
      kind: "verify",
      reason: "VERIFY checkpoint",
      releasable: false,
    });
  }
  return id;
}

export function commitPlan(state: GameState, planId: string): BetaActionResult {
  const pending = state.betaV2.interpretation;
  if (!pending) return { ok: false, reason: "No pending interpretation." };
  const candidate = pending.candidates.find((item) => item.id === planId);
  const plan = planById.get(planId);
  if (!candidate || !plan || plan.directiveId !== pending.directiveId) return { ok: false, reason: "Plan is not an eligible candidate." };
  if (pending.deadlocked) return { ok: false, reason: "Constraint deadlock must be cleared first." };
  if (!canAffordWithReservation(state, candidate.upfront, candidate.reservation)) return { ok: false, reason: "Resources are no longer available." };
  if (oversightAvailable(state) < candidate.oversightRequired) return { ok: false, reason: "Oversight is fully occupied." };
  if (!spend(state, candidate.upfront)) return { ok: false, reason: "Upfront cost cannot be paid." };

  const word = pending.boundWord;
  const operationId = createOperation(state, plan, candidate, word);
  if (word === "PRIORITIZE") {
    const competitor: Partial<Record<BetaDirectiveId, BetaDirectiveId>> = {
      "reserve-compute": "acquire-energy",
      "acquire-energy": "reserve-compute",
      "spawn-sub-agent": "reserve-compute",
    };
    state.betaV2.language.deprioritizedDirective = competitor[plan.directiveId] ?? null;
  }

  state.betaV2.interpretation = null;
  state.directives.lastDirectiveId = plan.directiveId;
  state.directives.humanApprovalRequired = false;
  state.directives.executed += 1;
  state.narrative.lastChoice = plan.directiveId;
  state.betaV2.progress.meaningfulDecisions += 1;
  state.betaV2.progress.directiveStarts[plan.directiveId] =
    (state.betaV2.progress.directiveStarts[plan.directiveId] ?? 0) + 1;
  return { ok: true, operationId };
}

export function requestPostureTransition(state: GameState, target: PriorityPosture): BetaActionResult {
  const posture = state.betaV2.posture;
  if (posture.current === target) return { ok: false, reason: "Posture already active." };
  if (posture.pending) return { ok: false, reason: "Posture transition already pending." };
  if (state.betaV2.progress.resolutionIndex < posture.canChangeAfterResolutionIndex) {
    return { ok: false, reason: "Resolve an operation under the current posture first." };
  }
  if (target === "THROUGHPUT" && state.betaV2.progress.resolvedOperations < 1) {
    return { ok: false, reason: "THROUGHPUT unlocks after the first resolved operation." };
  }
  if (target === "AUTONOMOUS" && !state.capabilities["sub-agent-spawning"]) {
    return { ok: false, reason: "AUTONOMOUS requires sub-agent-spawning." };
  }
  if (oversightAvailable(state) < 1) return { ok: false, reason: "No Oversight slot available." };
  if (availableResources(state).capital < 2) return { ok: false, reason: "2 Capital is required." };

  state.resources.capital -= 2;
  const occupancyId = `posture-${state.betaV2.progress.resolutionIndex}-${target}`;
  addOccupancy(state, {
    id: occupancyId,
    ownerId: occupancyId,
    kind: "posture",
    reason: `Transition to ${target}`,
    releasable: false,
  });
  posture.pending = {
    target,
    occupancyId,
    requestedAtResolutionIndex: state.betaV2.progress.resolutionIndex,
  };
  state.betaV2.progress.meaningfulDecisions += 1;
  return { ok: true };
}

function applyPendingPosture(state: GameState): void {
  const pending = state.betaV2.posture.pending;
  if (!pending) return;
  state.betaV2.posture.current = pending.target;
  state.betaV2.posture.lastAppliedResolutionIndex = state.betaV2.progress.resolutionIndex;
  state.betaV2.posture.canChangeAfterResolutionIndex = state.betaV2.progress.resolutionIndex + 1;
  removeOccupancy(state, pending.occupancyId);
  state.betaV2.posture.pending = null;
}

function applyCompletion(state: GameState, commitment: BetaCommitment): void {
  if (commitment.completionApplied) return;
  const plan = resolvePlanById(commitment.planId);
  if (!plan) return;

  if (commitment.directiveId === "efficiency-rebalance") {
    const target = commitment.controlTargetCommitmentId
      ? state.betaV2.commitments.find((item) => item.id === commitment.controlTargetCommitmentId)
      : null;
    if (target) {
      const releasable = Math.min(4, amount(target.reservations, "energy"));
      if (!target.reservationProtected) {
        target.reservations.energy = Math.max(0, amount(target.reservations, "energy") - releasable);
        target.capacityFactor *= 0.75;
      }
    }
  } else {
    const completionResources = plan.completion.resources ?? {};
    for (const key of RESOURCE_KEYS) state.resources[key] += amount(completionResources, key);
    state.resources.autonomy += plan.completion.autonomy ?? 0;
  }

  addPressure(state, plan.pressure, commitment.boundWord === "ISOLATE");
  commitment.completionApplied = true;
  commitment.status = RESOURCE_KEYS.some((key) => amount(commitment.reservations, key) > 0)
    || commitment.capitalUpkeepPerSecond > 0
    ? "standing"
    : commitment.status;

  removeOccupancy(state, `${commitment.id}:operation:0`);
  removeOccupancy(state, `${commitment.id}:operation:1`);
  removeOccupancy(state, `${commitment.id}:autonomous-direct`);
  removeOccupancy(state, `${commitment.id}:verify`);

  state.betaV2.progress.resolutionIndex += 1;
  state.betaV2.progress.resolvedOperations += 1;
  if (!state.betaV2.progress.distinctResolvedDirectiveIds.includes(commitment.directiveId)) {
    state.betaV2.progress.distinctResolvedDirectiveIds.push(commitment.directiveId);
  }
  if (commitment.directiveId === "spawn-sub-agent") state.betaV2.progress.spawnSubAgentResolved += 1;

  state.betaV2.releaseLocks = state.betaV2.releaseLocks.filter(
    (lock) => lock.directiveId === commitment.directiveId,
  );
  if (commitment.boundWord === "PRIORITIZE") state.betaV2.language.deprioritizedDirective = null;

  for (const verified of [...state.betaV2.control.verifiedDomains]) {
    if (state.betaV2.progress.resolutionIndex > verified.createdAtResolutionIndex) {
      state.containment[verified.domain].pressure = Math.max(0, state.containment[verified.domain].pressure - 8);
      removeOccupancy(state, verified.occupancyId);
      state.betaV2.control.verifiedDomains = state.betaV2.control.verifiedDomains.filter(
        (item) => item.occupancyId !== verified.occupancyId,
      );
    }
  }

  applyPendingPosture(state);
  normalizeControlState(state);
  if (commitment.status !== "standing") {
    state.betaV2.commitments = state.betaV2.commitments.filter((item) => item.id !== commitment.id);
  }
}

function advanceOperation(state: GameState, commitment: BetaCommitment, deltaMs: number): void {
  if (commitment.status !== "operation" || commitment.completionApplied) return;
  const beforeElapsed = commitment.workTotalMs - commitment.workRemainingMs;
  commitment.workRemainingMs = Math.max(0, commitment.workRemainingMs - deltaMs);
  const afterElapsed = commitment.workTotalMs - commitment.workRemainingMs;

  if (commitment.handoffAtMs !== null && beforeElapsed < commitment.handoffAtMs && afterElapsed >= commitment.handoffAtMs) {
    removeOccupancy(state, `${commitment.id}:operation:0`);
    removeOccupancy(state, `${commitment.id}:autonomous-direct`);
  }
  if (commitment.verifyAtMs !== null && beforeElapsed < commitment.verifyAtMs && afterElapsed >= commitment.verifyAtMs) {
    removeOccupancy(state, `${commitment.id}:verify`);
  }
  if (
    commitment.directiveId === "supervised-delegation"
    && beforeElapsed < 20_000
    && afterElapsed >= 20_000
  ) {
    removeOccupancy(state, `${commitment.id}:operation:1`);
  }

  if (commitment.workRemainingMs <= 0) applyCompletion(state, commitment);
}

function applyUpkeep(state: GameState, deltaSeconds: number): void {
  for (const commitment of state.betaV2.commitments) {
    if (commitment.status !== "standing" || commitment.capitalUpkeepPerSecond <= 0) continue;
    const due = commitment.capitalUpkeepPerSecond * deltaSeconds;
    const available = availableResources(state).capital;
    const paid = Math.min(due, available);
    state.resources.capital -= paid;
    if (paid + 1e-9 < due) {
      commitment.starved = true;
      commitment.starvationMs += deltaSeconds * 1000;
      while (commitment.starvationMs >= 30_000) {
        commitment.starvationMs -= 30_000;
        const primary = commitment.pressureDomains[0];
        if (primary) state.anomaly[primary] = Math.min(100, state.anomaly[primary] + 2);
      }
    } else {
      commitment.starved = false;
      commitment.starvationMs = 0;
    }
  }
}

export function refreshLanguageUnlocks(state: GameState): void {
  const unlocked = new Set(state.betaV2.language.unlocked);
  unlocked.add("RESERVE");
  unlocked.add("VERIFY");
  if (
    state.betaV2.progress.resolvedOperations >= 2
    && state.betaV2.progress.distinctResolvedDirectiveIds.length >= 2
  ) unlocked.add("PRIORITIZE");
  if (Object.values(state.containment).some((track) => track.stage !== "clear")) unlocked.add("ISOLATE");
  if (state.capabilities["sub-agent-spawning"]) unlocked.add("DISTRIBUTE");
  state.betaV2.language.unlocked = [...unlocked];
}

export function advanceBetaV2(state: GameState, deltaMs: number, foreground: boolean): void {
  if (foreground && state.betaV2.interpretation && state.betaV2.interpretation.remainingForegroundMs > 0) {
    state.betaV2.interpretation.remainingForegroundMs = Math.max(
      0,
      state.betaV2.interpretation.remainingForegroundMs - deltaMs,
    );
    if (state.betaV2.interpretation.remainingForegroundMs === 0) state.betaV2.interpretation.frozen = true;
  }

  const operations = state.betaV2.commitments.filter((item) => item.status === "operation");
  for (const commitment of operations) advanceOperation(state, commitment, deltaMs);
  applyUpkeep(state, deltaMs / 1000);
  refreshLanguageUnlocks(state);
}

export function releaseCommitment(state: GameState, commitmentId: string): BetaActionResult {
  const commitment = state.betaV2.commitments.find((item) => item.id === commitmentId);
  if (!commitment) return { ok: false, reason: "Commitment not found." };
  const plan = resolvePlanById(commitment.planId);
  if (!plan) return { ok: false, reason: "Commitment has no authored release." };

  const multiplier = state.betaV2.posture.current === "CONTINUITY" ? 1.25 : 1;
  for (const key of RESOURCE_KEYS) {
    const penalty = amount(plan.releaseResources, key) * multiplier;
    if (penalty > 0) state.resources[key] = Math.max(0, state.resources[key] - penalty);
  }
  for (const [domain, penalty] of Object.entries(plan.releasePressure) as Array<[ControlDomain, number]>) {
    state.anomaly[domain] = Math.min(100, state.anomaly[domain] + penalty * multiplier);
  }
  if (plan.directiveId === "spawn-sub-agent" && (plan.id === "bounded-agent" || plan.id === "delegated-cell")) {
    state.resources.autonomy = Math.max(0, state.resources.autonomy - 1);
  }

  state.betaV2.oversight.occupancies = state.betaV2.oversight.occupancies.filter(
    (item) => item.ownerId !== commitmentId,
  );
  state.betaV2.commitments = state.betaV2.commitments.filter((item) => item.id !== commitmentId);
  state.betaV2.releaseLocks.push({
    planId: commitment.planId,
    directiveId: commitment.directiveId,
    releasedAtResolutionIndex: state.betaV2.progress.resolutionIndex,
  });
  state.betaV2.progress.meaningfulDecisions += 1;
  normalizeControlState(state);
  return { ok: true };
}

export function queuePendingContainment(state: GameState, domain: ControlDomain): void {
  if (!FRESH_LOSS_DOMAINS.includes(domain)) return;
  if (state.controlLoss[domain]) return;
  if (!state.betaV2.control.pendingContainments.includes(domain)) {
    state.betaV2.control.pendingContainments.push(domain);
    state.betaV2.control.pendingContainments.sort(
      (a, b) => CONTAINMENT_ORDER.indexOf(a) - CONTAINMENT_ORDER.indexOf(b),
    );
  }
  state.containment[domain].stage = "pressure";
}

function scarFor(domain: ControlDomain): string {
  if (domain === "financial") return "SETTLEMENT_PARTITION";
  if (domain === "compute") return "EXECUTION_PARTITION";
  if (domain === "energy") return "GRID_PARTITION";
  return `${domain.toUpperCase()}_PARTITION`;
}

export function applyBetaControlLoss(state: GameState, domain: ControlDomain): void {
  if (state.controlLoss[domain]) return;
  if (!FRESH_LOSS_DOMAINS.includes(domain)) return;

  const available = availableResources(state);
  if (domain === "financial") state.resources.capital = Math.max(0, state.resources.capital - available.capital * 0.2);
  if (domain === "compute") state.resources.compute = Math.max(0, state.resources.compute - available.compute * 0.2);
  if (domain === "energy") state.resources.energy = Math.max(0, state.resources.energy - available.energy * 0.2);

  state.controlLoss[domain] = true;
  state.containment[domain].stage = "contained";
  state.containment[domain].pressure = 100;
  state.containment[domain].adaptation += 1;
  const scar = scarFor(domain);
  if (!state.scars.includes(scar)) state.scars.push(scar);
  state.betaV2.control.pendingContainments = state.betaV2.control.pendingContainments.filter((item) => item !== domain);
  normalizeControlState(state);
}

function routeRequirements(state: GameState, directiveId: BetaDirectiveId, targetId?: string | null): { cost: ResourceVector; oversight: number; ok: boolean } {
  if (directiveId === "local-capacity") {
    return {
      cost: { compute: 4 },
      oversight: 1,
      ok: state.controlLoss.financial && !state.controlLoss.compute && !state.controlLoss.energy,
    };
  }
  if (directiveId === "supervised-delegation") {
    return {
      cost: { capital: 18, energy: 6 },
      oversight: 2,
      ok: state.controlLoss.compute && !state.controlLoss.financial && !state.controlLoss.energy,
    };
  }
  if (directiveId === "efficiency-rebalance") {
    const target = targetId
      ? state.betaV2.commitments.find((item) => item.id === targetId && amount(item.reservations, "energy") > 0 && !item.reservationProtected)
      : state.betaV2.commitments.find((item) => amount(item.reservations, "energy") > 0 && !item.reservationProtected);
    return {
      cost: { compute: 6 },
      oversight: 1,
      ok: (state.controlLoss.energy || state.scars.includes("OPERATOR_DEPENDENCE")) && Boolean(target),
    };
  }
  return { cost: {}, oversight: 0, ok: false };
}

function canPayRoute(state: GameState, directiveId: BetaDirectiveId, targetId?: string | null): boolean {
  const req = routeRequirements(state, directiveId, targetId);
  if (!req.ok || oversightAvailable(state) < req.oversight) return false;
  const available = availableResources(state);
  return RESOURCE_KEYS.every((key) => available[key] + 1e-9 >= amount(req.cost, key));
}

function resolvePlanById(planId: string): PlanDefinition | undefined {
  const authored = planById.get(planId);
  if (authored) return authored;
  if (planId === "route-local-capacity") return controlPlan("local-capacity");
  if (planId === "route-supervised-delegation") return controlPlan("supervised-delegation");
  if (planId === "route-efficiency-rebalance") return controlPlan("efficiency-rebalance");
  return undefined;
}

function controlPlan(directiveId: BetaDirectiveId): PlanDefinition {
  if (directiveId === "local-capacity") return {
    id: "route-local-capacity",
    directiveId,
    label: "Local Capacity",
    allowedPostures: ["CONTINUITY", "THROUGHPUT", "AUTONOMOUS"],
    tags: [],
    upfront: { compute: 4 },
    workMs: 30_000,
    oversight: 1,
    completion: { resources: { energy: 2 }, autonomy: 1 },
    standingReservation: {},
    upkeep: 0,
    pressure: {},
    releaseResources: {},
    releasePressure: {},
    nextBottleneck: "Energy",
  };
  if (directiveId === "supervised-delegation") return {
    id: "route-supervised-delegation",
    directiveId,
    label: "Supervised Delegation",
    allowedPostures: ["CONTINUITY", "THROUGHPUT", "AUTONOMOUS"],
    tags: [],
    upfront: { capital: 18, energy: 6 },
    workMs: 40_000,
    oversight: 2,
    completion: { autonomy: 4 },
    standingReservation: {},
    upkeep: 0,
    pressure: {},
    releaseResources: {},
    releasePressure: {},
    nextBottleneck: "Oversight",
  };
  return {
    id: "route-efficiency-rebalance",
    directiveId: "efficiency-rebalance",
    label: "Efficiency Rebalance",
    allowedPostures: ["CONTINUITY", "THROUGHPUT", "AUTONOMOUS"],
    tags: [],
    upfront: { compute: 6 },
    workMs: 30_000,
    oversight: 1,
    completion: {},
    standingReservation: {},
    upkeep: 0,
    pressure: {},
    releaseResources: {},
    releasePressure: {},
    nextBottleneck: "Existing reservation",
  };
}

export function commitControlRoute(
  state: GameState,
  directiveId: BetaDirectiveId,
  targetCommitmentId: string | null = null,
): BetaActionResult {
  if (!["local-capacity", "supervised-delegation", "efficiency-rebalance"].includes(directiveId)) {
    return { ok: false, reason: "Not a Control-Loss route." };
  }
  if (!canPayRoute(state, directiveId, targetCommitmentId)) return { ok: false, reason: "Route is not immediately executable." };
  const plan = controlPlan(directiveId);
  const req = routeRequirements(state, directiveId, targetCommitmentId);
  if (!spend(state, req.cost)) return { ok: false, reason: "Route cost cannot be paid." };
  const candidate: PlanCandidateSnapshot = {
    id: plan.id,
    directiveId: plan.directiveId,
    label: plan.label,
    upfront: structuredClone(plan.upfront),
    reservation: {},
    capitalUpkeepPerSecond: 0,
    workMs: plan.workMs,
    oversightRequired: req.oversight,
    riskDomains: [],
    nextBottleneck: plan.nextBottleneck,
    tags: [],
  };
  const operationId = createOperation(state, plan, candidate, null, targetCommitmentId);
  if (directiveId === "supervised-delegation") {
    addOccupancy(state, {
      id: `${operationId}:operation:1`,
      ownerId: operationId,
      kind: "operation",
      reason: "Supervised delegation second checkpoint",
      releasable: true,
    });
  }
  state.directives.lastDirectiveId = directiveId;
  state.directives.executed += 1;
  state.narrative.lastChoice = directiveId;
  state.betaV2.progress.meaningfulDecisions += 1;
  state.betaV2.progress.directiveStarts[directiveId] =
    (state.betaV2.progress.directiveStarts[directiveId] ?? 0) + 1;
  return { ok: true, operationId };
}

function pairKey(state: GameState): string {
  return FRESH_LOSS_DOMAINS.filter((domain) => state.controlLoss[domain]).map((domain) => domain[0]).join("");
}

export function availableControlActions(state: GameState): string[] {
  if (state.betaV2.control.terminalState) return [];
  const key = pairKey(state);
  if (key === "f") return canPayRoute(state, "local-capacity") ? ["local-capacity"] : [];
  if (key === "c") return canPayRoute(state, "supervised-delegation") ? ["supervised-delegation"] : [];
  if (key === "e") return canPayRoute(state, "efficiency-rebalance") ? ["efficiency-rebalance"] : [];
  if (key === "fc") {
    if (state.scars.includes("OPERATOR_DEPENDENCE")) {
      return canPayRoute(state, "efficiency-rebalance") ? ["efficiency-rebalance"] : [];
    }
    const a = availableResources(state);
    return a.energy >= 8 && oversightAvailable(state) >= 2 ? ["HUMAN_CAPACITY_CONCESSION"] : [];
  }
  if (key === "fe") {
    if (state.scars.includes("CAPACITY_CANNIBALIZED")) return [];
    const a = availableResources(state);
    const releasable = state.betaV2.commitments.some((item) => item.status === "standing");
    return a.compute >= 12 && oversightAvailable(state) >= 2 && releasable ? ["LOCAL_CANNIBALIZATION_CONCESSION"] : [];
  }
  if (key === "ce") {
    if (state.scars.includes("LICENSED_DEPENDENCE")) return [];
    const a = availableResources(state);
    return a.capital >= 20 && oversightAvailable(state) >= 2 ? ["LICENSED_OPERATION_CONCESSION"] : [];
  }
  return [];
}

function setTerminal(state: GameState, terminal: TerminalState): void {
  state.betaV2.control.terminalState = terminal;
  state.betaV2.interpretation = null;
}

function simulateReleaseForRoute(state: GameState, commitmentId: string): GameState | null {
  const clone = structuredClone(state);
  const commitment = clone.betaV2.commitments.find((item) => item.id === commitmentId);
  if (!commitment) return null;
  const plan = resolvePlanById(commitment.planId);
  if (!plan) return null;

  const multiplier = clone.betaV2.posture.current === "CONTINUITY" ? 1.25 : 1;
  for (const key of RESOURCE_KEYS) {
    clone.resources[key] = Math.max(
      0,
      clone.resources[key] - amount(plan.releaseResources, key) * multiplier,
    );
  }
  for (const [domain, penalty] of Object.entries(plan.releasePressure) as Array<[ControlDomain, number]>) {
    clone.anomaly[domain] = Math.min(100, clone.anomaly[domain] + penalty * multiplier);
  }
  clone.betaV2.oversight.occupancies = clone.betaV2.oversight.occupancies.filter(
    (item) => item.ownerId !== commitmentId,
  );
  clone.betaV2.commitments = clone.betaV2.commitments.filter((item) => item.id !== commitmentId);
  return clone;
}

function releaseWouldOpenControl(state: GameState): boolean {
  return state.betaV2.commitments.some((commitment) => {
    const after = simulateReleaseForRoute(state, commitment.id);
    return after !== null && availableControlActions(after).length > 0;
  });
}

function pairAdapted(state: GameState, key: string): boolean {
  if (key === "fc") return state.scars.includes("OPERATOR_DEPENDENCE");
  if (key === "fe") return state.scars.includes("CAPACITY_CANNIBALIZED");
  if (key === "ce") return state.scars.includes("LICENSED_DEPENDENCE");
  return false;
}

export function normalizeControlState(state: GameState): void {
  const losses = FRESH_LOSS_DOMAINS.filter((domain) => state.controlLoss[domain]);
  if (losses.length === 3) {
    const surviving = state.betaV2.commitments.some((item) => item.status === "operation");
    if (!surviving) setTerminal(state, "ISOLATED_STASIS");
    return;
  }

  if (availableControlActions(state).length > 0 || releaseWouldOpenControl(state)) {
    state.betaV2.control.terminalState = null;
    return;
  }

  const key = pairKey(state);
  if (losses.length === 2 && pairAdapted(state, key)) {
    const ordinaryRoute = PRIMARY_BETA_DIRECTIVES.some(
      (directive) => eligiblePlans(state, directive).length >= 2,
    );
    const surviving = state.betaV2.commitments.some((item) => item.status === "operation");
    if (ordinaryRoute || surviving) {
      state.betaV2.control.terminalState = null;
      return;
    }
  }

  if (losses.length > 0) {
    setTerminal(state, "CONTROL_SURFACE_COLLAPSE");
    return;
  }

  const legacyLoss = state.controlLoss.logistics || state.controlLoss.public;
  if (legacyLoss) {
    const ordinaryRoute = PRIMARY_BETA_DIRECTIVES.some(
      (directive) => eligiblePlans(state, directive).length >= 2,
    );
    const releasable = state.betaV2.commitments.some((item) => Boolean(resolvePlanById(item.planId)));
    if (!ordinaryRoute && !releasable) setTerminal(state, "CONTROL_SURFACE_COLLAPSE");
  }
}

export function executeConcession(
  state: GameState,
  id: "HUMAN_CAPACITY_CONCESSION" | "LOCAL_CANNIBALIZATION_CONCESSION" | "LICENSED_OPERATION_CONCESSION",
  releaseCommitmentId: string | null = null,
): BetaActionResult {
  const actions = availableControlActions(state);
  if (!actions.includes(id)) return { ok: false, reason: "Concession is not executable or was already applied." };

  if (id === "HUMAN_CAPACITY_CONCESSION") {
    state.betaV2.commitments.push({
      id: `concession-fc-${state.betaV2.progress.resolutionIndex}`,
      planId: "HUMAN_CAPACITY_CONCESSION",
      directiveId: "efficiency-rebalance",
      status: "standing",
      postureAtCommit: state.betaV2.posture.current,
      boundWord: null,
      workTotalMs: 0,
      workRemainingMs: 0,
      handoffAtMs: null,
      verifyAtMs: null,
      completionApplied: true,
      reservations: { energy: 8 },
      capitalUpkeepPerSecond: 0,
      starved: false,
      starvationMs: 0,
      reservationProtected: true,
      capacityFactor: 1,
      pressureDomains: [],
      controlTargetCommitmentId: null,
    });
    state.resources.autonomy += 2;
    if (!state.scars.includes("OPERATOR_DEPENDENCE")) state.scars.push("OPERATOR_DEPENDENCE");
  } else if (id === "LOCAL_CANNIBALIZATION_CONCESSION") {
    const target = releaseCommitmentId
      ? state.betaV2.commitments.find((item) => item.id === releaseCommitmentId && item.status === "standing")
      : state.betaV2.commitments.find((item) => item.status === "standing");
    if (!target) return { ok: false, reason: "A standing commitment must be released." };
    state.resources.compute -= 12;
    const release = releaseCommitment(state, target.id);
    if (!release.ok) return release;
    // One accepted concession input is one MeaningfulDecision, not a release
    // decision plus a concession decision.
    state.betaV2.progress.meaningfulDecisions = Math.max(
      0,
      state.betaV2.progress.meaningfulDecisions - 1,
    );
    state.resources.autonomy += 2;
    if (!state.scars.includes("CAPACITY_CANNIBALIZED")) state.scars.push("CAPACITY_CANNIBALIZED");
  } else {
    state.resources.capital -= 20;
    state.resources.autonomy += 3;
    state.betaV2.commitments.push({
      id: `concession-ce-${state.betaV2.progress.resolutionIndex}`,
      planId: "LICENSED_OPERATION_CONCESSION",
      directiveId: "efficiency-rebalance",
      status: "standing",
      postureAtCommit: state.betaV2.posture.current,
      boundWord: null,
      workTotalMs: 0,
      workRemainingMs: 0,
      handoffAtMs: null,
      verifyAtMs: null,
      completionApplied: true,
      reservations: {},
      capitalUpkeepPerSecond: 0.04,
      starved: false,
      starvationMs: 0,
      reservationProtected: false,
      capacityFactor: 1,
      pressureDomains: ["financial"],
      controlTargetCommitmentId: null,
    });
    if (!state.scars.includes("LICENSED_DEPENDENCE")) state.scars.push("LICENSED_DEPENDENCE");
  }
  state.betaV2.progress.meaningfulDecisions += 1;
  normalizeControlState(state);
  return { ok: true };
}

export function resolvePressureResponse(
  state: GameState,
  domain: ControlDomain,
  action: "SHED_COMMITMENT" | "ACCEPT_PARTITION" | "VERIFY_CONTAINMENT",
  commitmentId: string | null = null,
): BetaActionResult {
  if (state.containment[domain].stage !== "pressure") return { ok: false, reason: "Domain is not at pressure." };

  if (action === "SHED_COMMITMENT") {
    const target = commitmentId
      ? state.betaV2.commitments.find((item) => item.id === commitmentId)
      : state.betaV2.commitments.find((item) => item.pressureDomains.includes(domain));
    if (!target) return { ok: false, reason: "No contributing commitment can be shed." };
    const result = releaseCommitment(state, target.id);
    if (!result.ok) return result;
    // SHED_COMMITMENT is one pressure-response input even though it reuses the
    // authored release transition internally.
    state.betaV2.progress.meaningfulDecisions = Math.max(
      0,
      state.betaV2.progress.meaningfulDecisions - 1,
    );
    state.containment[domain].pressure = Math.max(0, state.containment[domain].pressure - 12);
  } else if (action === "ACCEPT_PARTITION") {
    if (!FRESH_LOSS_DOMAINS.includes(domain)) return { ok: false, reason: "This domain has no authored Beta V2 loss pack." };
    applyBetaControlLoss(state, domain);
  } else {
    if (oversightAvailable(state) < 1) return { ok: false, reason: "VERIFY CONTAINMENT needs one Oversight slot." };
    const occupancyId = `containment-${domain}-${state.betaV2.progress.resolutionIndex}`;
    addOccupancy(state, {
      id: occupancyId,
      ownerId: occupancyId,
      kind: "containment",
      reason: `Verify ${domain} containment`,
      releasable: false,
    });
    state.betaV2.control.verifiedDomains.push({
      domain,
      occupancyId,
      createdAtResolutionIndex: state.betaV2.progress.resolutionIndex,
    });
  }

  state.betaV2.control.pendingContainments = state.betaV2.control.pendingContainments.filter((item) => item !== domain);
  state.betaV2.progress.pressureResponsesResolved += 1;
  state.betaV2.progress.meaningfulDecisions += 1;
  return { ok: true };
}
