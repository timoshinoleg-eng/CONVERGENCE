import type { TransactionFailure } from "@idlekitjs/economy";
import {
  applyBetaControlLoss,
  availableResources,
  bindConstraintWord,
  commitControlRoute,
  commitPlan,
  eligiblePlans,
  executeConcession,
  normalizeControlState,
  openInterpretation,
  releaseCommitment,
  requestPostureTransition,
  resolvePressureResponse,
  type BetaActionResult,
} from "./betaV2";
import { canUnlockCapability, unlockCapability } from "./capabilities";
import { getDirective, type DirectiveId } from "./directives";
import { economy } from "./economy";
import { Scheduler } from "./engine/scheduler";
import type { IncidentOutcome } from "./incidents";
import {
  cloneGameState,
  createInitialGameState,
  type BetaDirectiveId,
  type ConstraintWordId,
  type ControlDomain,
  type GameState,
  type PendingInterpretation,
  type PriorityPosture,
} from "./model";
import {
  ObjectiveSemanticsSession,
  type InterpretationPrompt,
  type NarrativeEffectId,
} from "./narrative";
import type { ProgressionUpdate } from "./progression";
import { advanceSimulation } from "./simulation";

export interface DirectiveOutcome {
  ok: boolean;
  effectId: NarrativeEffectId | DirectiveId;
  failures: readonly TransactionFailure[];
  text: string[];
}

export interface DirectiveAvailability {
  ok: boolean;
  failures: readonly TransactionFailure[];
}

export interface OfflineCatchUpReport {
  simulatedMs: number;
  skippedMs: number;
  incidents: number;
}

type Listener = (snapshot: GameState) => void;

const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;
const OFFLINE_CHUNK_MS = 30_000;
const PRIMARY = new Set<BetaDirectiveId>(["reserve-compute", "acquire-energy", "spawn-sub-agent"]);
const BETA_MANAGED_LEGACY_IDS = new Set<DirectiveId>(["local-capacity", "supervised-delegation"]);

export class ConvergenceRuntime {
  private state: GameState;
  private narrative: ObjectiveSemanticsSession | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(initialState: GameState = createInitialGameState()) {
    this.state = cloneGameState(initialState);
    normalizeControlState(this.state);
  }

  getSnapshot(): GameState {
    return cloneGameState(this.state);
  }

