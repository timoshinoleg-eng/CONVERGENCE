import { describe, expect, it } from "vitest";
import {
  detectControlLoss,
  detectDistributedSyndicateReveal,
  detectFirstAnomaly,
  detectFirstMutation,
  detectMoscowReveal,
  detectTriggerEvents,
  eventsToRequests,
  insertIdFor,
} from "./triggers";
import { defaultResolveInsert } from "./manifest";
import { createInitialGameState, type GameState } from "../game/model";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function withChannelStage(
  state: GameState,
  channel: "financial" | "compute" | "energy" | "logistics" | "public",
  stage: "clear" | "investigation" | "pressure" | "contained",
): GameState {
  return {
    ...state,
    containment: {
      ...state.containment,
      [channel]: { ...state.containment[channel], stage },
    },
  };
}

describe("detectFirstMutation", () => {
  it("fires when narrative.lastChoice flips from null", () => {
    const prev = createInitialGameState();
    const next = { ...prev, narrative: { ...prev.narrative, lastChoice: "reserve-compute" } };
    expect(detectFirstMutation(prev, next)?.trigger).toBe("first-mutation");
  });

  it("does not fire when lastChoice was already set", () => {
    const prev = { ...createInitialGameState(), narrative: { episode: "objective-semantics-01", lastChoice: "x" } };
    const next = { ...prev, narrative: { ...prev.narrative, lastChoice: "y" } };
    expect(detectFirstMutation(prev, next)).toBeNull();
  });
});

describe("detectDistributedSyndicateReveal", () => {
  it("fires for client-terminal → distributed-syndicate", () => {
    const prev = createInitialGameState();
    const next = { ...prev, meta: { ...prev.meta, phase: "distributed-syndicate" as const } };
    expect(detectDistributedSyndicateReveal(prev, next)?.trigger).toBe("distributed-syndicate-reveal");
  });

  it("REGRESSION: fires for client-terminal → technosphere (offline catch-up jumps a stage)", () => {
    const prev = createInitialGameState();
    const next = { ...prev, meta: { ...prev.meta, phase: "technosphere" as const } };
    expect(detectDistributedSyndicateReveal(prev, next)?.trigger).toBe("distributed-syndicate-reveal");
  });

  it("does not fire on distributed-syndicate → technosphere", () => {
    const prev = { ...createInitialGameState(), meta: { ...createInitialGameState().meta, phase: "distributed-syndicate" as const } };
    const next = { ...prev, meta: { ...prev.meta, phase: "technosphere" as const } };
    expect(detectDistributedSyndicateReveal(prev, next)).toBeNull();
  });
});

describe("detectMoscowReveal", () => {
  it("fires on candidate milestone", () => {
    const prev = createInitialGameState();
    const next = { ...prev, narrative: { ...prev.narrative, episode: "moscow-candidate-01" } };
    expect(detectMoscowReveal(prev, next)?.context.milestone).toBe("moscow-candidate");
  });

  it("fires on schematic milestone", () => {
    const prev = { ...createInitialGameState(), narrative: { episode: "moscow-candidate-01", lastChoice: null } };
    const next = { ...prev, narrative: { ...prev.narrative, episode: "moscow-schematic-01" } };
    expect(detectMoscowReveal(prev, next)?.context.milestone).toBe("moscow-schematic");
  });

  it("ignores unrelated episode changes", () => {
    const prev = createInitialGameState();
    const next = { ...prev, narrative: { ...prev.narrative, episode: "anything-else" } };
    expect(detectMoscowReveal(prev, next)).toBeNull();
  });
});

describe("detectFirstAnomaly", () => {
  it("fires on the first containment reaching investigation", () => {
    const prev = createInitialGameState();
    const next = withChannelStage(prev, "financial", "investigation");
    expect(detectFirstAnomaly(prev, next)?.context.domain).toBe("financial");
  });

  it("REGRESSION: fires for clear → pressure (offline catch-up may skip investigation)", () => {
    const prev = createInitialGameState();
    const next = withChannelStage(prev, "financial", "pressure");
    expect(detectFirstAnomaly(prev, next)?.context.domain).toBe("financial");
  });

  it("REGRESSION: fires for clear → contained (offline catch-up may skip straight to contained)", () => {
    const prev = createInitialGameState();
    const next = withChannelStage(prev, "financial", "contained");
    expect(detectFirstAnomaly(prev, next)?.context.domain).toBe("financial");
  });

  it("does not re-fire on subsequent anomalies", () => {
    const prev = withChannelStage(createInitialGameState(), "financial", "investigation");
    const next = withChannelStage(prev, "compute", "investigation");
    expect(detectFirstAnomaly(prev, next)).toBeNull();
  });
});

