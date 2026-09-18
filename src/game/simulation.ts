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
  input: { currentTime: number; deltaMs: number },
): SimulationReport {
  // B-04: clamp the simulated step, but only consume the step we actually took.
  const rawDeltaMs = Math.max(0, input.deltaMs);
  const simulatedMs = Math.min(rawDeltaMs, 60_000);
  const unsimulatedMs = rawDeltaMs - simulatedMs;
  const deltaSeconds = simulatedMs / 1000;
  const delegationBonus = state.capabilities["sub-agent-spawning"] ? 1.35 : 1;
  const autonomyBonus = 1 + state.resources.autonomy * 0.025;
  const incidents: IncidentOutcome[] = [];

  state.resources.compute += deltaSeconds * delegationBonus * autonomyBonus;
  state.resources.capital += deltaSeconds * 0.12 * delegationBonus * (1 + state.resources.autonomy * 0.01);
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
      incidents.push(applyIncident(state, channel));
    }
  }

  const progression = advanceProgression(state, input.currentTime);
  return { elapsedSeconds: deltaSeconds, incidents, progression };
}

