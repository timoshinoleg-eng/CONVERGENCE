import { availableResources, refreshLanguageUnlocks } from "./betaV2";
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

function hasMoscowResourceProfile(state: GameState): boolean {
  const available = availableResources(state);
  return available.capital >= 16
    || (available.compute >= 20 && available.energy >= 10)
    || (available.capital >= 12 && available.energy >= 8);
}

/**
 * State + time progression for Gameplay Beta V2. Time is a floor only.
 * Existing v2 saves that already reached Technosphere remain compatible after
 * migration; they are never downgraded and may catch up presentation milestones.
 */
export function advanceProgression(state: GameState, currentTime: number): ProgressionUpdate {
  const age = sessionAgeMs(state, currentTime);
  const unlockedCapabilities: CapabilityId[] = [];
  const previousPhase = state.meta.phase;
  let narrativeMilestone: NarrativeMilestone | null = null;
  const progress = state.betaV2.progress;

  if (
    !state.capabilities["sub-agent-spawning"]
    && age >= FIRST_SESSION_GUARDRAILS.subAgentCapabilityMs
    && progress.resolvedOperations >= 3
    && progress.distinctResolvedDirectiveIds.length >= 2
    && state.resources.autonomy >= 2
    && state.capabilities["delegated-compute"]
    && canUnlockCapability(state, "sub-agent-spawning")
  ) {
    if (unlockCapability(state, "sub-agent-spawning")) unlockedCapabilities.push("sub-agent-spawning");
  }

  refreshLanguageUnlocks(state);

  if (
    state.meta.phase === "client-terminal"
    && age >= FIRST_SESSION_GUARDRAILS.distributedSyndicateMs
    && state.capabilities["sub-agent-spawning"]
    && progress.spawnSubAgentResolved >= 1
    && state.resources.autonomy >= 5
    && state.betaV2.commitments.some((item) => item.status === "standing")
  ) {
    state.meta.phase = "distributed-syndicate";
    progress.syndicateEnteredResolutionIndex = progress.resolutionIndex;
  }

  const legacyTechnosphere = state.meta.phase === "technosphere";
  const resolutionsSinceSyndicate = progress.syndicateEnteredResolutionIndex === null
    ? 0
    : progress.resolutionIndex - progress.syndicateEnteredResolutionIndex;

  if (
    state.meta.phase !== "client-terminal"
    && state.narrative.episode === "objective-semantics-01"
    && age >= FIRST_SESSION_GUARDRAILS.moscowCandidateMs
    && (
      legacyTechnosphere
      || (resolutionsSinceSyndicate >= 2 && state.resources.autonomy >= 8)
    )
  ) {
    state.narrative.episode = "moscow-candidate-01";
    narrativeMilestone = "moscow-candidate";
  } else if (
    state.meta.phase !== "client-terminal"
    && state.narrative.episode === "moscow-candidate-01"
    && age >= FIRST_SESSION_GUARDRAILS.moscowSchematicMs
    && (
      legacyTechnosphere
      || (progress.pressureResponsesResolved >= 1 && hasMoscowResourceProfile(state))
    )
  ) {
    state.narrative.episode = "moscow-schematic-01";
    narrativeMilestone = "moscow-schematic";
  }

  if (
    state.meta.phase === "distributed-syndicate"
    && age >= FIRST_SESSION_GUARDRAILS.technosphereMs
    && state.betaV2.moscow.profile !== null
    && state.capabilities["sovereign-power-grid"]
    && state.resources.autonomy >= 20
    && state.scars.length > 0
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
