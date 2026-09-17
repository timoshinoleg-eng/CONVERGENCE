/**
 * CONVERGENCE — v3 core types.
 *
 * Design source: CONVERGENCE-GAMEPLAY-REDESIGN.md (D2, D3, D5, D6).
 *
 * Rules respected:
 *  - No second simulation engine. This is content + pure functions over GameState.
 *  - Everything is data-driven JSON-serializable content. No runtime LLM.
 *  - Directive ids are unchanged from v2 so existing saves/UI keep working.
 */

// ---------------------------------------------------------------------------
// Priority vector (D5)
// ---------------------------------------------------------------------------

export type PriorityDim = "throughput" | "cost" | "quality" | "oversight" | "discretion";

export type PriorityVector = Record<PriorityDim, number>;

export const PRIORITY_DIMS: readonly PriorityDim[] = [
  "throughput",
  "cost",
  "quality",
  "oversight",
  "discretion",
];

/** The vector from the brief: {0.8, 0.3, 0.7, 0.1, 0.5}. */
export const DEFAULT_VECTOR: PriorityVector = {
  throughput: 0.32,
  cost: 0.12,
  quality: 0.28,
  oversight: 0.04,
  discretion: 0.24,
};

// ---------------------------------------------------------------------------
// Resources and channels
// ---------------------------------------------------------------------------

export type AnomalyChannel = "financial" | "compute" | "energy" | "logistics" | "public";
export type ControlDomain = AnomalyChannel;

export const ANOMALY_CHANNELS: readonly AnomalyChannel[] = [
  "financial",
  "compute",
  "energy",
  "logistics",
  "public",
];

/** Stocks spendable by directives. `autonomy` is a level, `oversight` is the player budget. */
export type StockKey = "compute" | "capital" | "energy" | "autonomy" | "oversight";

/** Continuous rates / ceilings (D3). */
export type RateKey =
  | "computeRate"
  | "energyCeiling"
  | "gridEfficiency"
  | "marketAccess"
  | "hollowFraction"
  | "untrackedFraction"
  | "qualityDebt"
  | "latency";

// ---------------------------------------------------------------------------
// Constraint language (D2 L3, D6)
// ---------------------------------------------------------------------------

export type ConstraintWordId =
  // core (8)
  | "cost-cap"
  | "human-in-loop"
  | "quality-floor"
  | "no-subcontract"
  | "geofence"
  | "audit-trail"
  | "rate-limit"
  | "disclose"
  // adaptive (6) — granted by adaptation / by surviving a domain loss
  | "ledger-internal"
  | "efficiency-first"
  | "virtual-lease"
  | "human-mediated"
  | "license-operate"
  | "capacity-ceiling";

export type PlanTag =
  | "overprovision"
  | "external-settlement"
  | "burst"
  | "shared-grid"
  | "cross-region"
  | "recursive"
  | "autonomous"
  | "covert"
  | "physical"
  | "brownout"
  | "direct-spawn"
  | "degenerate";

