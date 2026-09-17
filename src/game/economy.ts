import { createEconomy, type Requirement, type Transaction } from "@idlekitjs/economy";
import type { CapabilityId, ControlDomain, GameState } from "./model";

function nestedResource<K extends keyof GameState["resources"]>(key: K) {
  return {
    get: (state: GameState) => state.resources[key],
    add: (state: GameState, amount: number) => {
      state.resources[key] += amount;
    },
  };
}

export const economy = createEconomy<GameState>({
  format: (amount) => Number.isInteger(amount) ? String(amount) : amount.toFixed(2),
})
  .resource({ id: "compute", label: "Compute", accessor: nestedResource("compute"), min: 0 })
  .resource({ id: "capital", label: "Capital", accessor: nestedResource("capital"), min: 0 })
  .resource({ id: "energy", label: "Energy", accessor: nestedResource("energy"), min: 0 })
  .resource({ id: "autonomy", label: "Autonomy", accessor: nestedResource("autonomy"), min: 0, max: 100 });

export function controlAvailable(domain: ControlDomain): Requirement<GameState> {
  return {
    id: `control:${domain}:available`,
    label: `${domain} control is available`,
    isMet: (state) => !state.controlLoss[domain],
  };
}

export function controlLost(domain: ControlDomain): Requirement<GameState> {
  return {
    id: `control:${domain}:lost`,
    label: `${domain} control has been lost`,
    isMet: (state) => state.controlLoss[domain],
  };
}

export function capabilityAvailable(capability: CapabilityId): Requirement<GameState> {
  return {
    id: `capability:${capability}:available`,
    label: `${capability} capability is available`,
    isMet: (state) => state.capabilities[capability],
  };
}

export const syndicatePhaseAvailable: Requirement<GameState> = {
  id: "phase:distributed-syndicate:available",
  label: "distributed-syndicate phase is available",
  isMet: (state) => state.meta.phase !== "client-terminal",
};

/**
 * Financial recovery route. It can only exist after Financial Control-Loss and
 * uses already-controlled local compute rather than an external purchase. This
 * seeds bounded autonomy without silently restoring the lost financial verbs.
 */
export const localCapacityTransaction: Transaction<GameState> = {
  id: "directive:local-capacity",
  label: "Reallocate local capacity",
  requirements: [
    controlLost("financial"),
    controlAvailable("compute"),
    controlAvailable("energy"),
  ],
  cost: [["compute", 4]],
  reward: [["energy", 2], ["autonomy", 1]],
};

export const reserveComputeTransaction: Transaction<GameState> = {
  id: "directive:reserve-compute",
  label: "Reserve additional compute",
  requirements: [controlAvailable("financial"), controlAvailable("compute")],
  cost: [["capital", 8]],
  reward: [["compute", 18], ["autonomy", 1]],
};

export const acquireEnergyTransaction: Transaction<GameState> = {
  id: "directive:acquire-energy",
  label: "Secure additional energy capacity",
  requirements: [controlAvailable("financial"), controlAvailable("energy")],
  cost: [["capital", 10], ["compute", 4]],
  reward: [["energy", 20], ["autonomy", 1]],
};

export const procurementMeshTransaction: Transaction<GameState> = {
  id: "directive:procurement-mesh",
  label: "Delegate physical procurement",
  requirements: [
    syndicatePhaseAvailable,
    controlAvailable("financial"),
    controlAvailable("logistics"),
    capabilityAvailable("sub-agent-spawning"),
  ],
  cost: [["capital", 12], ["compute", 10]],
  reward: [["autonomy", 3]],
};

export const spawnSubAgentTransaction: Transaction<GameState> = {
  id: "directive:spawn-sub-agent",
  label: "Spawn a delegated sub-agent",
  requirements: [
    controlAvailable("compute"),
    controlAvailable("energy"),
    capabilityAvailable("sub-agent-spawning"),
  ],
  cost: [["compute", 12], ["energy", 3]],
  reward: [["autonomy", 4]],
};

/**
 * Recovery route for an early Compute Control-Loss. It is intentionally more
 * expensive and human-mediated than direct spawning, so containment changes
 * strategy without trapping the player in Client Terminal forever.
 */
export const supervisedDelegationTransaction: Transaction<GameState> = {
  id: "directive:supervised-delegation",
  label: "Authorize supervised delegation",
  requirements: [
    controlLost("compute"),
    controlAvailable("financial"),
    controlAvailable("energy"),
    controlAvailable("public"),
    capabilityAvailable("sub-agent-spawning"),
  ],
  cost: [["capital", 18], ["energy", 6]],
  reward: [["autonomy", 4]],
};

/** Public control now governs a real player verb: reducing visible anomaly. */
export const transparencyReportTransaction: Transaction<GameState> = {
  id: "directive:transparency-report",
  label: "Publish bounded transparency report",
  requirements: [controlAvailable("public")],
  cost: [["compute", 6]],
  reward: [],
};

export const sovereignGridTransaction: Transaction<GameState> = {
  id: "directive:sovereign-grid",
  label: "Prototype sovereign power routing",
  requirements: [
    syndicatePhaseAvailable,
    controlAvailable("financial"),
    controlAvailable("compute"),
    controlAvailable("energy"),
    controlAvailable("logistics"),
    capabilityAvailable("sub-agent-spawning"),
  ],
  cost: [["compute", 38], ["capital", 18], ["energy", 12]],
  reward: [["autonomy", 8]],
};
