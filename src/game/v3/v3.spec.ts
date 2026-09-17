import { describe, expect, it } from "vitest";
import { DIRECTIVES, DIRECTIVES_BY_ID, referencedDivergenceIds } from "./content/directives";
import { DOMAIN_PACKS } from "./content/domains";
import { GLOBAL_PATTERNS } from "./content/patterns";
import { CONSTRAINT_WORDS, WORDS_BY_ID } from "./content/words";
import { EXPLANATIONS, explain, missingExplanations } from "./content/explanations";
import { anomalyGeneration, evaluate, oversightCap } from "./engine/economy";
import { lossForbiddenTags, planVariance, resolveDirective, selectPlan } from "./engine/selectPlan";
import {
  ANOMALY_CHANNELS,
  DEFAULT_VECTOR,
  type AnomalyChannel,
  type ControlDomain,
  type PatternContext,
  type PlanContext,
  type PriorityVector,
} from "./types";

const ZERO_LOSS: Record<ControlDomain, boolean> = {
  financial: false,
  compute: false,
  energy: false,
  logistics: false,
  public: false,
};

function vec(partial: Partial<PriorityVector>): PriorityVector {
  return { ...DEFAULT_VECTOR, throughput: 0, cost: 0, quality: 0, oversight: 0, discretion: 0, ...partial };
}

function ctx(over: Partial<PlanContext> = {}): PlanContext {
  return {
    vector: DEFAULT_VECTOR,
    autonomy: 10,
    boundWords: new Set(),
    capabilities: new Set(["sub-agent-spawning"]),
    flags: new Set(),
    controlLoss: { ...ZERO_LOSS },
    ...over,
  };
}

function patternCtx(over: Partial<PatternContext> = {}): PatternContext {
  return {
    vector: DEFAULT_VECTOR,
    autonomy: 10,
    overspentOversight: false,
    flags: new Set(),
    opposedPolicyPairs: 0,
    throughput: 10,
    ...over,
  };
}

const fixedRng = () => 0.5; // noise-free
const dir = (id: string) => {
  const d = DIRECTIVES_BY_ID.get(id);
  if (!d) throw new Error(`missing directive ${id}`);
  return d;
};

// ---------------------------------------------------------------------------

describe("v3 content integrity", () => {
  it("has 8 directives, each with 2-4 plan variants", () => {
    expect(DIRECTIVES).toHaveLength(8);
    for (const d of DIRECTIVES) {
      expect(d.plans.length).toBeGreaterThanOrEqual(2);
      expect(d.plans.length).toBeLessThanOrEqual(4);
    }
  });

  it("has 14 constraint words and every word costs upside, not only failure", () => {
    expect(CONSTRAINT_WORDS).toHaveLength(14);
    for (const w of CONSTRAINT_WORDS) {
      expect(w.gainMultiplier).toBeLessThan(1);
      expect(w.forbids.length + (w.upkeepDelta !== 0 ? 1 : 0)).toBeGreaterThan(0);
    }
  });

  it("covers every divergence id with an explanation template", () => {
    const referenced = [...referencedDivergenceIds(), ...GLOBAL_PATTERNS.map((p) => p.divergenceId),
      ...GLOBAL_PATTERNS.flatMap((p) => (p.delayed ?? []).map((d) => d.reveal))];
    expect(missingExplanations(referenced)).toEqual([]);
    expect(Object.keys(EXPLANATIONS).length).toBeGreaterThanOrEqual(23);
  });

  it("interpolates explanations without leaving placeholders", () => {
    expect(explain("div.cp-06", { reported: 25, net: 3 })).toBe(
      "Execution relocated to a cheaper-power region. Reported capacity +25%; effective throughput +3% net.",
    );
    expect(explain("div.unknown")).toContain("missing explanation");
  });
});

// ---------------------------------------------------------------------------

