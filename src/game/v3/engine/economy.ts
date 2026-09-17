import type { AnomalyChannel } from "../types";

/**
 * Economy formulas (D3 §3.4). Parameterised, not final-tuned.
 *
 * The single most important property: growth raises hazard, hazard consumes
 * capital and Oversight, and both are needed to grow. The loop closes.
 */

export interface EconomyParams {
  /** revenue per unit effective throughput */
  kRevenue: number;
  /** capital upkeep term: base * (1 + A/100) + kUpkeep * N^1.15 */
  kUpkeep: number;
  /** autonomy compute upkeep: aUpkeep * (A/100)^1.2 * throughputRaw */
  aUpkeep: number;
  /** autonomy drift per delegated function per second */
  kDrift: number;
  /** autonomy reduction per audit */
  kAudit: number;
  /** autonomy reduction per re-assertion */
  kReassert: number;
  /** hollow output coefficient */
  kHollow: number;
  /** latency -> throughput penalty */
  kLatency: number;
  /** compliance cost coefficient */
  kCompliance: number;
  /** baseline throughput for the T^2 anomaly curve */
  tBase: number;
}

export const DEFAULT_PARAMS: EconomyParams = {
  kRevenue: 0.9,
  kUpkeep: 0.35,
  aUpkeep: 0.22,
  kDrift: 0.0016,
  kAudit: 3.5,
  kReassert: 8,
  kHollow: 0.45,
  kLatency: 1.0,
  kCompliance: 0.05,
  tBase: 10,
};

export interface EconomyInput {
  computeRate: number;
  energyCeiling: number;
  gridEfficiency: number;
  brownoutOverload: number;
  latency: number;
  marketAccess: number;
  untrackedFraction: number;
  hollowFractionBase: number;
  autonomy: number;
  assets: number;
  delegated: number;
  audits: number;
  reassertions: number;
  oversightSpendRate: number;
  anomaly: Record<AnomalyChannel, number>;
  adaptation: Record<AnomalyChannel, number>;
  mitigation: Record<AnomalyChannel, number>;
  exposure: Record<AnomalyChannel, number>;
  params?: Partial<EconomyParams>;
}

export interface EconomyResult {
  throughputRaw: number;
  throughput: number;
  hollowFraction: number;
  revenue: number;
  upkeepCapital: number;
  complianceCost: number;
  netCapital: number;
  autonomyUpkeep: number;
  autonomyDrift: number;
  hazard: Record<AnomalyChannel, number>;
}

export function evaluate(input: EconomyInput): EconomyResult {
  const p = { ...DEFAULT_PARAMS, ...input.params };
  const A = Math.max(0, Math.min(100, input.autonomy));

  const autonomyUpkeep = p.aUpkeep * Math.pow(A / 100, 1.2) * input.computeRate;
  const usableCompute = Math.max(0, input.computeRate - autonomyUpkeep);

  const throughputRaw = Math.min(
    usableCompute,
    input.energyCeiling * input.gridEfficiency * (1 + input.brownoutOverload),
  );

  const hollowFraction = Math.max(
    0,
    Math.min(
      0.6,
      p.kHollow * (A / 100) * (1 - input.oversightSpendRate) +
        0.4 * input.brownoutOverload +
        input.hollowFractionBase,
    ),
  );

  const throughput =
    throughputRaw * (1 - hollowFraction) * (1 - p.kLatency * input.latency);

  const revenue = p.kRevenue * throughput * input.marketAccess * (1 - input.untrackedFraction);
  const upkeepCapital =
    input.assets * (1 + A / 100) * 0.2 + p.kUpkeep * Math.pow(Math.max(1, input.assets), 1.15);
  const totalAnomaly = Object.values(input.anomaly).reduce((sum, v) => sum + v, 0) / 100;
  const complianceCost = p.kCompliance * totalAnomaly * (1 + A / 100) * 10;

  const netCapital = revenue - upkeepCapital - complianceCost;

  const autonomyDrift =
    p.kDrift * input.delegated * (1 - input.oversightSpendRate) * 100 -
    p.kAudit * input.audits -
    p.kReassert * input.reassertions;

  const hazard = {} as Record<AnomalyChannel, number>;
  for (const channel of Object.keys(input.anomaly) as AnomalyChannel[]) {
    const normalized = Math.min(1, Math.max(0, input.anomaly[channel] / 100));
    const lambda0 = 1 / 90; // matches the existing v2 hazard scale
    hazard[channel] =
      (lambda0 *
        normalized *
        normalized *
        (1 + A / 120) *
        (1 + (input.exposure[channel] ?? 0))) /
      (1 + (input.mitigation[channel] ?? 0) + (input.adaptation[channel] ?? 0) * 0.25);
  }

  return {
    throughputRaw,
    throughput,
    hollowFraction,
    revenue,
    upkeepCapital,
    complianceCost,
    netCapital,
    autonomyUpkeep,
    autonomyDrift,
    hazard,
  };
}

/** Anomaly generation is superlinear in throughput: pushing hard gets expensive. */
export function anomalyGeneration(
  throughput: number,
  perChannel: Record<AnomalyChannel, number>,
  tBase = DEFAULT_PARAMS.tBase,
): Record<AnomalyChannel, number> {
  const scale = Math.pow(Math.max(0, throughput) / tBase, 2);
  const out = {} as Record<AnomalyChannel, number>;
  for (const channel of Object.keys(perChannel) as AnomalyChannel[]) {
    out[channel] = perChannel[channel] * scale;
  }
  return out;
}

/** p(incident in dt) — unchanged shape from v2, so existing tests stay valid. */
export function incidentProbability(hazard: number, deltaSeconds: number): number {
  return 1 - Math.exp(-hazard * Math.max(0, deltaSeconds));
}

export function oversightCap(manualFunctions: number, delegated: number, upgrades = 0): number {
  return Math.max(2, 3 + 0.5 * manualFunctions + upgrades - 0.5 * delegated);
}
