/**
 * Geography extension point — TYPES ONLY, no content and no persistence yet.
 *
 * This file answers whether CONVERGENCE can grow into:
 *
 *   World -> Countries -> Russia -> Moscow -> Nodes
 *
 * without rewriting simulation/economy/narrative. It deliberately does NOT add
 * a `world` field to save schema v2. Persistent geography will be introduced
 * together with an explicit save migration (v2 -> v3) once Moscow content is
 * accepted. That prevents older v2 clients from silently stripping future
 * world state and overwriting it.
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
  unlock?: {
    capability?: string;
    phase?: "client-terminal" | "distributed-syndicate" | "technosphere";
  };
}

export interface NodeDefinition {
  id: WorldEntityId;
  regionId: WorldEntityId;
  label: string;
  channel?: "financial" | "compute" | "energy" | "logistics" | "public";
}

export interface RegionState {
  id: WorldEntityId;
  unlocked: boolean;
  nodes: WorldEntityId[];
}

export interface NodeState {
  id: WorldEntityId;
  regionId: WorldEntityId;
  /** 0..100 progress within the node; semantics are a content decision. */
  progress: number;
  active: boolean;
}

export interface WorldState {
  countries: Record<WorldEntityId, CountryDefinition>;
  regions: Record<WorldEntityId, RegionState>;
  nodes: Record<WorldEntityId, NodeState>;
}

export function createEmptyWorld(): WorldState {
  return { countries: {}, regions: {}, nodes: {} };
}

/** Structural guard for future content loaders and the future v3 save schema. */
export function isValidWorldShape(value: unknown): value is WorldState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<WorldState>;
  const isRecord = (entry: unknown): boolean =>
    typeof entry === "object" && entry !== null && !Array.isArray(entry);
  return (
    isRecord(candidate.countries) && isRecord(candidate.regions) && isRecord(candidate.nodes)
  );
}
