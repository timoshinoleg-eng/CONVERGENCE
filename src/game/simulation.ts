import { advanceBetaV2, queuePendingContainment } from "./betaV2";
import { createTickRng } from "./engine/rng";
import { applyIncident, reducePressure, type IncidentOutcome } from "./incidents";
import type { AnomalyChannel, GameState } from "./model";
import { advanceProgression, type ProgressionUpdate } from "./progression";

export const ANOMALY_CHANNELS: readonly AnomalyChannel[] = [
  "financial",
  "compute",
  "energy",
  "logistics",
  "public",
];

const FRESH_BETA_LOSS_CHANNELS = new Set<AnomalyChannel>(["financial", "compute", "energy"]);

export interface SimulationReport {
  elapsedSeconds: number;
  incidents: IncidentOutcome[];
  progression: ProgressionUpdate;
}

export function hazardLambda(anomaly: number): number {
  const normalized = Math.min(1, Math.max(0, anomaly / 100));
  if (normalized < 0.08) return 0;
  return (normalized * normalized) / 90;
}

export function incidentProbability(anomaly: number, deltaSeconds: number): number {
  return 1 - Math.exp(-hazardLambda(anomaly) * Math.max(0, deltaSeconds));
}

export function advanceSimulation(
  state: GameState,
  input: { currentTime: number; deltaMs: number; foreground?: boolean },
): SimulationReport {
  const rawDeltaMs = Math.max(0, input.deltaMs);
  const simulatedMs = Math.min(rawDeltaMs, 60_000);
  const unsimulatedMs = rawDeltaMs - simulatedMs;
  const deltaSeconds = simulatedMs / 1000;
  const delegationBonus = state.capabilities["sub-agent-spawning"] ? 1.20 : 1;
  const incidents: IncidentOutcome[] = [];

  // Beta V2 tuning: Compute is deliberately scarce; Autonomy does not multiply
  // passive Compute in the 0-10 minute slice. Capital remains 0.12/s before
  // standing upkeep. Energy has no passive regeneration.
  state.resources.compute += deltaSeconds * 0.08 * delegationBonus;
  state.resources.capital += deltaSeconds * 0.12;
  advanceBetaV2(state, simulatedMs, input.foreground !== false);

  state.meta.tick += 1;
  state.meta.updatedAt = input.currentTime - unsimulatedMs;

  const rng = createTickRng(state);
  for (const channel of ANOMALY_CHANNELS) {
    state.anomaly[channel] = Math.max(0, state.anomaly[channel] - deltaSeconds * 0.002);

    if (state.containment[channel].stage === "contained") continue;

    const recovery = deltaSeconds * 0.004 * (1 + state.containment[channel].adaptation * 0.25);
    reducePressure(state, channel, recovery);

    const probability = incidentProbability(state.anomaly[channel], deltaSeconds);
    if (probability > 0 && rng.chance(probability)) {
      // Fresh Beta V2 never lets an incident choose the sacrifice for the
      // player. F/C/E queue a persisted dilemma; Logistics/Public clamp at
      // pressure until their authored packs exist.
      const incident = applyIncident(state, channel, { deferContainment: true });
      if (incident.containmentDeferred && FRESH_BETA_LOSS_CHANNELS.has(channel)) {
        queuePendingContainment(state, channel);
      }
      incidents.push(incident);
    }
  }

  const progression = advanceProgression(state, state.meta.updatedAt);
  return { elapsedSeconds: deltaSeconds, incidents, progression };
}
