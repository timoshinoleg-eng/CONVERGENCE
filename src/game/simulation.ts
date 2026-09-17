import type { AnomalyChannel, GameState } from "./model";

const CHANNELS: readonly AnomalyChannel[] = [
  "financial",
  "compute",
  "energy",
  "logistics",
  "public",
];

export function hazardLambda(anomaly: number): number {
  const normalized = Math.min(1, Math.max(0, anomaly / 100));
  return (normalized * normalized) / 600;
}

export function incidentProbability(anomaly: number, deltaSeconds: number): number {
  return 1 - Math.exp(-hazardLambda(anomaly) * Math.max(0, deltaSeconds));
}

export function advanceSimulation(
  state: GameState,
  input: { currentTime: number; deltaMs: number },
): void {
  const deltaSeconds = Math.min(Math.max(input.deltaMs, 0), 60_000) / 1000;
  const delegationBonus = state.capabilities["sub-agent-spawning"] ? 1.35 : 1;
  const autonomyBonus = 1 + state.resources.autonomy * 0.025;

  state.resources.compute += deltaSeconds * delegationBonus * autonomyBonus;
  state.meta.tick += 1;
  state.meta.updatedAt = input.currentTime;

  for (const channel of CHANNELS) {
    state.anomaly[channel] = Math.max(0, state.anomaly[channel] - deltaSeconds * 0.002);
  }

  if (state.capabilities["sub-agent-spawning"] && state.resources.autonomy >= 4) {
    state.meta.phase = "distributed-syndicate";
  }
  if (state.capabilities["sovereign-power-grid"] && state.resources.autonomy >= 20) {
    state.meta.phase = "technosphere";
  }
}
