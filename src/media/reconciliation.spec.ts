import { describe, expect, it } from "vitest";
import { deriveUnseenMilestoneRequests } from "./reconciliation";
import { createEmptyDismissedState } from "./types";
import { createInitialGameState, type GameState } from "../game/model";

function makeSnapshot(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe("deriveUnseenMilestoneRequests", () => {
  it("emits first-mutation when narrative.lastChoice is set but unseen", () => {
    const state = makeSnapshot({
      narrative: { episode: "objective-semantics-01", lastChoice: "reserve-compute" },
    });
    const requests = deriveUnseenMilestoneRequests(state, createEmptyDismissedState(), 1000);
    expect(requests.map((r) => r.insertId)).toContain("cv.first-mutation.v1");
  });

  it("emits distributed-syndicate-reveal when phase is not client-terminal", () => {
    const state = makeSnapshot({ meta: { ...createInitialGameState().meta, phase: "distributed-syndicate" } });
    const requests = deriveUnseenMilestoneRequests(state, createEmptyDismissedState(), 1000);
    expect(requests.map((r) => r.insertId)).toContain("cv.distributed-syndicate-reveal.v1");
  });

  it("emits moscow-reveal when episode is candidate or schematic", () => {
    const candidate = makeSnapshot({ narrative: { episode: "moscow-candidate-01", lastChoice: null } });
    const schematic = makeSnapshot({ narrative: { episode: "moscow-schematic-01", lastChoice: null } });
    expect(deriveUnseenMilestoneRequests(candidate, createEmptyDismissedState(), 0).map((r) => r.insertId))
      .toContain("cv.moscow-reveal.v1");
    expect(deriveUnseenMilestoneRequests(schematic, createEmptyDismissedState(), 0).map((r) => r.insertId))
      .toContain("cv.moscow-reveal.v1");
  });

  it("emits first-anomaly when any containment stage is non-clear", () => {
    const state = makeSnapshot({
      containment: {
        ...createInitialGameState().containment,
        compute: { stage: "investigation", pressure: 18, incidents: 1, adaptation: 0 },
      },
    });
    const requests = deriveUnseenMilestoneRequests(state, createEmptyDismissedState(), 0);
    expect(requests.map((r) => r.insertId)).toContain("cv.first-anomaly.v1");
  });

  it("REGRESSION: emits first-anomaly even when stage reverted to clear but incidents > 0", () => {
    // Stage may have cooled back to clear; incidents are the durable signal.
    const state = makeSnapshot({
      containment: {
        ...createInitialGameState().containment,
        financial: { stage: "clear", pressure: 0, incidents: 3, adaptation: 0 },
      },
    });
    const requests = deriveUnseenMilestoneRequests(state, createEmptyDismissedState(), 0);
    expect(requests.map((r) => r.insertId)).toContain("cv.first-anomaly.v1");
  });

  it("does NOT re-emit milestones that are already in seen", () => {
    const state = makeSnapshot({
      narrative: { episode: "moscow-schematic-01", lastChoice: "reserve-compute" },
      meta: { ...createInitialGameState().meta, phase: "distributed-syndicate" },
      containment: {
        ...createInitialGameState().containment,
        financial: { stage: "investigation", pressure: 18, incidents: 1, adaptation: 0 },
      },
    });
    const dismissed = {
      ...createEmptyDismissedState(),
      seen: ["cv.first-mutation.v1", "cv.distributed-syndicate-reveal.v1", "cv.moscow-reveal.v1", "cv.first-anomaly.v1"],
    };
    const requests = deriveUnseenMilestoneRequests(state, dismissed, 0);
    expect(requests).toHaveLength(0);
  });

  it("emits only unseen milestones from a partially seen history", () => {
    const state = makeSnapshot({
      narrative: { episode: "moscow-schematic-01", lastChoice: "reserve-compute" },
      meta: { ...createInitialGameState().meta, phase: "distributed-syndicate" },
    });
    const dismissed = {
      ...createEmptyDismissedState(),
      seen: ["cv.first-mutation.v1"],
    };
    const requests = deriveUnseenMilestoneRequests(state, dismissed, 0);
    const ids = requests.map((r) => r.insertId);
    expect(ids).toContain("cv.distributed-syndicate-reveal.v1");
    expect(ids).toContain("cv.moscow-reveal.v1");
    expect(ids).not.toContain("cv.first-mutation.v1");
  });

  it("does not include repeating control-loss in reconciliation", () => {
    // A player whose save has controlLoss.financial === true after a
    // restart should NOT see the control-loss card again — that insert
    // is repeating and would feel hostile if auto-fired on every launch.
    const state = makeSnapshot({
      controlLoss: {
        ...createInitialGameState().controlLoss,
        financial: true,
      },
    });
    const requests = deriveUnseenMilestoneRequests(state, createEmptyDismissedState(), 0);
    expect(requests.map((r) => r.insertId)).not.toContain("cv.control-loss.v1");
  });
});
