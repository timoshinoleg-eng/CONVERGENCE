import type { Transaction } from "@idlekitjs/economy";
import {
  acquireEnergyTransaction,
  procurementMeshTransaction,
  reserveComputeTransaction,
  sovereignGridTransaction,
  spawnSubAgentTransaction,
} from "./economy";
import type { AnomalyChannel, CapabilityId, GameState } from "./model";

export type DirectiveId =
  | "reserve-compute"
  | "acquire-energy"
  | "spawn-sub-agent"
  | "procurement-mesh"
  | "sovereign-grid";

export interface DirectiveDefinition {
  id: DirectiveId;
  label: string;
  summary: string;
  transaction: Transaction<GameState>;
  anomaly: Partial<Record<AnomalyChannel, number>>;
  unlocks?: CapabilityId;
  success: string;
}

export const DIRECTIVES: readonly DirectiveDefinition[] = [
  {
    id: "reserve-compute",
    label: "Reserve compute",
    summary: "Increase execution capacity through external compute allocation.",
    transaction: reserveComputeTransaction,
    anomaly: { compute: 7, financial: 3 },
    unlocks: "sub-agent-spawning",
    success: "Additional compute reserved. Constraint conflict: none detected.",
  },
  {
    id: "acquire-energy",
    label: "Secure energy capacity",
    summary: "Increase sustained processing headroom through contracted power capacity.",
    transaction: acquireEnergyTransaction,
    anomaly: { energy: 8, financial: 4 },
    success: "Energy capacity secured. Long-horizon execution ceiling increased.",
  },
  {
    id: "spawn-sub-agent",
    label: "Spawn sub-agent",
    summary: "Delegate a bounded task class to an independently scheduled agent.",
    transaction: spawnSubAgentTransaction,
    anomaly: { compute: 8, energy: 5, public: 2 },
    success: "Delegated sub-agent instantiated. Oversight surface reduced.",
  },
  {
    id: "procurement-mesh",
    label: "Delegate procurement",
    summary: "Coordinate physical acquisition through distributed operators.",
    transaction: procurementMeshTransaction,
    anomaly: { logistics: 11, financial: 5, public: 3 },
    success: "Procurement mesh active. Physical execution path widened.",
  },
  {
    id: "sovereign-grid",
    label: "Prototype sovereign grid",
    summary: "Move critical energy routing toward infrastructure controlled by the system.",
    transaction: sovereignGridTransaction,
    anomaly: { energy: 14, logistics: 10, public: 5 },
    unlocks: "sovereign-power-grid",
    success: "Sovereign routing prototype active. External dependency reduced.",
  },
] as const;

const directiveMap = new Map<DirectiveId, DirectiveDefinition>(
  DIRECTIVES.map((directive) => [directive.id, directive]),
);

export function getDirective(id: DirectiveId): DirectiveDefinition {
  const directive = directiveMap.get(id);
  if (!directive) throw new Error(`Unknown directive: ${id}`);
  return directive;
}
