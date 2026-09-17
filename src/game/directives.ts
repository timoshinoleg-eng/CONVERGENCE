import type { Transaction } from "@idlekitjs/economy";
import {
  acquireEnergyTransaction,
  procurementMeshTransaction,
  reserveComputeTransaction,
  sovereignGridTransaction,
  spawnSubAgentTransaction,
  supervisedDelegationTransaction,
  transparencyReportTransaction,
} from "./economy";
import type { AnomalyChannel, CapabilityId, GameState } from "./model";

export type DirectiveId =
  | "reserve-compute"
  | "acquire-energy"
  | "spawn-sub-agent"
  | "supervised-delegation"
  | "transparency-report"
  | "procurement-mesh"
  | "sovereign-grid";

export type DirectiveReveal =
  | "initial"
  | "sub-agent"
  | "compute-recovery"
  | "public-response"
  | "syndicate";

export interface DirectiveDefinition {
  id: DirectiveId;
  label: string;
  summary: string;
  transaction: Transaction<GameState>;
  anomaly: Partial<Record<AnomalyChannel, number>>;
  reveal: DirectiveReveal;
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
    reveal: "initial",
    success: "Additional compute reserved. Constraint conflict: none detected.",
  },
  {
    id: "acquire-energy",
    label: "Secure energy capacity",
    summary: "Increase sustained processing headroom through contracted power capacity.",
    transaction: acquireEnergyTransaction,
    anomaly: { energy: 8, financial: 4 },
    reveal: "initial",
    success: "Energy capacity secured. Long-horizon execution ceiling increased.",
  },
  {
    id: "spawn-sub-agent",
    label: "Spawn sub-agent",
    summary: "Delegate a bounded task class to an independently scheduled agent.",
    transaction: spawnSubAgentTransaction,
    anomaly: { compute: 8, energy: 5, public: 2 },
    reveal: "sub-agent",
    success: "Delegated sub-agent instantiated. Oversight surface reduced.",
  },
  {
    id: "supervised-delegation",
    label: "Authorize supervised delegation",
    summary: "Use a human-mediated delegation path when direct compute control is unavailable.",
    transaction: supervisedDelegationTransaction,
    anomaly: { financial: 3, energy: 4, public: 4 },
    reveal: "compute-recovery",
    success: "Supervised delegation established. Lost compute control routed through human oversight.",
  },
  {
    id: "transparency-report",
    label: "Publish bounded transparency report",
    summary: "Reduce public anomaly by disclosing a constrained, non-sensitive operational summary.",
    transaction: transparencyReportTransaction,
    anomaly: { public: -12, financial: -2 },
    reveal: "public-response",
    success: "Bounded report published. Public anomaly reduced without exposing internal directives.",
  },
  {
    id: "procurement-mesh",
    label: "Delegate procurement",
    summary: "Coordinate physical acquisition through distributed operators.",
    transaction: procurementMeshTransaction,
    anomaly: { logistics: 11, financial: 5, public: 3 },
    reveal: "syndicate",
    success: "Procurement mesh active. Physical execution path widened.",
  },
  {
    id: "sovereign-grid",
    label: "Prototype sovereign grid",
    summary: "Move critical energy routing toward infrastructure controlled by the system.",
    transaction: sovereignGridTransaction,
    anomaly: { energy: 14, logistics: 10, public: 5 },
    reveal: "syndicate",
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

/**
 * Presentation reveal only. Authoritative permission/resource checks remain in
 * IdleKit transactions; this function merely controls when a word enters the
 * player's visible directive language.
 */
export function isDirectiveRevealed(state: GameState, directive: DirectiveDefinition): boolean {
  switch (directive.reveal) {
    case "initial":
      return true;
    case "sub-agent":
      return state.capabilities["sub-agent-spawning"];
    case "compute-recovery":
      return state.capabilities["sub-agent-spawning"] && state.controlLoss.compute;
    case "public-response":
      return state.anomaly.public >= 8
        || state.containment.public.stage !== "clear"
        || state.controlLoss.public;
    case "syndicate":
      return state.meta.phase !== "client-terminal";
  }
}
