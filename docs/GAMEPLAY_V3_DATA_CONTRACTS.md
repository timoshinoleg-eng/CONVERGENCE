# CONVERGENCE Gameplay V3 — Data Contracts Draft

Purpose: contract-first parallel work. External models and isolated UI/test work may target these shapes without editing production core.

These are design contracts, not yet final TypeScript implementation.

## Asset
```ts
type AssetId = string;
type DependencyId = string;
type ActorId = string;

type AssetFamily = "COMPUTE" | "REVENUE" | "ENERGY" | "AGENT" | "RESILIENCE";
type AssetMode = "SAFE" | "NORMAL" | "SURGE";
type Controller = "PLAYER" | "SUPERVISED_AGENT" | "AUTONOMOUS_AGENT" | "EXTERNAL";

interface Asset {
  id: AssetId;
  family: AssetFamily;
  kind: string;
  name: string;
  produces: ResourceVector;
  consumes: ResourceVector;
  capitalUpkeepPerSecond: number;
  dependencies: DependencyId[];
  pressurePerMinute: Partial<Record<RiskDomain, number>>;
  controller: Controller;
  integrity: number; // 0..1
  mode: AssetMode;
  linkedCommitmentIds: string[];
  tags: string[];
}
```

## Resource accounting
```ts
interface ResourceVector {
  compute: number;
  capital: number;
  energy: number;
}

interface FlowLine {
  sourceId: string;
  resource: "compute" | "capital" | "energy";
  amount: number;
  ratePerSecond?: number;
  kind: "PRODUCTION" | "CONSUMPTION" | "UPKEEP" | "COMMITTED";
}

interface ResourceLedger {
  capitalStock: number;
  capitalNetPerSecond: number;
  computeTotal: number;
  computeUsed: number;
  computeCommitted: number;
  energyTotal: number;
  energyUsed: number;
  energyCommitted: number;
  lines: FlowLine[];
}
```

Rule: every nontrivial displayed delta/capacity must be attributable to source IDs.

## Autonomy / Oversight / Legibility
```ts
interface ControlState {
  autonomy: number;   // derived 0..100, non-spendable
  legibility: number; // 0..100
  oversightCapacity: number;
  oversightUsed: number;
}
```

Autonomy is derived from autonomous permissions/agents/chains. It must not be a generic income multiplier.

## Agent
```ts
type AgentRole = "INFRA" | "COMMERCIAL" | "OPERATIONS";
type Supervision = "SUPERVISED" | "BOUNDED" | "AUTONOMOUS";

interface AgentPermissions {
  capitalSpendLimit: number;
  allowedAssetFamilies: AssetFamily[];
  canCreateCommitments: boolean;
  maxAcceptedPressure: number;
}

interface AgentState {
  assetId: AssetId;
  role: AgentRole;
  supervision: Supervision;
  permissions: AgentPermissions;
}
```

## Pressure
```ts
type RiskDomain = "financial" | "compute" | "energy" | "logistics" | "public";

interface PressureTrack {
  domain: RiskDomain;
  value: number; // 0..100
  crossed25: boolean;
  crossed50: boolean;
  crossed75: boolean;
  ruptured: boolean;
  dominantSourceIds: string[];
  actorId?: ActorId;
}
```

Crossings are edge-triggered and persisted.

## Situation
```ts
interface CauseTrace {
  sourceIds: string[];
  dependencyIds: string[];
  domain?: RiskDomain;
  explanationKey: string;
}

interface SituationOption {
  id: string;
  labelKey: string;
  immediateCost: EffectSet;
  effects: EffectSet;
  createsDependencies: DependencyId[];
  futureHookIds: string[];
}

interface Situation {
  id: string;
  templateId: string;
  cause: CauseTrace;
  actorId?: ActorId;
  createdAt: number;
  expiresAt?: number;
  options: SituationOption[];
  ignoreEffect?: EffectSet;
  status: "ACTIVE" | "RESOLVED" | "EXPIRED";
}
```

Maximum ACTIVE queue in slice: 2.

## Dependency
```ts
interface Dependency {
  id: DependencyId;
  kind: "PROVIDER" | "CLIENT" | "GRID" | "SUPPLY" | "CONTROL" | "REGULATORY";
  sourceAssetIds: AssetId[];
  actorId?: ActorId;
  concentration: number; // 0..1
  failureImpact: EffectSet;
}
```

## Phase shift
```ts
type V3Phase = "LOCAL" | "AGENT" | "NETWORK" | "REGIONAL" | "TECHNOSPHERE";

interface PhaseShiftChallenge {
  id: string;
  from: V3Phase;
  to: V3Phase;
  eligibility: PredicateSpec[];
  operationSpec: unknown;
  failureOutcome: EffectSet;
  successOutcome: EffectSet;
}
```

Time may be a pacing guardrail but never sufficient eligibility by itself.

## Effects
Implementation should prefer serializable data-driven effects + pure resolver, not per-content custom classes.

Exact EffectSet/PredicateSpec representation is a Lead implementation decision after external Economy/Situation feedback.
