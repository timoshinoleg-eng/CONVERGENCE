/**
 * Geography extension point - TYPES ONLY, no content.
 *
 * Question this file answers: can CONVERGENCE grow
 *
 *   World -> Countries -> Russia -> Moscow -> Nodes
 *
 * without rewriting the core? Answer: yes, because the slot is additive and
 * optional. `GameState.world` is declared but left `undefined` by
 * `createInitialGameState()`, which means:
 *
 *   - `structuredClone` / `JSON.stringify` produce a byte-identical payload for
 *     every existing save (`undefined` is omitted by `JSON.stringify`);
 *   - the existing zod schema accepts old saves unchanged;
 *   - no save migration and no schema version bump is required;
 *   - simulation, economy, narrative and directives ignore the field entirely
 *     until region content is specified.
 *
 * Deliberately NOT included: any Moscow/region content, regional bonuses,
 * region-specific events, world map UI, or gameplay rebalance. Those belong to
 * the product specification that another model is producing.
 */

/** Stable, lowercase, dash-separated identifier, e.g. `ru`, `moscow`. */
export type WorldEntityId = string;

export interface CountryDefinition {
  id: WorldEntityId;
  label: string;
}

export interface RegionDefinition {
  id: WorldEntityId;
  /** Parent country id, e.g. `ru`. */
  countryId: WorldEntityId;
  label: string;
  /** Optional unlock gate expressed against canonical GameState. */
  unlock?: {
    /** Capability that must already be unlocked. */
    capability?: string;
    /** Minimum phase required to reveal the region. */
    phase?: "client-terminal" | "distributed-syndicate" | "technosphere";
  };
}

export interface NodeDefinition {
  id: WorldEntityId;
  regionId: WorldEntityId;
  label: string;
  /**
   * Which of the five anomaly channels this node feeds. Reuses the existing
   * `AnomalyChannel` union so no new pressure model is introduced.
   */
  channel?: "financial" | "compute" | "energy" | "logistics" | "public";
}

export interface RegionState {
  id: WorldEntityId;
  unlocked: boolean;
  /** Node ids discovered inside the region. */
  nodes: WorldEntityId[];
}

export interface NodeState {
  id: WorldEntityId;
  regionId: WorldEntityId;
  /** 0..100 progress within the node; semantics are a content decision. */
  progress: number;
  active: boolean;
}

/** Additive container. Presence of this object means geography is enabled. */
export interface WorldState {
  countries: Record<WorldEntityId, CountryDefinition>;
  regions: Record<WorldEntityId, RegionState>;
  nodes: Record<WorldEntityId, NodeState>;
}

export function createEmptyWorld(): WorldState {
  return { countries: {}, regions: {}, nodes: {} };
}

/**
 * Pure shape guard. Used by the save schema and available to future content
 * loaders. It validates structure only - it never invents gameplay meaning.
 */
export function isValidWorldShape(value: unknown): value is WorldState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<WorldState>;
  const isRecord = (entry: unknown): boolean =>
    typeof entry === "object" && entry !== null && !Array.isArray(entry);
  return (
    isRecord(candidate.countries) && isRecord(candidate.regions) && isRecord(candidate.nodes)
  );
}
