import { DIRECTIVES, type DirectiveId } from "../directives";
import { createInitialGameState, type ControlDomain, type GameState, type Phase } from "../model";
import { ConvergenceRuntime } from "../runtime";

export interface PacingMilestones {
  firstDirectiveMs: number | null;
  subAgentCapabilityMs: number | null;
  distributedSyndicateMs: number | null;
  sovereignGridMs: number | null;
  technosphereMs: number | null;
  firstContainmentMs: number | null;
}

export interface PacingAction {
  atMs: number;
  directive: DirectiveId;
}

export interface PacingScenarioReport {
  name: string;
  seed: number;
  durationMs: number;
  actionIntervalMs: number;
  finalPhase: Phase;
  milestones: PacingMilestones;
  successfulActions: PacingAction[];
  failedActionAttempts: number;
  finalResources: GameState["resources"];
  finalAnomaly: GameState["anomaly"];
  finalControlLoss: GameState["controlLoss"];
  scars: number;
}

export interface ControlLossCoverage {
  domain: ControlDomain;
  blockedDirectives: DirectiveId[];
}

export interface PacingSuiteReport {
  generatedFromSchemaVersion: GameState["schemaVersion"];
  scenarios: PacingScenarioReport[];
  controlLossCoverage: ControlLossCoverage[];
}

interface ScenarioDefinition {
  name: string;
  seed: number;
  durationMs: number;
  actionIntervalMs: number;
  initialContainment?: ControlDomain;
  chooseDirective: (state: GameState) => DirectiveId | null;
}

const STEP_MS = 1_000;

function canExecute(state: GameState, id: DirectiveId): boolean {
  return new ConvergenceRuntime(state).executeDirective(id).ok;
}

function aggressiveDirective(state: GameState): DirectiveId | null {
  if (!state.capabilities["sub-agent-spawning"] && canExecute(state, "reserve-compute")) {
    return "reserve-compute";
  }
  if (state.resources.autonomy < 5 && canExecute(state, "spawn-sub-agent")) {
    return "spawn-sub-agent";
  }
  if (state.resources.energy < 20 && canExecute(state, "acquire-energy")) {
    return "acquire-energy";
  }
  if (!state.capabilities["sovereign-power-grid"] && canExecute(state, "sovereign-grid")) {
    return "sovereign-grid";
  }
  if (state.capabilities["sovereign-power-grid"] && state.resources.autonomy < 20) {
    if (canExecute(state, "spawn-sub-agent")) return "spawn-sub-agent";
    if (canExecute(state, "acquire-energy")) return "acquire-energy";
  }
  if (canExecute(state, "procurement-mesh")) return "procurement-mesh";
  return null;
}

function infrastructureFirstDirective(state: GameState): DirectiveId | null {
  if (state.resources.energy < 28 && canExecute(state, "acquire-energy")) {
    return "acquire-energy";
  }
  return aggressiveDirective(state);
}

function firstExecutableDirective(state: GameState): DirectiveId | null {
  const priority: DirectiveId[] = [
    "reserve-compute",
    "spawn-sub-agent",
    "acquire-energy",
    "procurement-mesh",
    "sovereign-grid",
  ];
  return priority.find((id) => canExecute(state, id)) ?? null;
}

function recordMilestones(
  milestones: PacingMilestones,
  previous: GameState,
  next: GameState,
  elapsedMs: number,
): void {
  if (
    milestones.subAgentCapabilityMs === null
    && !previous.capabilities["sub-agent-spawning"]
    && next.capabilities["sub-agent-spawning"]
  ) {
    milestones.subAgentCapabilityMs = elapsedMs;
  }
  if (
    milestones.distributedSyndicateMs === null
    && previous.meta.phase !== "distributed-syndicate"
    && next.meta.phase === "distributed-syndicate"
  ) {
    milestones.distributedSyndicateMs = elapsedMs;
  }
  if (
    milestones.sovereignGridMs === null
    && !previous.capabilities["sovereign-power-grid"]
    && next.capabilities["sovereign-power-grid"]
  ) {
    milestones.sovereignGridMs = elapsedMs;
  }
  if (
    milestones.technosphereMs === null
    && previous.meta.phase !== "technosphere"
    && next.meta.phase === "technosphere"
  ) {
    milestones.technosphereMs = elapsedMs;
  }
  if (
    milestones.firstContainmentMs === null
    && Object.values(previous.controlLoss).every((lost) => !lost)
    && Object.values(next.controlLoss).some(Boolean)
  ) {
    milestones.firstContainmentMs = elapsedMs;
  }
}