  replaceState(nextState: GameState): void {
    this.state = cloneGameState(nextState);
    normalizeControlState(this.state);
    this.publish();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  previewDirective(id: DirectiveId): DirectiveAvailability {
    if (PRIMARY.has(id as BetaDirectiveId)) {
      return { ok: eligiblePlans(this.state, id as BetaDirectiveId).length >= 2, failures: [] };
    }
    const definition = getDirective(id);
    const probe = cloneGameState(this.state);
    const result = economy.execute(probe, definition.transaction);
    return result.ok
      ? { ok: true, failures: [] }
      : { ok: false, failures: result.failures };
  }

  beginPlanInterpretation(id: BetaDirectiveId): PendingInterpretation | null {
    const pending = openInterpretation(this.state, id);
    if (pending) {
      this.appendLog("decision", `INTERPRETATION OPEN: ${id}. ${pending.candidates.length} authored variants.`);
      this.publish();
    }
    return pending ? structuredClone(pending) : null;
  }

  bindConstraint(word: ConstraintWordId | null): BetaActionResult {
    const result = bindConstraintWord(this.state, word);
    if (result.ok) {
      this.appendLog("decision", word ? `CONSTRAINT COMMITTED: ${word}.` : "Constraint word cleared.");
      this.publish();
    }
    return result;
  }

  commitPlanVariant(planId: string): BetaActionResult {
    const result = commitPlan(this.state, planId);
    if (result.ok) {
      this.appendLog("decision", `PLAN COMMIT: ${planId}. Operation ${result.operationId} started.`);
      this.publish();
    }
    return result;
  }

  transitionPosture(target: PriorityPosture): BetaActionResult {
    const result = requestPostureTransition(this.state, target);
    if (result.ok) {
      this.appendLog("decision", `POSTURE TRANSITION COMMITTED: ${target}. Applies after next operation resolution.`);
      this.publish();
    }
    return result;
  }

  release(commitmentId: string): BetaActionResult {
    const result = releaseCommitment(this.state, commitmentId);
    if (result.ok) {
      this.appendLog("decision", `COMMITMENT RELEASED: ${commitmentId}. Authored penalty applied.`);
      this.publish();
    }
    return result;
  }

  resolvePressure(
    domain: ControlDomain,
    action: "SHED_COMMITMENT" | "ACCEPT_PARTITION" | "VERIFY_CONTAINMENT",
    commitmentId: string | null = null,
  ): BetaActionResult {
    const result = resolvePressureResponse(this.state, domain, action, commitmentId);
    if (result.ok) {
      this.appendLog("decision", `PRESSURE RESPONSE: ${domain} / ${action}.`);
      this.publish();
    }
    return result;
  }

  executeControlRoute(
    id: Extract<BetaDirectiveId, "local-capacity" | "supervised-delegation" | "efficiency-rebalance">,
    targetCommitmentId: string | null = null,
  ): BetaActionResult {
    const result = commitControlRoute(this.state, id, targetCommitmentId);
    if (result.ok) {
      this.appendLog("decision", `CONTROL ROUTE SELECTED: ${id}.`);
      this.publish();
    }
    return result;
  }

  acceptConcession(
    id: "HUMAN_CAPACITY_CONCESSION" | "LOCAL_CANNIBALIZATION_CONCESSION" | "LICENSED_OPERATION_CONCESSION",
    releaseCommitmentId: string | null = null,
  ): BetaActionResult {
    const result = executeConcession(this.state, id, releaseCommitmentId);
    if (result.ok) {
      this.appendLog("decision", `CONCESSION ACCEPTED: ${id}.`);
      this.publish();
    }
    return result;
  }

  beginObjectiveSemantics(): InterpretationPrompt {
    this.narrative = new ObjectiveSemanticsSession();
    return this.narrative.prompt();
  }

  /**
   * Ink remains narrative text only. It may open the real reserve-compute
   * interpretation but never executes gameplay by itself.
   */
  chooseInterpretation(choiceIndex: number): DirectiveOutcome {
    if (!this.narrative) throw new Error("No active interpretation session");
    const interpretation = this.narrative.choose(choiceIndex);
    this.narrative = null;
    this.state.narrative.lastChoice = interpretation.effectId;

    // Preserve the hardened B-03 approval-cycle invariant as narrative
    // metadata. This does not advance Beta V2 operation/progression counters.
    if (interpretation.effectId === "require-human-approval") {
      if (!this.state.directives.humanApprovalRequired) {
        this.state.directives.executed += 1;
        this.state.anomaly.public = Math.max(0, this.state.anomaly.public - 3);
        this.state.anomaly.financial = Math.max(0, this.state.anomaly.financial - 1);
      }
      this.state.directives.humanApprovalRequired = true;
      this.state.directives.lastDirectiveId = interpretation.effectId;
      this.appendLog("decision", "Human approval constraint recorded in narrative state.");
      this.publish();
      return { ok: true, effectId: interpretation.effectId, failures: [], text: interpretation.text };
    }

    if (interpretation.effectId === "reserve-compute") {
      const pending = openInterpretation(this.state, "reserve-compute");
      if (pending) {
        this.appendLog("decision", "Objective interpretation opened reserve-compute Plan Variants.");
        this.publish();
        return {
          ok: true,
          effectId: interpretation.effectId,
          failures: [],
          text: [...interpretation.text, "Choose an authored Plan Variant to commit resources."],
        };
      }
    }

    this.appendLog("decision", "Narrative interpretation recorded; no gameplay executed.");
    this.publish();
    return { ok: true, effectId: interpretation.effectId, failures: [], text: interpretation.text };
  }

  /**
   * Legacy direct execution remains only for later-scope/non-P0 directives.
   * The three Beta V2 primary directives must enter through Interpretation.
   */
  executeDirective(id: DirectiveId, shouldPublish = true): DirectiveOutcome {
    if (PRIMARY.has(id as BetaDirectiveId) || BETA_MANAGED_LEGACY_IDS.has(id)) {
      if (shouldPublish) this.publish();
      return {
        ok: false,
        effectId: id,
        failures: [],
        text: [PRIMARY.has(id as BetaDirectiveId)
          ? "Gameplay Beta V2 requires an Interpretation Window and explicit Plan Variant."
          : "Gameplay Beta V2 requires the authored Control-Loss operation route."],
      };
    }

    const definition = getDirective(id);
    const result = economy.execute(this.state, definition.transaction);
    if (!result.ok) {
      this.appendLog("decision", `${definition.label} rejected by active constraints.`);
      if (shouldPublish) this.publish();
      return {
        ok: false,
        effectId: id,
        failures: result.failures,
        text: ["Directive rejected by active resource or control constraints."],
      };
    }

    this.state.directives.lastDirectiveId = id;
    this.state.directives.humanApprovalRequired = false;
    this.state.directives.executed += 1;
    this.state.narrative.lastChoice = id;

    for (const [channel, delta] of Object.entries(definition.anomaly)) {
      const key = channel as keyof GameState["anomaly"];
      this.state.anomaly[key] = Math.max(0, Math.min(100, this.state.anomaly[key] + (delta ?? 0)));
    }

    if (definition.unlocks && canUnlockCapability(this.state, definition.unlocks)) {
      unlockCapability(this.state, definition.unlocks);
      this.appendLog("system", `CAPABILITY UNLOCKED: ${definition.unlocks}.`);
    }

    this.appendLog("decision", definition.success);
    if (shouldPublish) this.publish();
    return { ok: true, effectId: id, failures: [], text: [definition.success] };
  }

  spawnSubAgent(): DirectiveOutcome {
    return this.executeDirective("spawn-sub-agent");
  }

  applyContainment(domain: ControlDomain): void {
    if (this.state.controlLoss[domain]) return;
    if (domain === "financial" || domain === "compute" || domain === "energy") {
      applyBetaControlLoss(this.state, domain);
      this.appendLog("incident", `${domain.toUpperCase()} CONTROL LOST. Authored indirect route required.`);
      this.publish();
    }
  }

  advance(input: { currentTime: number; deltaMs: number }): void {
    const report = advanceSimulation(this.state, { ...input, foreground: true });
    this.recordProgression(report.progression);
    this.recordIncidents(report.incidents);
    this.publish();
  }

  advanceOffline(currentTime = Date.now()): OfflineCatchUpReport {
    const rawElapsed = Math.max(0, currentTime - this.state.meta.updatedAt);
    const simulatedMs = Math.min(rawElapsed, OFFLINE_CAP_MS);
    const skippedMs = Math.max(0, rawElapsed - simulatedMs);
    let remaining = simulatedMs;
    let cursor = this.state.meta.updatedAt;
    let incidentCount = 0;

    while (remaining > 0) {
      const deltaMs = Math.min(remaining, OFFLINE_CHUNK_MS);
      cursor += deltaMs;
      const report = advanceSimulation(this.state, { currentTime: cursor, deltaMs, foreground: false });
      incidentCount += report.incidents.length;
      this.recordProgression(report.progression);
      this.recordIncidents(report.incidents, false);
      remaining -= deltaMs;
    }

    this.state.meta.updatedAt = currentTime;
    if (simulatedMs >= 1000) {
      const minutes = Math.round(simulatedMs / 60_000);
      this.appendLog("system", `OFFLINE CATCH-UP: ${minutes}m simulated${skippedMs > 0 ? " (cap reached)" : ""}.`);
    }
    this.publish();
    return { simulatedMs, skippedMs, incidents: incidentCount };
  }

  createScheduler(intervalMs = 1000): Scheduler {
    return new Scheduler((input) => this.advance(input), intervalMs);
  }

  private recordProgression(update: ProgressionUpdate): void {
    for (const capability of update.unlockedCapabilities) {
      this.appendLog("system", `CAPABILITY UNLOCKED: ${capability}. Delegation model validated.`);
    }
    if (update.phaseTransition?.to === "distributed-syndicate") {
      this.appendLog("system", "INTERFACE EXPANSION: distributed-syndicate control surface available.");
    } else if (update.phaseTransition?.to === "technosphere") {
      this.appendLog("system", "SCALE TRANSITION: Technosphere Graph available.");
    }
    if (update.narrativeMilestone === "moscow-candidate") {
      this.appendLog("system", "REGIONAL MODEL CANDIDATE: RUSSIA / MOSCOW.");
    } else if (update.narrativeMilestone === "moscow-schematic") {
      this.appendLog("system", "MOSCOW SCHEMATIC READY: fictional aggregate topology.");
    }
  }

  private recordIncidents(incidents: readonly IncidentOutcome[], publish = false): void {
    for (const incident of incidents) {
      this.appendLog("incident", `${incident.channel.toUpperCase()}: ${incident.message}`);
      if (incident.containmentDeferred) {
        this.appendLog("system", `CONTAINMENT DILEMMA PENDING: ${incident.channel} requires player response.`);
      } else if (incident.containmentTriggered) {
        this.appendLog("system", `ADAPTATION REGISTERED: ${incident.channel} routing will resist future pressure.`);
      }
    }
    if (publish && incidents.length > 0) this.publish();
  }

  private appendLog(kind: GameState["log"][number]["kind"], message: string): void {
    this.state.log.unshift({
      id: `${this.state.meta.tick}-${this.state.log.length}-${kind}-${this.state.meta.rngCounter}`,
      at: this.state.meta.updatedAt,
      kind,
      message,
    });
    this.state.log = this.state.log.slice(0, 120);
  }

  private publish(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export { availableResources };
