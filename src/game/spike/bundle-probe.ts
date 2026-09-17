import { createInitialGameState } from "../model";
import { deriveDirectiveAbility } from "./casl-permissions";
import { createRotTickRng } from "./rot-rng";

/**
 * Spike-only production inclusion probe so Vite reports the real bundle cost
 * of CASL + the rot-js RNG path. The result is intentionally ignored.
 */
export function runDonorBundleProbe(): number {
  const state = createInitialGameState();
  const ability = deriveDirectiveAbility(state);
  const rng = createRotTickRng(17);
  return ability.can("issue_directive", "reserve-compute") ? rng.next() : 0;
}
