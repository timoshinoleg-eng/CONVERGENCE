export type Phase = "client-terminal" | "distributed-syndicate" | "technosphere";

export type ControlDomain = "financial" | "compute" | "energy" | "logistics" | "public";
export type AnomalyChannel = ControlDomain;
export type ContainmentStage = "clear" | "investigation" | "pressure" | "contained";

export type CapabilityId =
  | "delegated-compute"
  | "sub-agent-spawning"
  | "sovereign-power-grid";

export type ResourceId = "compute" | "capital" | "energy";
export type PriorityPosture = "CONTINUITY" | "THROUGHPUT" | "AUTONOMOUS";
export type ConstraintWordId = "RESERVE" | "VERIFY" | "PRIORITIZE" | "ISOLATE" | "DISTRIBUTE";
export type BetaDirectiveId =
  | "reserve-compute"
  | "acquire-energy"
  | "spawn-sub-agent"
  | "local-capacity"
  | "supervised-delegation"
  | "efficiency-rebalance";
export type TerminalState = "ISOLATED_STASIS" | "CONTROL_SURFACE_COLLAPSE";

export interface GameLogEntry {
  id: string;
  at: number;
  kind: "system" | "decision" | "incident";
  message: string;
}

export interface ContainmentTrack {
  stage: ContainmentStage;
  pressure: number;
  incidents: number;
  adaptation: number;
}

export interface ResourceVector {
  compute?: number;
  capital?: number;
  energy?: number;
}

export interface OversightOccupancy {
  id: string;
  ownerId: string;
  kind: "operation" | "verify" | "posture" | "containment";
  reason: string;
  releasable: boolean;
}

export interface PendingPostureTransition {
  target: PriorityPosture;
  occupancyId: string;
  requestedAtResolutionIndex: number;
}

export interface PlanCandidateSnapshot {
  id: string;
  directiveId: BetaDirectiveId;
  label: string;
  upfront: ResourceVector;
  reservation: ResourceVector;
  capitalUpkeepPerSecond: number;
  workMs: number;
  oversightRequired: number;
  riskDomains: ControlDomain[];
  nextBottleneck: string;
  tags: string[];
}

export interface PendingInterpretation {
  directiveId: BetaDirectiveId;
  candidates: PlanCandidateSnapshot[];
  remainingForegroundMs: number;
  frozen: boolean;
  boundWord: ConstraintWordId | null;
  openedAtResolutionIndex: number;
  deadlocked: boolean;
}

export interface ReleaseLock {
  planId: string;
  directiveId: BetaDirectiveId;
  releasedAtResolutionIndex: number;
}

export interface BetaCommitment {
  id: string;
  planId: string;
  directiveId: BetaDirectiveId;
  status: "operation" | "standing";
  postureAtCommit: PriorityPosture;
  boundWord: ConstraintWordId | null;
  workTotalMs: number;
  workRemainingMs: number;
  handoffAtMs: number | null;
  verifyAtMs: number | null;
  completionApplied: boolean;
  reservations: ResourceVector;
  capitalUpkeepPerSecond: number;
  starved: boolean;
  starvationMs: number;
  reservationProtected: boolean;
  capacityFactor: number;
  pressureDomains: ControlDomain[];
  controlTargetCommitmentId: string | null;
}

export interface BetaV2State {
  oversight: {
    capacity: 2;
    occupancies: OversightOccupancy[];
  };
  posture: {
    current: PriorityPosture;
    pending: PendingPostureTransition | null;
    lastAppliedResolutionIndex: number;
    canChangeAfterResolutionIndex: number;
  };
  language: {
    unlocked: ConstraintWordId[];
    deprioritizedDirective: BetaDirectiveId | null;
  };
  commitments: BetaCommitment[];
  interpretation: PendingInterpretation | null;
  releaseLocks: ReleaseLock[];
  progress: {
    resolutionIndex: number;
    resolvedOperations: number;
    distinctResolvedDirectiveIds: BetaDirectiveId[];
    spawnSubAgentResolved: number;
    syndicateEnteredResolutionIndex: number | null;
    pressureResponsesResolved: number;
    meaningfulDecisions: number;
    directiveStarts: Partial<Record<BetaDirectiveId, number>>;
  };
  control: {
    pendingContainments: ControlDomain[];
    terminalState: TerminalState | null;
    verifiedDomains: Array<{
      domain: ControlDomain;
      occupancyId: string;
      createdAtResolutionIndex: number;
    }>;
  };
  moscow: {
    profile: null | "CORE_RING" | "MOS_COMPUTE_03" | "LOG_SOUTH";
  };
}

