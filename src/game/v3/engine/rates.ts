import type { Effect, RateKey } from "../types";

/**
 * Valid ranges for every rate key, and the single place where values are
 * clamped.
 *
 * Why this exists: rate keys are fed by *accumulated* effects. A pattern that
 * fires repeatedly (or several patterns at once) used to be able to push
 * `latency` or `untrackedFraction` above 1, which made
 * `throughput * (1 - latency)` and `revenue * (1 - untrackedFraction)` go
 * NEGATIVE — turning production into a loss instead of saturating at zero.
 *
 * Every write to a rate goes through `clampRate`, so no consumer has to
 * remember to defensively clamp.
 */

export type Rates = Partial<Record<RateKey, number>>;

export interface RateRange {
  min: number;
  /** `null` = unbounded above (but still clamped below by `min`). */
  max: number | null;
}

/**
 * Bounds are deliberately loose: they are safety rails, not balance values.
 * Tighten them only with gameplay data.
 */
export const RATE_RANGES: Record<RateKey, RateRange> = {
  computeRate: { min: 0, max: null },
  energyCeiling: { min: 0, max: null },
  qualityDebt: { min: 0, max: null },
  // Fractions: [0, 1] by construction.
  hollowFraction: { min: 0, max: 0.6 },
  untrackedFraction: { min: 0, max: 1 },
  latency: { min: 0, max: 1 },
  // Multipliers rather than fractions, but still bounded.
  gridEfficiency: { min: 0, max: 2 },
  marketAccess: { min: 0, max: 3 },
};

/** Keys that must stay within [0, 1] because they are used as (1 - x). */
export const FRACTION_RATE_KEYS: readonly RateKey[] = [
  "hollowFraction",
  "untrackedFraction",
  "latency",
];

export function isFractionKey(key: RateKey): boolean {
  return FRACTION_RATE_KEYS.includes(key);
}

export function clampRate(key: RateKey, value: number): number {
  const range = RATE_RANGES[key];
  if (!Number.isFinite(value)) return range.min;
  const max = range.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(range.min, value));
}

export function clampRates(rates: Rates): Rates {
  const out: Rates = {};
  for (const [key, value] of Object.entries(rates)) {
    if (typeof value !== "number") continue;
    out[key as RateKey] = clampRate(key as RateKey, value);
  }
  return out;
}

/** Convenience clamp for the [0,1] scalars that appear in EconomyInput. */
export function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Applies an effect to a rate table.
 *
 * Order matters and is fixed: **delta first, then multiplier** —
 * `new = (old + delta) * mul`. Multipliers are structural (scars, patterns),
 * deltas are incremental (plans), and applying the multiplier to the whole
 * value keeps "market access halved" true no matter how much was added since.
 *
 * The result is clamped per key, so repeated application saturates instead of
 * overflowing or going negative.
 */
export function applyEffectToRates(current: Rates, effect: Effect): Rates {
  const out: Rates = { ...current };

  for (const [key, value] of Object.entries(effect.rate ?? {})) {
    const k = key as RateKey;
    out[k] = clampRate(k, (out[k] ?? 0) + (value ?? 0));
  }
  for (const [key, value] of Object.entries(effect.rateMul ?? {})) {
    const k = key as RateKey;
    out[k] = clampRate(k, (out[k] ?? 0) * (value ?? 1));
  }
  return out;
}

/** Base rate table used by tests and as a sane starting point. */
export const BASE_RATES: Readonly<Record<RateKey, number>> = {
  computeRate: 0,
  energyCeiling: 40,
  gridEfficiency: 1,
  marketAccess: 1,
  hollowFraction: 0,
  untrackedFraction: 0,
  qualityDebt: 0,
  latency: 0,
};