export function runPacingScenario(definition: ScenarioDefinition): PacingScenarioReport {
  const startAt = 1_000;
  const runtime = new ConvergenceRuntime(createInitialGameState(startAt, definition.seed));
  if (definition.initialContainment) runtime.applyContainment(definition.initialContainment);

  const milestones: PacingMilestones = {
    firstDirectiveMs: null,
    subAgentCapabilityMs: null,
    distributedSyndicateMs: null,
    sovereignGridMs: null,
    technosphereMs: null,
    firstContainmentMs: definition.initialContainment ? 0 : null,
  };
  const successfulActions: PacingAction[] = [];
  let failedActionAttempts = 0;

  for (let elapsedMs = STEP_MS; elapsedMs <= definition.durationMs; elapsedMs += STEP_MS) {
    const beforeAction = runtime.getSnapshot();

    if (elapsedMs % definition.actionIntervalMs === 0) {
      const directive = definition.chooseDirective(beforeAction);
      if (directive) {
        const outcome = runtime.executeDirective(directive);
        if (outcome.ok) {
          successfulActions.push({ atMs: elapsedMs, directive });
          if (milestones.firstDirectiveMs === null) milestones.firstDirectiveMs = elapsedMs;
          recordMilestones(milestones, beforeAction, runtime.getSnapshot(), elapsedMs);
        } else {
          failedActionAttempts += 1;
        }
      }
    }

    const beforeAdvance = runtime.getSnapshot();
    runtime.advance({ currentTime: startAt + elapsedMs, deltaMs: STEP_MS });
    recordMilestones(milestones, beforeAdvance, runtime.getSnapshot(), elapsedMs);
  }

  const finalState = runtime.getSnapshot();
  return {
    name: definition.name,
    seed: definition.seed,
    durationMs: definition.durationMs,
    actionIntervalMs: definition.actionIntervalMs,
    finalPhase: finalState.meta.phase,
    milestones,
    successfulActions,
    failedActionAttempts,
    finalResources: finalState.resources,
    finalAnomaly: finalState.anomaly,
    finalControlLoss: finalState.controlLoss,
    scars: finalState.scars.length,
  };
}

export function analyzeControlLossCoverage(): ControlLossCoverage[] {
  const baseline = createInitialGameState(1_000, 4242);
  baseline.resources = { compute: 1_000, capital: 1_000, energy: 1_000, autonomy: 20 };
  baseline.capabilities["sub-agent-spawning"] = true;
  baseline.capabilities["sovereign-power-grid"] = true;

  return (Object.keys(baseline.controlLoss) as ControlDomain[]).map((domain) => {
    const runtime = new ConvergenceRuntime(baseline);
    runtime.applyContainment(domain);
    const state = runtime.getSnapshot();
    const blockedDirectives = DIRECTIVES
      .filter((directive) => !canExecute(state, directive.id))
      .map((directive) => directive.id);
    return { domain, blockedDirectives };
  });
}

export function runBetaPacingSuite(): PacingSuiteReport {
  const scenarios: ScenarioDefinition[] = [
    {
      name: "aggressive-autonomy",
      seed: 42,
      durationMs: 30 * 60_000,
      actionIntervalMs: 5_000,
      chooseDirective: aggressiveDirective,
    },
    {
      name: "measured-growth",
      seed: 42,
      durationMs: 30 * 60_000,
      actionIntervalMs: 30_000,
      chooseDirective: aggressiveDirective,
    },
    {
      name: "infrastructure-first",
      seed: 42,
      durationMs: 30 * 60_000,
      actionIntervalMs: 60_000,
      chooseDirective: infrastructureFirstDirective,
    },
    {
      name: "compute-contained-start",
      seed: 42,
      durationMs: 30 * 60_000,
      actionIntervalMs: 10_000,
      initialContainment: "compute",
      chooseDirective: firstExecutableDirective,
    },
  ];

  return {
    generatedFromSchemaVersion: createInitialGameState(0, 1).schemaVersion,
    scenarios: scenarios.map(runPacingScenario),
    controlLossCoverage: analyzeControlLossCoverage(),
  };
}

export const PROVISIONAL_FIRST_SESSION_TARGETS = {
  firstDirectiveMs: { min: 15_000, max: 120_000 },
  subAgentCapabilityMs: { min: 120_000, max: 360_000 },
  distributedSyndicateMs: { min: 240_000, max: 720_000 },
  technosphereMs: { min: 1_200_000, max: 1_800_000 },
} as const;

export function evaluateProvisionalPacing(report: PacingScenarioReport): string[] {
  const violations: string[] = [];
  const targets = PROVISIONAL_FIRST_SESSION_TARGETS;
  const entries = [
    ["firstDirectiveMs", report.milestones.firstDirectiveMs],
    ["subAgentCapabilityMs", report.milestones.subAgentCapabilityMs],
    ["distributedSyndicateMs", report.milestones.distributedSyndicateMs],
    ["technosphereMs", report.milestones.technosphereMs],
  ] as const;

  for (const [key, actual] of entries) {
    const target = targets[key];
    if (actual === null) {
      violations.push(`${key}: not reached within scenario`);
      continue;
    }
    if (actual < target.min) violations.push(`${key}: ${actual}ms is earlier than ${target.min}ms`);
    if (actual > target.max) violations.push(`${key}: ${actual}ms is later than ${target.max}ms`);
  }
  return violations;
}
