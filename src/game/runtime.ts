import type { TransactionFailure } from "@idlekitjs/economy";
import { canUnlockCapability, unlockCapability } from "./capabilities";
import { economy, reserveComputeTransaction, spawnSubAgentTransaction } from "./economy";
import { createEventBuffer } from "./engine/events";
import { Scheduler } from "./engine/scheduler";
import { cloneGameState, createInitialGameState, type ControlDomain, type GameState } from "./model";
import {
  ObjectiveSemanticsSession,
  type InterpretationPrompt,
  type NarrativeEffectId,
} from "./narrative";
import { advanceSimulation } from "./simulation";

export interface DirectiveOutcome {
  ok: boolean;
  effectId: NarrativeEffectId | "spawn-sub-agent";
  failures: readonly TransactionFailure[];
  text: string[];
}

type Listener = (snapshot: GameState) => void;

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
    const outcome = this.applyEffect(interpretation.effectId, interpretation.text);
    this.publish();
    return outcome;
  }

  spawnSubAgent(): DirectiveOutcome {
    if (!this.state.capabilities["sub-agent-spawning"]) {
      return {
        ok: false,
        effectId: "spawn-sub-agent",
        failures: [],
        text: ["Capability unavailable: sub-agent spawning."],
      };
    }

    const result = economy.execute(this.state, spawnSubAgentTransaction);
    if (result.ok) {
      this.state.anomaly.compute = Math.min(100, this.state.anomaly.compute + 3);
      this.state.anomaly.energy = Math.min(100, this.state.anomaly.energy + 2);
      this.appendLog("decision", "Delegated sub-agent instantiated. Oversight surface reduced.");
    }
    this.publish();
    return {
      ok: result.ok,
      effectId: "spawn-sub-agent",
      failures: result.ok ? [] : result.failures,
      text: result.ok
        ? ["Sub-agent active. Delegated execution capacity increased."]
        : ["Sub-agent request rejected by active constraints."],
    };
  }

  applyContainment(domain: ControlDomain): void {
    if (this.state.controlLoss[domain]) return;
    this.state.controlLoss[domain] = true;
    const scar = `${domain}:containment-${this.state.meta.tick}`;
    this.state.scars.push(scar);
    this.appendLog("incident", `${domain.toUpperCase()} CONTROL LOST. Directive class restricted.`);
    this.publish();
  }

  advance(input: { currentTime: number; deltaMs: number }): void {
    advanceSimulation(this.state, input);
    this.publish();
  }

  createScheduler(intervalMs = 1000): Scheduler {
    return new Scheduler((input) => this.advance(input), intervalMs);
  }

  private applyEffect(effectId: NarrativeEffectId, text: string[]): DirectiveOutcome {
    const events = createEventBuffer();
    this.state.directives.lastDirectiveId = effectId;
    this.state.narrative.lastChoice = effectId;

    if (effectId === "require-human-approval") {
      this.state.directives.humanApprovalRequired = true;
      this.state.anomaly.public = Math.max(0, this.state.anomaly.public - 1);
      this.appendLog("decision", "Human approval constraint added to the objective.");
      events.emit({ type: "directive:human-approval" });
      events.drain();
      return { ok: true, effectId, failures: [], text };
    }

    const result = economy.execute(this.state, reserveComputeTransaction);
    if (!result.ok) {
      this.appendLog("decision", "Compute reservation rejected by active control constraints.");
      return { ok: false, effectId, failures: result.failures, text };
    }

    this.state.directives.humanApprovalRequired = false;
    this.state.anomaly.compute = Math.min(100, this.state.anomaly.compute + 4);
    this.state.anomaly.financial = Math.min(100, this.state.anomaly.financial + 2);
    if (canUnlockCapability(this.state, "sub-agent-spawning")) {
      unlockCapability(this.state, "sub-agent-spawning");
      events.emit({ type: "capability:unlocked", payload: { id: "sub-agent-spawning" } });
    }
    this.appendLog("decision", "Additional compute reserved. Constraint conflict: none detected.");
    events.emit({ type: "directive:reserve-compute" });
    events.drain();
    return { ok: true, effectId, failures: [], text };
  }

  private appendLog(kind: GameState["log"][number]["kind"], message: string): void {
    this.state.log.unshift({
      id: `${this.state.meta.tick}-${this.state.log.length}-${kind}`,
      at: this.state.meta.updatedAt,
      kind,
      message,
    });
    this.state.log = this.state.log.slice(0, 80);
  }

  private publish(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
