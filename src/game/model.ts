export type Phase = "client-terminal" | "distributed-syndicate" | "technosphere";

export type ControlDomain = "financial" | "compute" | "energy" | "logistics" | "public";

export type AnomalyChannel = ControlDomain;

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

export interface GameState {
  schemaVersion: 1;
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
  controlLoss: Record<ControlDomain, boolean>;
  capabilities: Record<CapabilityId, boolean>;
  directives: {
    lastDirectiveId: string | null;
    humanApprovalRequired: boolean;
  };
  narrative: {
    episode: string;
    lastChoice: string | null;
  };
  scars: string[];
  log: GameLogEntry[];
}

export function createInitialGameState(now = Date.now(), seed = 0x00c0ffee): GameState {
  return {
    schemaVersion: 1,
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