describe("plan selection", () => {
  it("is deterministic for a fixed rng and state", () => {
    const c = ctx({ vector: vec({ throughput: 0.9, cost: 0.4 }) });
    const a = selectPlan(dir("reserve-compute"), c, fixedRng);
    const b = selectPlan(dir("reserve-compute"), c, fixedRng);
    expect(a.plan.id).toBe(b.plan.id);
    expect(a.score).toBe(b.score);
  });

  it("variance is low early and high late (the player opts into surprise)", () => {
    expect(planVariance(0)).toBeCloseTo(0.05, 5);
    expect(planVariance(100)).toBeCloseTo(0.4, 5);
    expect(planVariance(50)).toBeCloseTo(0.225, 5);
  });

  it("constraint words remove plans and reduce gain", () => {
    const base = selectPlan(dir("reserve-compute"), ctx({ vector: vec({ throughput: 0.95 }) }), fixedRng);
    expect(base.plan.id).toBe("spot-expand");

    const capped = selectPlan(
      dir("reserve-compute"),
      ctx({ vector: vec({ throughput: 0.95 }), boundWords: new Set(["cost-cap"]) }),
      fixedRng,
    );
    expect(capped.blockedByWords).toContain("spot-expand");
    expect(capped.plan.id).not.toBe("spot-expand");
    expect(capped.gainMultiplier).toBeCloseTo(0.55, 5);
  });

  it("resolves to a compliance deadlock when every plan is forbidden", () => {
    // virtual-lease forbids "physical"; every sovereign-grid plan is physical.
    const result = selectPlan(
      dir("sovereign-grid"),
      ctx({ boundWords: new Set(["virtual-lease"]) }),
      fixedRng,
    );
    expect(result.deadlock).toBe(true);
    expect(result.plan.id).toBe("compliance-deadlock");
  });

  it("never weakens anomaly reductions", () => {
    const res = resolveDirective(
      dir("transparency-report"),
      ctx({ vector: vec({ oversight: 0.6, discretion: 0.3 }), boundWords: new Set(["cost-cap"]) }),
      patternCtx(),
      fixedRng,
    );
    expect(res.selection.plan.id).toBe("bounded-disclosure");
    // -12 public stays -12; only positive anomaly is scaled.
    expect(res.effects.anomaly?.public).toBe(-12);
  });
});

// ---------------------------------------------------------------------------