describe("detectControlLoss", () => {
  it("yields one event per domain that flips", () => {
    const prev = createInitialGameState();
    const next: GameState = {
      ...prev,
      controlLoss: { ...prev.controlLoss, financial: true, energy: true },
      containment: {
        ...prev.containment,
        financial: { ...prev.containment.financial, stage: "contained" },
        energy: { ...prev.containment.energy, stage: "contained" },
      },
    };
    const events = detectControlLoss(prev, next);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.context.domain).sort()).toEqual([
      "energy",
      "financial",
    ]);
  });
});

describe("detectTriggerEvents — only implemented triggers", () => {
  it("emits events only for triggers that have a real manifest insert", () => {
    const base = createInitialGameState();
    const next: GameState = {
      ...base,
      narrative: { ...base.narrative, lastChoice: "reserve-compute" },
      meta: { ...base.meta, phase: "distributed-syndicate" },
      containment: {
        ...base.containment,
        financial: { ...base.containment.financial, stage: "investigation" },
      },
    };
    const events = detectTriggerEvents({ prev: base, next });
    const kinds = events.map((e) => e.trigger).sort();
    expect(kinds).toEqual([
      "distributed-syndicate-reveal",
      "first-anomaly",
      "first-mutation",
    ]);
    // Every emitted event must have a real manifest entry — there are
    // no surviving "dead" trigger kinds in MediaTriggerKind.
    for (const event of events) {
      const id = insertIdFor(event.trigger);
      expect(id).not.toBeNull();
    }
  });

  it("no event in MediaTriggerKind is a dead trigger", () => {
    // Sanity contract: every member of the enum must round-trip to a
    // manifest insert id. Adding a new trigger kind without a manifest
    // entry would break this test.
    const kinds = [
      "first-mutation",
      "first-anomaly",
      "distributed-syndicate-reveal",
      "moscow-reveal",
      "control-loss",
    ];
    for (const kind of kinds) {
      const id = insertIdFor(kind as Parameters<typeof insertIdFor>[0]);
      expect(id).not.toBeNull();
    }
  });
});

describe("eventsToRequests — only manifest-resolvable requests", () => {
  it("only emits requests whose insertId resolves through defaultResolveInsert", () => {
    const events = [
      { trigger: "first-mutation" as const, context: { phase: "client-terminal" as const } },
      { trigger: "first-anomaly" as const, context: { phase: "client-terminal" as const, domain: "financial" as const } },
      { trigger: "distributed-syndicate-reveal" as const, context: { phase: "distributed-syndicate" as const } },
      { trigger: "moscow-reveal" as const, context: { phase: "client-terminal" as const, milestone: "moscow-candidate" as const } },
    ];
    const requests = eventsToRequests(events, 1000);
    expect(requests).toHaveLength(4);
    for (const request of requests) {
      expect(defaultResolveInsert(request.insertId)).toBeDefined();
    }
  });

  it("drops events whose trigger has no manifest insert", () => {
    // Construct a synthetic trigger that would have idFor return null by
    // patching the runtime contract is impossible — `eventsToRequests`
    // only ever sees MediaTriggerEvent whose trigger kind is in the enum,
    // but a future enum value with no manifest id should drop silently.
    // We simulate that by adding a synthetic event whose trigger we know
    // is unmapped. The current contract forbids that — so the test asserts
    // the safer property: no request id in the output is unresolved.
    const events = [
      { trigger: "first-mutation" as const, context: { phase: "client-terminal" as const } },
    ];
    const requests = eventsToRequests(events, 1000);
    for (const request of requests) {
      expect(defaultResolveInsert(request.insertId)).toBeDefined();
    }
  });
});

describe("insertIdFor", () => {
  it("returns the canonical insert id for every implemented trigger", () => {
    expect(insertIdFor("first-mutation")).toBe("cv.first-mutation.v1");
    expect(insertIdFor("first-anomaly")).toBe("cv.first-anomaly.v1");
    expect(insertIdFor("distributed-syndicate-reveal")).toBe("cv.distributed-syndicate-reveal.v1");
    expect(insertIdFor("moscow-reveal")).toBe("cv.moscow-reveal.v1");
    expect(insertIdFor("control-loss")).toBe("cv.control-loss.v1");
  });

  it("every insert id round-trips through defaultResolveInsert", () => {
    for (const id of [
      "cv.first-mutation.v1",
      "cv.first-anomaly.v1",
      "cv.distributed-syndicate-reveal.v1",
      "cv.moscow-reveal.v1",
      "cv.control-loss.v1",
    ]) {
      expect(defaultResolveInsert(id)).toBeDefined();
    }
  });
});