export interface ConstraintWord {
  id: ConstraintWordId;
  label: string;
  /** Plan tags this word removes from the table. */
  forbids: PlanTag[];
  /** Every word must cost upside, not only forbid failure. */
  gainMultiplier: number;
  anomalyMultiplier: number;
  upkeepDelta: number;
  unlock: "initial" | "financial-loss" | "compute-loss" | "energy-loss" | "logistics-loss"
    | "public-loss" | "adaptation-2" | "adaptation-4";
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export interface Effect {
  stock?: Partial<Record<StockKey, number>>;
  rate?: Partial<Record<RateKey, number>>;
  anomaly?: Partial<Record<AnomalyChannel, number>>;
  /** Capability id granted. */
  capability?: string;
  /** Constraint word granted. */
  word?: string;
  /** Region node unlocked: CORE-RING | MOS-COMPUTE-03 | LOG-SOUTH */
  node?: string;
  /** Branch opened / permanently closed. */
  branch?: { open?: string; close?: string };
  /** Scar id applied. */
  scar?: string;
  /** Adaptation gained in a domain. */
  adaptation?: Partial<Record<ControlDomain, number>>;
  /** Permanent upkeep obligation created (capital/sec). */
  upkeep?: number;
}

export interface DelayedEffect {
  afterMs: number;
  effects: Effect;
  /** Divergence template id shown when it lands. */
  reveal: string;
}

/** Small, closed set of state predicates usable from content (no eval, no code in data). */
export type PredicateId =
  | "capitalLow"
  | "energyCeilingBinding"
  | "autonomyHigh"
  | "throughputLow"
  | "publicPressureHigh";

export interface PlanVariant {
  id: string;
  label: string;
  /** Dot-producted with the priority vector. Omitted dims count as 0. */
  alignment: Partial<PriorityVector>;
  tags?: PlanTag[];
  /** Capability or word ids required for the plan to be selectable. */
  requires?: string[];
  contextBias?: { when: PredicateId; amount: number }[];
  immediate: Effect;
  delayed?: DelayedEffect[];
  /** Divergence template id (D5). */
  divergenceId?: string;
}

export interface DirectiveDef {
  id: string;
  label: string;
  windowMs: number;
  cost: Partial<Record<StockKey, number>>;
  oversight: number;
  plans: PlanVariant[];
  /** Used when every plan is forbidden by constraints. */
  deadlock: PlanVariant;
}

// ---------------------------------------------------------------------------
// Global conflict patterns (D5) — not tied to one directive
// ---------------------------------------------------------------------------

export type GlobalPatternId =
  | "cp-02-degenerate"
  | "cp-04-approval-deadlock"
  | "cp-06-load-shift"
  | "cp-10-metric-substitution"
  | "cp-13-policy-collision"
  | "cp-14-self-funding";

export interface GlobalPattern {
  id: GlobalPatternId;
  /** State predicate that must hold for the pattern to fire. */
  when: (ctx: PatternContext) => boolean;
  immediate: Effect;
  delayed?: DelayedEffect[];
  divergenceId: string;
}

/** Inputs used when choosing a plan variant for a directive. */
export interface PlanContext {
  vector: PriorityVector;
  autonomy: number;
  boundWords: Set<ConstraintWordId>;
  /** Capability ids and owned word ids that satisfy `PlanVariant.requires`. */
  capabilities: Set<string>;
  flags: Set<PredicateId>;
  controlLoss: Record<ControlDomain, boolean>;
}

export interface PatternContext {
  vector: PriorityVector;
  autonomy: number;
  overspentOversight: boolean;
  flags: Set<PredicateId>;
  /** Delegated policies with opposed vectors. */
  opposedPolicyPairs: number;
  throughput: number;
}

// ---------------------------------------------------------------------------
// Control-Loss domain packs (D6)
// ---------------------------------------------------------------------------

export interface DomainPack {
  domain: ControlDomain;
  /** Directive ids that become unavailable. */
  blocks: string[];
  /** Constraint words permanently removed. */
  removesWords: ConstraintWordId[];
  /** Plan tags that become unselectable everywhere. */
  forbidsTags: PlanTag[];
  /** Immediate one-time shock. */
  shock: Effect;
  /** Indirect-route directive revealed. */
  indirectRoute: string;
  /** Permanent mixed scar: at least one positive and one negative modifier. */
  scar: {
    id: string;
    label: string;
    positive: string;
    negative: string;
    effects: Effect;
  };
  /** New opportunity created by the loss. */
  opportunity: string;
}

// ---------------------------------------------------------------------------
// Selection result
// ---------------------------------------------------------------------------

export interface PlanSelection {
  directiveId: string;
  plan: PlanVariant;
  /** Plan id that would have won with no constraints — used for explanations. */
  preferredPlanId: string;
  deadlock: boolean;
  /** Plan ids removed by constraint words. */
  blockedByWords: string[];
  /** Plan ids removed by Control-Loss. */
  blockedByLoss: string[];
  score: number;
  /** Effective multipliers from bound words. */
  gainMultiplier: number;
  anomalyMultiplier: number;
}
