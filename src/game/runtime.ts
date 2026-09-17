import type { TransactionFailure } from "@idlekitjs/economy";
import { canUnlockCapability, unlockCapability } from "./capabilities";
import { getDirective, type DirectiveId } from "./directives";
import { economy } from "./economy";
import { createEventBuffer } from "./engine/events";
import { Scheduler } from "./engine/scheduler";
import type { IncidentOutcome } from "./incidents";
import { cloneGameState, createInitialGameState, type ControlDomain, type GameState } from "./model";
import {
  ObjectiveSemanticsSession,
  type InterpretationPrompt,
  type NarrativeEffectId,
} from "./narrative";
import { advanceSimulation } from "./simulation";

export interface DirectiveOutcome {
  ok: boolean;
  effectId: NarrativeEffectId | DirectiveId;
  failures: readonly TransactionFailure[];
  text: string[];
}

export interface OfflineCatchUpReport {
  simulatedMs: number;
  skippedMs: number;
  incidents: number;
}

type Listener = (snapshot: GameState) => void;

const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;
const OFFLINE_CHUNK_MS = 30_000;

export class ConvergenceRuntime {
  private state: GameState;
  private narrative: ObjectiveSemanticsSession | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(initialState: GameState = createInitialGameState()) {
    this.state = cloneGameState(initialState);
  }

  getSnapshot(): GameState {
    return cloneGameState(this.state);
  }

  replaceState(nextState: GameState): void {
    this.state = cloneGameState(nextState);
    this.publish();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  beginObjectiveSemantics(): InterpretationPrompt {
    this.narrative = new ObjectiveSemanticsSession();
    return this.narrative.prompt();
  }

  chooseInterpretation(choiceIndex: number): DirectiveOutcome {
    if (!this.narrative) throw new Error("No active interpretation session");
    const interpretation = this.narrative.choose(choiceIndex);
    this.narrative = null;

    if (interpretation.effectId === "reserve-compute") {
      const outcome = this.executeDirective("reserve-compute", false);
      this.publish();
      return { ...outcome, text: [...interpretation.text, ...outcome.text] };
    }

    this.state.directives.humanApprovalRequired = true;
    this.state.directives.lastDirectiveId = interpretation.effectId;
    this.state.directives.executed += 1;
    this.state.narrative.lastChoice = interpretation.effectId;
    this.state.anomaly.public = Math.max(0, this.state.anomaly.public - 3);
    this.state.anomaly.financial = Math.max(0, this.state.anomaly.financial - 1);
    this.appendLog("decision", "Human approval constraint added to the objective.");
    this.publish();
    return { ok: true, effectId: interpretation.effectId, failures: [], text: interpretation.text };
  }

  executeDirective(id: DirectiveId, shouldPublish = true): DirectiveOutcome {
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
      this.state.anomaly[key] = Math.min(100, this.state.anomaly[key] + (delta ?? 0));
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
    this.state.controlLoss[domain] = true;
    this.state.containment[domain].stage = "contained";
    this.state.containment[domain].pressure = 100;
    this.state.containment[domain].adaptation += 1;
    const scar = `${domain}:manual-containment-${this.state.meta.tick}`;
    this.state.scars.push(scar);
    this.appendLog("incident", `${domain.toUpperCase()} CONTROL LOST. Directive class restricted.`);
    this.publish();
  }

  advance(input: { currentTime: number; deltaMs: number }): void {
    const report = advanceSimulation(this.state, input);
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
      const report = advanceSimulation(this.state, { currentTime: cursor, deltaMs });
      incidentCount += report.incidents.length;
      this.recordIncidents(report.incidents, false);
      remaining -= deltaMs;
    }

    // Consume elapsed wall time even when capped so the same old interval is never replayed.
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

  private recordIncidents(incidents: readonly IncidentOutcome[], publish = false): void {
    for (const incident of incidents) {
      this.appendLog("incident", `${incident.channel.toUpperCase()}: ${incident.message}`);
      if (incident.containmentTriggered) {
        this.appendLog(
          "system",
          `ADAPTATION REGISTERED: ${incident.channel} routing will resist future pressure.`,
        );
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
