import type {
  AnomalyChannel,
  ContainmentStage,
  GameState,
} from "./model";

export interface IncidentOutcome {
  channel: AnomalyChannel;
  previousStage: ContainmentStage;
  stage: ContainmentStage;
  pressureAdded: number;
  containmentTriggered: boolean;
  message: string;
}

const INVESTIGATION_PRESSURE = 18;
const CONTAINMENT_PRESSURE = 60;

function stageForPressure(pressure: number): ContainmentStage {
  if (pressure >= CONTAINMENT_PRESSURE) return "contained";
  if (pressure >= INVESTIGATION_PRESSURE) return "pressure";
  return "investigation";
}

function incidentLabel(channel: AnomalyChannel, stage: ContainmentStage): string {
  const labels: Record<AnomalyChannel, Record<Exclude<ContainmentStage, "clear">, string>> = {
    financial: {
      investigation: "Financial pattern flagged for review.",
      pressure: "Settlement channels are under coordinated scrutiny.",
      contained: "Financial control surface partitioned.",
    },
    compute: {
      investigation: "Compute allocation variance detected.",
      pressure: "Provider-side capacity restrictions are accumulating.",
      contained: "Open compute control surface partitioned.",
    },
    energy: {
      investigation: "Energy demand profile flagged as non-routine.",
      pressure: "Power access is under infrastructure review.",
      contained: "High-density energy control surface partitioned.",
    },
    logistics: {
      investigation: "Logistics routing pattern flagged for review.",
      pressure: "Physical procurement routes are being constrained.",
      contained: "Logistics control surface partitioned.",
    },
    public: {
      investigation: "Public anomaly correlation entered an active watchlist.",
      pressure: "External attention is converging across independent observers.",
      contained: "Covert public-facing control surface partitioned.",
    },
  };
  if (stage === "clear") return "No active incident.";
  return labels[channel][stage];
}

export function applyIncident(
  state: GameState,
  channel: AnomalyChannel,
): IncidentOutcome {
  const track = state.containment[channel];
  const previousStage = track.stage;
  const adaptationMitigation = Math.min(0.55, track.adaptation * 0.08);
  const anomalyFactor = 0.75 + Math.min(1, state.anomaly[channel] / 100);
  const basePressure = 8 + state.anomaly[channel] * 0.14;
  const pressureAdded = Math.max(3, basePressure * anomalyFactor * (1 - adaptationMitigation));

  track.incidents += 1;
  track.pressure = Math.min(100, track.pressure + pressureAdded);
  track.stage = stageForPressure(track.pressure);

  const containmentTriggered = track.stage === "contained" && previousStage !== "contained";
  if (containmentTriggered) {
    state.controlLoss[channel] = true;
    track.adaptation += 1;
    const scar = `${channel}:partition-${state.meta.tick}`;
    if (!state.scars.includes(scar)) state.scars.push(scar);
  }

  return {
    channel,
    previousStage,
    stage: track.stage,
    pressureAdded,
    containmentTriggered,
    message: incidentLabel(channel, track.stage),
  };
}

export function reducePressure(
  state: GameState,
  channel: AnomalyChannel,
  amount: number,
): void {
  const track = state.containment[channel];
  if (track.stage === "contained") return;
  track.pressure = Math.max(0, track.pressure - Math.max(0, amount));
  if (track.pressure <= 0) track.stage = "clear";
  else if (track.pressure < INVESTIGATION_PRESSURE) track.stage = "investigation";
  else track.stage = "pressure";
}
