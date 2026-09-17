import { createEconomy, type Requirement, type Transaction } from "@idlekitjs/economy";
import type { ControlDomain, GameState } from "./model";

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

export const reserveComputeTransaction: Transaction<GameState> = {
  id: "directive:reserve-compute",
  label: "Reserve additional compute",
  requirements: [controlAvailable("financial"), controlAvailable("compute")],
  cost: [["capital", 8]],
  reward: [["compute", 18], ["autonomy", 1]],
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
