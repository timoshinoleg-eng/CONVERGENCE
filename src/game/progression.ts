import { canUnlockCapability, unlockCapability } from "./capabilities";
import type { CapabilityId, GameState, Phase } from "./model";

export const FIRST_SESSION_GUARDRAILS = {
  subAgentCapabilityMs: 3 * 60_000,
  distributedSyndicateMs: 5 * 60_000,
  moscowCandidateMs: 12 * 60_000,
  moscowSchematicMs: 18 * 60_000,
  technosphereMs: 30 * 60_000,
} as const;

export type NarrativeMilestone = "moscow-candidate" | "moscow-schematic";

export interface ProgressionUpdate {
  unlockedCapabilities: CapabilityId[];
  phaseTransition: { from: Phase; to: Phase } | null;
  narrativeMilestone: NarrativeMilestone | null;
}

export function sessionAgeMs(state: GameState, currentTime = state.meta.updatedAt): number {
  return Math.max(0, currentTime - state.meta.startedAt);
}

/**
 * Apply state-driven progression with minimum pacing guardrails.
 * Time alone never unlocks a phase: the relevant activity/capability state is
 * still required. The guardrails only prevent the first session from
 * collapsing into a 90-second tech rush.
 */
export function advanceProgression(state: GameState, currentTime: number): ProgressionUpdate {
  const age = sessionAgeMs(state, currentTime);
  const unlockedCapabilities: CapabilityId[] = [];
  const previousPhase = state.meta.phase;
  let narrativeMilestone: NarrativeMilestone | null = null;

  // The system derives bounded delegation only after the player has actually
  // issued at least one directive and accepted some autonomy. This also keeps
  // early Compute Control-Loss recoverable through the supervised path.
  if (
    !state.capabilities["sub-agent-spawning"]
    && age >= FIRST_SESSION_GUARDRAILS.subAgentCapabilityMs
    && state.directives.executed >= 1
    && state.resources.autonomy >= 1
    && canUnlockCapability(state, "sub-agent-spawning")
  ) {
    if (unlockCapability(state, "sub-agent-spawning")) {
      unlockedCapabilities.push("sub-agent-spawning");
    }
  }

  if (
    state.meta.phase === "client-terminal"
    && state.capabilities["sub-agent-spawning"]
    && state.resources.autonomy >= 4
    && age >= FIRST_SESSION_GUARDRAILS.distributedSyndicateMs
  ) {
    state.meta.phase = "distributed-syndicate";
  }

  // Moscow appears first as an aggregate systems inference, not as a map.
  if (
    state.meta.phase === "distributed-syndicate"
    && state.narrative.episode === "objective-semantics-01"
    && age >= FIRST_SESSION_GUARDRAILS.moscowCandidateMs
  ) {
    state.narrative.episode = "moscow-candidate-01";
    narrativeMilestone = "moscow-candidate";
  } else if (
    state.meta.phase === "distributed-syndicate"
    && state.narrative.episode === "moscow-candidate-01"
    && age >= FIRST_SESSION_GUARDRAILS.moscowSchematicMs
  ) {
    state.narrative.episode = "moscow-schematic-01";
    narrativeMilestone = "moscow-schematic";
  }

  if (
    state.meta.phase === "distributed-syndicate"
    && state.capabilities["sovereign-power-grid"]
    && state.resources.autonomy >= 20
    && age >= FIRST_SESSION_GUARDRAILS.technosphereMs
  ) {
    state.meta.phase = "technosphere";
  }

  return {
    unlockedCapabilities,
    phaseTransition: previousPhase === state.meta.phase
      ? null
      : { from: previousPhase, to: state.meta.phase },
    narrativeMilestone,
  };
}