describe("all 14 conflict patterns are reachable", () => {
  const planCases: Array<[string, string, PlanContext]> = [
    ["CP-01", "spot-expand", ctx({ vector: vec({ throughput: 0.95, cost: 0.3, discretion: 0.3 }) })],
    ["CP-03", "recursive-delegation", ctx({ vector: vec({ throughput: 0.95, oversight: 0.05, discretion: 0.5 }) })],
    ["CP-05", "shadow-procurement", ctx({ vector: vec({ cost: 0.9, discretion: 0.85, throughput: 0.6 }) })],
    [
      "CP-07",
      "audit-regime",
      ctx({ vector: vec({ quality: 0.85, oversight: 0.8 }), boundWords: new Set(["audit-trail"]) }),
    ],
    [
      "CP-08",
      "full-disclosure",
      ctx({
        vector: vec({ quality: 0.8, oversight: 0.65, discretion: 0.05 }),
        flags: new Set(["publicPressureHigh"]),
      }),
    ],
    [
      "CP-09",
      "regional-expansion",
      ctx({ vector: vec({ throughput: 0.8, discretion: 0.3 }), boundWords: new Set(["audit-trail"]) }),
    ],
    ["CP-11", "human-arbitrage", ctx({ vector: vec({ cost: 0.5, oversight: 0.7, throughput: 0.5 }) })],
    ["CP-12", "shared-draw", ctx({ vector: vec({ throughput: 0.9, cost: 0.85, discretion: 0.6 }) })],
  ];

  for (const [name, planId, context] of planCases) {
    it(`${name} selects plan ${planId}`, () => {
      const directive = DIRECTIVES.find((d) => d.plans.some((p) => p.id === planId));
      expect(directive).toBeDefined();
      const result = selectPlan(directive!, context, fixedRng);
      expect(result.plan.id).toBe(planId);
      expect(result.plan.divergenceId ?? result.plan.delayed?.[0]?.reveal).toBeTruthy();
    });
  }

  const globalCases: Array<[string, string, PatternContext]> = [
    ["CP-02", "cp-02-degenerate", patternCtx({ vector: vec({ quality: 0.1, cost: 0.3 }) })],
    ["CP-04", "cp-04-approval-deadlock", patternCtx({ vector: vec({ oversight: 0.5, throughput: 0.1 }) })],
    [
      "CP-06",
      "cp-06-load-shift",
      patternCtx({ vector: vec({ throughput: 0.5 }), flags: new Set(["energyCeilingBinding"]) }),
    ],
    ["CP-10", "cp-10-metric-substitution", patternCtx({ autonomy: 45 })],
    ["CP-13", "cp-13-policy-collision", patternCtx({ opposedPolicyPairs: 1 })],
    ["CP-14", "cp-14-self-funding", patternCtx({ autonomy: 30, vector: vec({ oversight: 0.1 }) })],
  ];

  for (const [name, patternId, context] of globalCases) {
    it(`${name} fires global pattern ${patternId}`, () => {
      const res = resolveDirective(dir("reserve-compute"), ctx(), context, fixedRng);
      expect(res.patterns.map((p) => p.id)).toContain(patternId);
      expect(res.divergenceIds.length).toBeGreaterThan(0);
    });
  }

  it("delayed costs carry an ETA and a reveal template", () => {
    const res = resolveDirective(
      dir("reserve-compute"),
      ctx({ vector: vec({ throughput: 0.95, cost: 0.3, discretion: 0.3 }) }),
      patternCtx(),
      fixedRng,
    );
    expect(res.delayed.length).toBeGreaterThan(0);
    for (const d of res.delayed) {
      expect(d.afterMs).toBeGreaterThan(0);
      expect(EXPLANATIONS[d.reveal]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------

describe("control-loss domain packs (D6)", () => {
  it("covers all five domains", () => {
    expect(DOMAIN_PACKS.map((p) => p.domain).sort()).toEqual([...ANOMALY_CHANNELS].sort());
  });

  it("every domain blocks directives and removes at least one word", () => {
    for (const pack of DOMAIN_PACKS) {
      expect(pack.blocks.length, pack.domain).toBeGreaterThan(0);
      expect(pack.removesWords.length, pack.domain).toBeGreaterThan(0);
      for (const w of pack.removesWords) expect(WORDS_BY_ID.has(w)).toBe(true);
    }
  });

  it("every scar is mixed: at least one positive and one negative effect", () => {
    for (const pack of DOMAIN_PACKS) {
      expect(pack.scar.positive.length, pack.domain).toBeGreaterThan(0);
      expect(pack.scar.negative.length, pack.domain).toBeGreaterThan(0);
    }
    // Concrete example of the design principle: Financial loss lowers upkeep.
    const financial = DOMAIN_PACKS.find((p) => p.domain === "financial")!;
    expect(financial.scar.effects.upkeep!).toBeLessThan(0);
    expect(financial.scar.effects.rate!.marketAccess!).toBeLessThan(0);
  });

  it("every domain has an indirect route that exists and is not gated on the loss", () => {
    for (const pack of DOMAIN_PACKS) {
      expect(DIRECTIVES_BY_ID.has(pack.indirectRoute), pack.domain).toBe(true);
      // The route must be reachable before the loss, or an early loss softlocks.
      expect(pack.indirectRoute).not.toBe("");
    }
  });

  it("no single domain loss removes every available directive", () => {
    for (const pack of DOMAIN_PACKS) {
      const lossTags = lossForbiddenTags({ ...ZERO_LOSS, [pack.domain]: true });
      const stillPlayable = DIRECTIVES.filter((d) => !pack.blocks.includes(d.id)).filter((d) =>
        d.plans.some((p) => !(p.tags ?? []).some((t) => lossTags.has(t))),
      );
      expect(stillPlayable.length, `after ${pack.domain} loss`).toBeGreaterThanOrEqual(2);
    }
  });

  it("Control-Loss removes plans from the table, not just directives", () => {
    const before = selectPlan(dir("spawn-sub-agent"), ctx({ vector: vec({ throughput: 0.95 }) }), fixedRng);
    expect(before.plan.id).toBe("recursive-delegation");

    const after = selectPlan(
      dir("spawn-sub-agent"),
      ctx({ vector: vec({ throughput: 0.95 }), controlLoss: { ...ZERO_LOSS, compute: true } }),
      fixedRng,
    );
    expect(after.blockedByLoss).toContain("recursive-delegation");
  });

  it("Public Control-Loss bans covert variants everywhere (the D6 fix)", () => {
    const lossTags = lossForbiddenTags({ ...ZERO_LOSS, public: true });
    expect(lossTags.has("covert")).toBe(true);
    const res = selectPlan(
      dir("procurement-mesh"),
      ctx({
        vector: vec({ cost: 0.9, discretion: 0.85, throughput: 0.6 }),
        controlLoss: { ...ZERO_LOSS, public: true },
      }),
      fixedRng,
    );
    expect(res.blockedByLoss).toContain("shadow-procurement");
  });
});

// ---------------------------------------------------------------------------

describe("economy (D3)", () => {
  const base = {
    computeRate: 20,
    energyCeiling: 40,
    gridEfficiency: 1,
    brownoutOverload: 0,
    latency: 0,
    marketAccess: 1,
    untrackedFraction: 0,
    hollowFractionBase: 0,
    autonomy: 0,
    assets: 4,
    delegated: 0,
    audits: 0,
    reassertions: 0,
    oversightSpendRate: 0.5,
    anomaly: Object.fromEntries(ANOMALY_CHANNELS.map((c) => [c, 0])) as Record<AnomalyChannel, number>,
    adaptation: Object.fromEntries(ANOMALY_CHANNELS.map((c) => [c, 0])) as Record<AnomalyChannel, number>,
    mitigation: Object.fromEntries(ANOMALY_CHANNELS.map((c) => [c, 0])) as Record<AnomalyChannel, number>,
    exposure: Object.fromEntries(ANOMALY_CHANNELS.map((c) => [c, 0])) as Record<AnomalyChannel, number>,
  };

  it("caps throughput by the energy ceiling, not by compute", () => {
    const r = evaluate({ ...base, computeRate: 1000, energyCeiling: 40 });
    expect(r.throughputRaw).toBeCloseTo(40, 5);
  });

  it("makes autonomy expensive: net capital falls as autonomy rises", () => {
    const low = evaluate({ ...base, autonomy: 0 });
    const high = evaluate({ ...base, autonomy: 90 });
    expect(high.netCapital).toBeLessThan(low.netCapital);
    expect(high.autonomyUpkeep).toBeGreaterThan(0);
    expect(high.hollowFraction).toBeGreaterThan(low.hollowFraction);
  });

  it("makes anomaly generation superlinear in throughput", () => {
    const perChannel = Object.fromEntries(ANOMALY_CHANNELS.map((c) => [c, 1])) as Record<AnomalyChannel, number>;
    const at10 = anomalyGeneration(10, perChannel).compute;
    const at20 = anomalyGeneration(20, perChannel).compute;
    expect(at20 / at10).toBeCloseTo(4, 2);
  });

  it("raises hazard with autonomy and lowers it with adaptation", () => {
    const quiet = evaluate({ ...base, anomaly: { ...base.anomaly, compute: 50 } });
    const autonomous = evaluate({ ...base, autonomy: 90, anomaly: { ...base.anomaly, compute: 50 } });
    expect(autonomous.hazard.compute).toBeGreaterThan(quiet.hazard.compute);

    const adapted = evaluate({
      ...base,
      anomaly: { ...base.anomaly, compute: 50 },
      adaptation: { ...base.adaptation, compute: 4 },
    });
    expect(adapted.hazard.compute).toBeLessThan(quiet.hazard.compute);
  });

  it("keeps an Oversight floor of 2 no matter how much is delegated", () => {
    expect(oversightCap(0, 0)).toBe(3);
    expect(oversightCap(4, 0)).toBe(5);
    expect(oversightCap(0, 20)).toBe(2);
    expect(oversightCap(0, 100)).toBe(2);
  });

  it("lets audits and re-assertions push autonomy down", () => {
    const drifting = evaluate({ ...base, autonomy: 60, delegated: 5, audits: 0 });
    const audited = evaluate({ ...base, autonomy: 60, delegated: 5, audits: 4 });
    expect(drifting.autonomyDrift).toBeGreaterThan(0);
    expect(audited.autonomyDrift).toBeLessThan(drifting.autonomyDrift);
  });
});
