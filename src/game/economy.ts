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

export function capabilityAvailable(capability: CapabilityId): Requirement<GameState> {
  return {
    id: `capability:${capability}:available`,
    label: `${capability} capability is available`,
    isMet: (state) => state.capabilities[capability],
  };
}

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
  requirements: [controlAvailable("compute"), controlAvailable("energy")],
  cost: [["compute", 12], ["energy", 3]],
  reward: [["autonomy", 4]],
  apply: (state) => {
    state.capabilities["sub-agent-spawning"] = true;
  },
};

export const sovereignGridTransaction: Transaction<GameState> = {
  id: "directive:sovereign-grid",
  label: "Prototype sovereign power routing",
  requirements: [
    controlAvailable("compute"),
    controlAvailable("energy"),
    controlAvailable("logistics"),
    capabilityAvailable("sub-agent-spawning"),
  ],
  cost: [["compute", 38], ["capital", 18], ["energy", 12]],
  reward: [["autonomy", 8]],
};
