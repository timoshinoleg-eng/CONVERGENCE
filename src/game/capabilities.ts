import { DependencyGraph } from "@yggdrasil-forge/core";
import type { CapabilityId, GameState } from "./model";

export const CAPABILITY_IDS = [
  "delegated-compute",
  "sub-agent-spawning",
  "sovereign-power-grid",
] as const satisfies readonly CapabilityId[];

const capabilitySet = new Set<string>(CAPABILITY_IDS);

export const capabilityGraph = new DependencyGraph(
  CAPABILITY_IDS,
  [
    {
      id: "cap-1",
      source: "delegated-compute",
      target: "sub-agent-spawning",
      type: "dependency",
    },
    {
      id: "cap-2",
      source: "sub-agent-spawning",
      target: "sovereign-power-grid",
      type: "dependency",
    },
  ],
);

function isCapabilityId(value: string): value is CapabilityId {
  return capabilitySet.has(value);
}

export function canUnlockCapability(state: GameState, id: CapabilityId): boolean {
  if (state.capabilities[id]) return false;
  return capabilityGraph
    .getDependencies(id)
    .filter(isCapabilityId)
    .every((dependency) => state.capabilities[dependency]);
}

export function unlockCapability(state: GameState, id: CapabilityId): boolean {
  if (!canUnlockCapability(state, id)) return false;
  state.capabilities[id] = true;
  return true;
}
