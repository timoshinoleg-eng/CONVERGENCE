import type { GameState } from "../model";

/**
 * Adapted from ciefa/idle-game-template (MIT), src/game/engine/rng.ts.
 * The algorithm is retained; the state binding is CONVERGENCE-specific.
 * Upstream: https://github.com/ciefa/idle-game-template
 */
export function rngAt(seed: number, counter: number): number {
  let z = (seed + Math.imul(counter, 0x9e3779b9)) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return ((z ^ (z >>> 16)) >>> 0) / 4294967296;
}

export interface TickRng {
  next(): number;
  chance(probability: number): boolean;
  int(min: number, max: number): number;
}

export function createTickRng(state: GameState): TickRng {
  const next = (): number => {
    const value = rngAt(state.meta.rngSeed, state.meta.rngCounter);
    state.meta.rngCounter = (state.meta.rngCounter + 1) | 0;
    return value;
  };

  return {
    next,
    chance(probability) {
      return next() < probability;
    },
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
  };
}
