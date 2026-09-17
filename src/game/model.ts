export type Phase = "client-terminal" | "distributed-syndicate" | "technosphere";

export type ControlDomain = "financial" | "compute" | "energy" | "logistics" | "public";

export type AnomalyChannel = ControlDomain;
export type ContainmentStage = "clear" | "investigation" | "pressure" | "contained";

export type CapabilityId =
  | "delegated-compute"
  | "sub-agent-spawning"
  | "sovereign-power-grid";

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

export interface GameState {
  schemaVersion: 2;
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
}

function freshContainmentTrack(): ContainmentTrack {
  return { stage: "clear", pressure: 0, incidents: 0, adaptation: 0 };
}

export function createInitialGameState(now = Date.now(), seed = 0x00c0ffee): GameState {
  return {
    schemaVersion: 2,
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
  };
}

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}
