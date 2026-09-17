import { createTickRng } from "./engine/rng";
import { applyIncident, reducePressure, type IncidentOutcome } from "./incidents";
import type { AnomalyChannel, GameState } from "./model";

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
}

export function hazardLambda(anomaly: number): number {
  const normalized = Math.min(1, Math.max(0, anomaly / 100));
  if (normalized < 0.08) return 0;
  return (normalized * normalized) / 180;
}

export function incidentProbability(anomaly: number, deltaSeconds: number): number {
  return 1 - Math.exp(-hazardLambda(anomaly) * Math.max(0, deltaSeconds));
}

export function advanceSimulation(
  state: GameState,
  input: { currentTime: number; deltaMs: number },
): SimulationReport {
  const deltaSeconds = Math.min(Math.max(input.deltaMs, 0), 60_000) / 1000;
  const delegationBonus = state.capabilities["sub-agent-spawning"] ? 1.35 : 1;
  const autonomyBonus = 1 + state.resources.autonomy * 0.025;
  const incidents: IncidentOutcome[] = [];

  state.resources.compute += deltaSeconds * delegationBonus * autonomyBonus;
  state.meta.tick += 1;
  state.meta.updatedAt = input.currentTime;

  const rng = createTickRng(state);
  for (const channel of ANOMALY_CHANNELS) {
    state.anomaly[channel] = Math.max(0, state.anomaly[channel] - deltaSeconds * 0.002);

    if (state.containment[channel].stage !== "contained") {
      const recovery = deltaSeconds * 0.004 * (1 + state.containment[channel].adaptation * 0.25);
      reducePressure(state, channel, recovery);
    }

    const probability = incidentProbability(state.anomaly[channel], deltaSeconds);
    if (probability > 0 && rng.chance(probability)) {
      incidents.push(applyIncident(state, channel));
    }
  }

  if (state.capabilities["sub-agent-spawning"] && state.resources.autonomy >= 4) {
    state.meta.phase = "distributed-syndicate";
  }
  if (state.capabilities["sovereign-power-grid"] && state.resources.autonomy >= 20) {
    state.meta.phase = "technosphere";
  }

  return { elapsedSeconds: deltaSeconds, incidents };
}
