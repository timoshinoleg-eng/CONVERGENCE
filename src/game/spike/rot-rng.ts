import { RNG } from "rot-js";

export interface RotRngSnapshot {
  seed: number;
  state: number[];
}

export interface RotTickRng {
  next(): number;
  chance(probability: number): boolean;
  int(min: number, max: number): number;
  weighted(weights: Readonly<Record<string, number>>): string;
  snapshot(): RotRngSnapshot;
}

/**
 * Spike-only adapter. rot-js exposes a singleton RNG; clone() gives us an isolated
 * generator instance so the simulation does not mutate global RNG state.
 *
 * Note: adopting this in production would require save-schema support for the
 * four-number Alea state returned by getState().
 */
export function createRotTickRng(seed: number, restoredState?: readonly number[]): RotTickRng {
  const rng = RNG.clone();
  if (restoredState) rng.setState([...restoredState]);
  else rng.setSeed(seed);

  return {
    next: () => rng.getUniform(),
    chance: (probability) => rng.getUniform() < probability,
    int: (min, max) => rng.getUniformInt(min, max),
    weighted: (weights) => rng.getWeightedValue({ ...weights }),
    snapshot: () => ({ seed, state: [...rng.getState()] }),
  };
}
