import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import type { DirectiveId } from "../directives";
import type { ControlDomain, GameState } from "../model";

export type DirectivePermissionAction = "issue_directive";
export type DirectivePermissionAbility = MongoAbility<[
  DirectivePermissionAction,
  DirectiveId
]>;

/**
 * Spike-only mirror of the current authoritative IdleKit control requirements.
 * If CASL is adopted, this mapping should be generated from shared directive metadata
 * rather than maintained independently.
 */
export const DIRECTIVE_CONTROL_DOMAINS: Readonly<Record<DirectiveId, readonly ControlDomain[]>> = {
  "reserve-compute": ["financial", "compute"],
  "acquire-energy": ["financial", "energy"],
  "spawn-sub-agent": ["compute", "energy"],
  "procurement-mesh": ["financial", "logistics"],
  "sovereign-grid": ["compute", "energy", "logistics"],
};

export function deriveDirectiveAbility(state: GameState): DirectivePermissionAbility {
  const { can, cannot, build } = new AbilityBuilder<DirectivePermissionAbility>(createMongoAbility);

  for (const id of Object.keys(DIRECTIVE_CONTROL_DOMAINS) as DirectiveId[]) {
    can("issue_directive", id);
    if (DIRECTIVE_CONTROL_DOMAINS[id].some((domain) => state.controlLoss[domain])) {
      cannot("issue_directive", id);
    }
  }

  return build();
}

export function canIssueDirectiveByControl(state: GameState, id: DirectiveId): boolean {
  return deriveDirectiveAbility(state).can("issue_directive", id);
}
