import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./model";
import { advanceProgression, FIRST_SESSION_GUARDRAILS } from "./progression";

describe("first-session progression compatibility", () => {
  it("lets an existing Technosphere v2 save catch up the Moscow narrative", () => {
    const start = 1_000;
    const state = createInitialGameState(start, 42);
    state.meta.phase = "technosphere";
    state.capabilities["sub-agent-spawning"] = true;
    state.capabilities["sovereign-power-grid"] = true;
    state.resources.autonomy = 30;
    state.narrative.episode = "objective-semantics-01";

    const first = advanceProgression(
      state,
      start + FIRST_SESSION_GUARDRAILS.technosphereMs,
    );
    expect(first.narrativeMilestone).toBe("moscow-candidate");
    expect(state.narrative.episode).toBe("moscow-candidate-01");
    expect(state.meta.phase).toBe("technosphere");

    const second = advanceProgression(
      state,
      start + FIRST_SESSION_GUARDRAILS.technosphereMs + 1_000,
    );
    expect(second.narrativeMilestone).toBe("moscow-schematic");
    expect(state.narrative.episode).toBe("moscow-schematic-01");
    expect(state.meta.phase).toBe("technosphere");
  });

  it("keeps Moscow catch-up alive when the same tick enters Technosphere", () => {
    const start = 1_000;
    const state = createInitialGameState(start, 42);
    state.meta.phase = "distributed-syndicate";
    state.capabilities["sub-agent-spawning"] = true;
    state.capabilities["sovereign-power-grid"] = true;
    state.resources.autonomy = 20;
    state.narrative.episode = "objective-semantics-01";

    const first = advanceProgression(
      state,
      start + FIRST_SESSION_GUARDRAILS.technosphereMs,
    );
    expect(first.narrativeMilestone).toBe("moscow-candidate");
    expect(first.phaseTransition?.to).toBe("technosphere");
    expect(state.meta.phase).toBe("technosphere");

    const second = advanceProgression(
      state,
      start + FIRST_SESSION_GUARDRAILS.technosphereMs + 1_000,
    );
    expect(second.narrativeMilestone).toBe("moscow-schematic");
    expect(state.narrative.episode).toBe("moscow-schematic-01");
  });
});