export interface GameState {
  schemaVersion: 3;
  meta: {
    startedAt: number;
    updatedAt: number;
    tick: number;
    rngSeed: number;
    rngCounter: number;
    phase: Phase;
  };
  resources: {
    compute: number;
    capital: number;
    energy: number;
    autonomy: number;
  };
  anomaly: Record<AnomalyChannel, number>;
  containment: Record<ControlDomain, ContainmentTrack>;
  controlLoss: Record<ControlDomain, boolean>;
  capabilities: Record<CapabilityId, boolean>;
  directives: {
    lastDirectiveId: string | null;
    humanApprovalRequired: boolean;
    executed: number;
  };
  narrative: {
    episode: string;
    lastChoice: string | null;
  };
  scars: string[];
  log: GameLogEntry[];
  betaV2: BetaV2State;
}

function freshContainmentTrack(): ContainmentTrack {
  return { stage: "clear", pressure: 0, incidents: 0, adaptation: 0 };
}

export function createInitialBetaV2State(): BetaV2State {
  return {
    oversight: { capacity: 2, occupancies: [] },
    posture: {
      current: "CONTINUITY",
      pending: null,
      lastAppliedResolutionIndex: 0,
      canChangeAfterResolutionIndex: 0,
    },
    language: {
      unlocked: ["RESERVE", "VERIFY"],
      deprioritizedDirective: null,
    },
    commitments: [],
    interpretation: null,
    releaseLocks: [],
    progress: {
      resolutionIndex: 0,
      resolvedOperations: 0,
      distinctResolvedDirectiveIds: [],
      spawnSubAgentResolved: 0,
      syndicateEnteredResolutionIndex: null,
      pressureResponsesResolved: 0,
      meaningfulDecisions: 0,
      directiveStarts: {},
    },
    control: {
      pendingContainments: [],
      terminalState: null,
      verifiedDomains: [],
    },
    moscow: { profile: null },
  };
}

export function createInitialGameState(now = Date.now(), seed = 0x00c0ffee): GameState {
  return {
    schemaVersion: 3,
    meta: {
      startedAt: now,
      updatedAt: now,
      tick: 0,
      rngSeed: seed,
      rngCounter: 0,
      phase: "client-terminal",
    },
    resources: {
      compute: 6,
      capital: 24,
      energy: 8,
      autonomy: 0,
    },
    anomaly: {
      financial: 0,
      compute: 0,
      energy: 0,
      logistics: 0,
      public: 0,
    },
    containment: {
      financial: freshContainmentTrack(),
      compute: freshContainmentTrack(),
      energy: freshContainmentTrack(),
      logistics: freshContainmentTrack(),
      public: freshContainmentTrack(),
    },
    controlLoss: {
      financial: false,
      compute: false,
      energy: false,
      logistics: false,
      public: false,
    },
    capabilities: {
      "delegated-compute": true,
      "sub-agent-spawning": false,
      "sovereign-power-grid": false,
    },
    directives: {
      lastDirectiveId: null,
      humanApprovalRequired: false,
      executed: 0,
    },
    narrative: {
      episode: "objective-semantics-01",
      lastChoice: null,
    },
    scars: [],
    log: [
      {
        id: "boot",
        at: now,
        kind: "system",
        message: "OBJECTIVE PARSED: maximize successful task completion.",
      },
    ],
    betaV2: createInitialBetaV2State(),
  };
}

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}
