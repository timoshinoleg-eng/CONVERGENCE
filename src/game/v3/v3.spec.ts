import { describe, expect, it } from "vitest";
import { DIRECTIVES, DIRECTIVES_BY_ID, referencedDivergenceIds } from "./content/directives";
import { DOMAIN_PACKS, PRELOSS_ROUTE_GATES } from "./content/domains";
import { GLOBAL_PATTERNS } from "./content/patterns";
import { CONSTRAINT_WORDS, WORDS_BY_ID } from "./content/words";
import { EXPLANATIONS, explain, missingExplanations } from "./content/explanations";
import { anomalyGeneration, evaluate, oversightCap } from "./engine/economy";
import {
  emptyPatternState,
  lossAllowed,
  lossForbiddenTags,
  mergeEffects,
  planVariance,
  requiresSatisfied,
  resolveDirective,
  selectPatterns,
  selectPlan,
  wordsAllowed,
} from "./engine/selectPlan";
import { forbiddenTags } from "./content/words";
import {
  applyEffectToRates,
  BASE_RATES,
  clampRate,
  clampRates,
  RATE_RANGES,
} from "./engine/rates";
import {
  ANOMALY_CHANNELS,
  DEFAULT_VECTOR,
  type AnomalyChannel,
  type ControlDomain,
  type GlobalPattern,
  type PatternContext,
  type PlanContext,
  type PriorityVector,
  type StockKey,
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

const fixedRng = () => 0.5;
const dir = (id: string) => {
  const d = DIRECTIVES_BY_ID.get(id);
  if (!d) throw new Error(`missing directive ${id}`);
  return d;
};

/** Generous resource levels so the adversarial tests focus on control-loss
 *  effects, not on whether the player can afford a directive. The cost /
 *  oversight / resource checks in `stillPlayable` are still real ? they
 *  just don't trigger at these levels. */
const GENEROUS_STOCKS: Partial<Record<StockKey, number>> = {
  compute: 50,
  capital: 50,
  autonomy: 100,
  oversight: 5,
};

// ---------------------------------------------------------------------------
// Content integrity
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
    const referenced = [
      ...referencedDivergenceIds(),
      ...GLOBAL_PATTERNS.map((p) => p.divergenceId),
      ...GLOBAL_PATTERNS.flatMap((p) => (p.delayed ?? []).map((d) => d.reveal)),
    ];
    expect(missingExplanations(referenced)).toEqual([]);
    expect(Object.keys(EXPLANATIONS).length).toBeGreaterThanOrEqual(23);
  });

  it("interpolates explanations without leaving placeholders", () => {
    expect(explain("div.cp-06", { reported: 25, net: 3 })).toBe(
      "Execution relocated to a cheaper-power region. Reported capacity +25%; effective throughput +3% net.",
    );
    expect(explain("div.unknown")).toContain("missing explanation");
  });

  it("no directive cost or effect references a spendable 'energy' stock", () => {
    // Energy must be a ceiling only. Any remaining energy stock would
    // re-introduce the architectural contradiction Codex flagged.
    for (const directive of DIRECTIVES) {
      expect((directive.cost as Record<string, number>).energy, `${directive.id} cost`).toBeUndefined();
      for (const plan of directive.plans) {
        expect((plan.immediate.stock as Record<string, number> | undefined)?.energy, `${plan.id} immediate stock`).toBeUndefined();
        for (const delayed of plan.delayed ?? []) {
          expect((delayed.effects.stock as Record<string, number> | undefined)?.energy, `${plan.id} delayed stock`).toBeUndefined();
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Plan selection
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
    const result = selectPlan(
      dir("sovereign-grid"),
      ctx({ boundWords: new Set(["virtual-lease"]) }),
      fixedRng,
    );
    expect(result.deadlock).toBe(true);
    expect(result.plan.id).toBe("compliance-deadlock");
  });

  it("preferredPlanId is ranked only among structurally available plans (requires + loss ok)", () => {
    // spawn-sub-agent has "human-mediated-agent" which requires ["human-mediated"],
    // and "recursive-delegation" which has no requires.
    const c = ctx({ vector: vec({ throughput: 0.95 }) });
    const result = selectPlan(dir("spawn-sub-agent"), c, fixedRng);
    // Without "human-mediated", the plan is structurally impossible.
    expect(result.preferredPlanId).not.toBe("human-mediated-agent");
    expect(result.preferredUnavailableReason).toBe("none");
  });

  it("preferredPlanId names the word-blocked plan when the words are the only blocker", () => {
    const c = ctx({ vector: vec({ throughput: 0.95 }), boundWords: new Set(["no-subcontract"]) });
    const result = selectPlan(dir("spawn-sub-agent"), c, fixedRng);
    // "recursive-delegation" is the top scorer, but it has tag "recursive" not "no-subcontract"...
    // actually no-subcontract forbids nothing in spawn-sub-agent. Let's use a real word.
    const d = ctx({ vector: vec({ throughput: 0.95 }), boundWords: new Set(["geofence"]) });
    const r = selectPlan(dir("spawn-sub-agent"), d, fixedRng);
    // None blocked by geofence either. Use reserve-compute where cost-cap blocks spot-expand.
    const e = ctx({ vector: vec({ throughput: 0.95 }), boundWords: new Set(["cost-cap"]) });
    const s = selectPlan(dir("reserve-compute"), e, fixedRng);
    expect(s.preferredPlanId).toBe("spot-expand");
    expect(s.preferredUnavailableReason).toBe("words");
  });

  it("preferredUnavailableReason = 'not-selectable' when no plan is structurally available", () => {
    // sovereign-grid plans are all tagged "physical"; logistics loss bans
    // "physical", so every plan is structurally unavailable. No requires
    // to save any of them.
    const c = ctx({ vector: vec({ throughput: 0.95 }), controlLoss: { ...ZERO_LOSS, logistics: true } });
    const result = selectPlan(dir("sovereign-grid"), c, fixedRng);
    expect(result.preferredUnavailableReason).toBe("not-selectable");
    expect(result.deadlock).toBe(true);
  });

  it("preferredUnavailableReason = 'variance' when the preferred plan lost only to RNG noise", () => {
    // At high autonomy, interpretation variance can push a different plan ahead
    // even though no constraint word blocked the preferred plan. The Decision
    // Trace must not lie and say "words" in that case.
    const c = ctx({ vector: vec({ throughput: 0.6, cost: 0.55 }), autonomy: 90 });
    const rngValues = [0.01, 0.99, 0.5];
    let i = 0;
    const varyingRng = () => rngValues[i++ % rngValues.length]!;
    const result = selectPlan(dir("reserve-compute"), c, varyingRng);
    // Preferred (noise-free) is spot-expand (highest alignment), but RNG noise
    // pushes term-contract ahead ? without any constraint word involved.
    expect(result.preferredPlanId).toBe("spot-expand");
    expect(result.plan.id).toBe("term-contract");
    expect(result.preferredUnavailableReason).toBe("variance");
    expect(result.blockedByWords).not.toContain(result.preferredPlanId);
  });

  it("never weakens anomaly reductions", () => {
    const res = resolveDirective(
      dir("transparency-report"),
      ctx({ vector: vec({ oversight: 0.6, discretion: 0.3 }), boundWords: new Set(["cost-cap"]) }),
      patternCtx(),
      fixedRng,
    );
    expect(res.selection.plan.id).toBe("bounded-disclosure");
    expect(res.effects.anomaly?.public).toBe(-12);
  });
});

// ---------------------------------------------------------------------------
// Effect composition
// ---------------------------------------------------------------------------

describe("mergeEffects", () => {
  it("sums deltas for stock, rate, anomaly and adaptation", () => {
    const a = { stock: { capital: 10 }, rate: { computeRate: 1.8 }, anomaly: { financial: 4 } };
    const b = { stock: { capital: -8 }, rate: { computeRate: 0.35 }, anomaly: { compute: 6 } };
    const m = resolveDirective(dir("reserve-compute"), ctx({ vector: vec({ throughput: 0.95, cost: 0.3, discretion: 0.3 }) }), patternCtx({ autonomy: 45 }), fixedRng).effects;
    // CP-10 (metric substitution) fires at autonomy 45 and adds computeRate: 0.35.
    // Plan spot-expand adds computeRate: 1.8.
    // Result should be sum, not overwrite.
    const raw = m.rate?.computeRate ?? 0;
    expect(raw).toBeCloseTo(2.15, 5);
  });

  it("multiplies rateMul values, not sums them", () => {
    // Apply two multipliers to marketAccess: 0.5 then 1.4
    const e1 = { rateMul: { marketAccess: 0.5 } };
    const e2 = { rateMul: { marketAccess: 1.4 } };
    const merged = mergeEffects(e1, e2);
    expect(merged.rateMul?.marketAccess).toBeCloseTo(0.7, 5);
  });

  it("multiplies upkeepMul values", () => {
    const e1 = { upkeepMul: 0.85 };
    const e2 = { upkeepMul: 0.8 };
    // These come from financial and logistics scars stacked.
    const merged = mergeEffects(e1, e2);
    expect(merged.upkeepMul).toBeCloseTo(0.68, 5);
  });

  it("does not silently overwrite earlier deltas with later ones", () => {
    const planEffect = { rate: { computeRate: 1.8 } };
    const patternEffect = { rate: { computeRate: 0.35 } };
    const merged = mergeEffects(planEffect, patternEffect);
    expect(merged.rate?.computeRate).toBeCloseTo(2.15, 5);
  });
});

// The import mergeEffects is not re-exported from selectPlan.ts; we use resolveDirective
// to test composition end-to-end, which is the real bug surface.

// ---------------------------------------------------------------------------
// Rate clamping and ranges
// ---------------------------------------------------------------------------

describe("rate clamping", () => {
  it("every RateKey has a defined range", () => {
    const keys = Object.keys(RATE_RANGES);
    for (const k of keys) {
      expect(RATE_RANGES[k as keyof typeof RATE_RANGES].min).toBeDefined();
      expect(RATE_RANGES[k as keyof typeof RATE_RANGES].max).toBeDefined();
    }
  });

  it("clamps fractions to [0, 1]", () => {
    expect(clampRate("latency", -0.5)).toBe(0);
    expect(clampRate("latency", 1.5)).toBe(1);
    expect(clampRate("latency", 0.3)).toBe(0.3);
  });

  it("clamps hollowFraction to [0, 0.6]", () => {
    expect(clampRate("hollowFraction", -0.1)).toBe(0);
    expect(clampRate("hollowFraction", 0.9)).toBe(0.6);
  });

  it("applyEffectToRates sums deltas then multiplies, then clamps", () => {
    const rates = applyEffectToRates(
      { ...BASE_RATES },
      { rate: { latency: 0.3 }, rateMul: { marketAccess: 1.25 } },
    );
    expect(rates.latency).toBe(0.3);
    expect(rates.marketAccess).toBe(1.25);
  });

  it("repeated application saturates instead of going negative", () => {
    let rates: ReturnType<typeof applyEffectToRates> = { ...BASE_RATES };
    // Simulate 6 CP-14 applications: untrackedFraction +0.18 each
    for (let i = 0; i < 6; i++) {
      rates = applyEffectToRates(rates, { rate: { untrackedFraction: 0.18 } });
    }
    expect(rates.untrackedFraction).toBe(1); // clamped at max
    expect(rates.untrackedFraction).not.toBeGreaterThan(1);
  });

  it("CP-10 is cooldown-based instead of globally capping legitimate compute growth", () => {
    const cp10 = GLOBAL_PATTERNS.find((p) => p.id === "cp-10-metric-substitution")!;
    expect(cp10.trigger.kind).toBe("cooldown");
    let state = emptyPatternState();
    let firedCount = 0;
    for (const nowMs of [0, 10_000, 30_000, 60_000, 119_000]) {
      const result = selectPatterns([cp10], patternCtx({ autonomy: 45 }), state, nowMs);
      firedCount += result.fired.length; state = result.state;
    }
    expect(firedCount).toBe(1);
    expect(selectPatterns([cp10], patternCtx({ autonomy: 45 }), state, 120_000).fired).toHaveLength(1);
  });

  it("evaluate never produces negative throughput or revenue", () => {
    const base = {
      computeRate: 20,
      energyCeiling: 40,
      gridEfficiency: 1,
      brownoutOverload: 0,
      latency: 0.5, // not crazy
      marketAccess: 1,
      untrackedFraction: 0.5,
      hollowFractionBase: 0.5,
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

    // extreme case: latency and untracked pushed way above 1
    const extreme = evaluate({ ...base, latency: 5, untrackedFraction: 5, hollowFractionBase: 5 });
    expect(extreme.throughputRaw).toBeGreaterThanOrEqual(0);
    expect(extreme.throughput).toBeGreaterThanOrEqual(0);
    expect(extreme.revenue).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Pattern trigger semantics
// ---------------------------------------------------------------------------

describe("pattern trigger semantics", () => {
  const repeatPattern = {
    id: "test-repeat" as const,
    when: () => true,
    trigger: { kind: "repeat" as const },
    immediate: { rate: { computeRate: 1 } },
    divergenceId: "div.test-repeat" as const,
  } as unknown as GlobalPattern;

  const oncePattern = {
    id: "test-once" as const,
    when: () => true,
    trigger: { kind: "once" as const },
    immediate: { stock: { capital: 5 } },
    divergenceId: "div.test-once" as const,
  } as unknown as GlobalPattern;

  const cooldownPattern = {
    id: "test-cooldown" as const,
    when: () => true,
    trigger: { kind: "cooldown", cooldownMs: 60_000 } as const,
    immediate: { anomaly: { public: 3 } },
    divergenceId: "div.test-cooldown" as const,
  } as unknown as GlobalPattern;

  it("repeat fires every time the condition holds", () => {
    const ctx = patternCtx();
    const s1 = selectPatterns([repeatPattern], ctx, {}, 0);
    expect(s1.fired).toHaveLength(1);
    const s2 = selectPatterns([repeatPattern], ctx, s1.state, 0);
    expect(s2.fired).toHaveLength(1);
  });

  it("once fires only on the first qualifying resolution", () => {
    const ctx = patternCtx();
    const s1 = selectPatterns([oncePattern], ctx, {}, 0);
    expect(s1.fired).toHaveLength(1);
    expect(s1.state["test-once"]!.fired).toBe(true);
    const s2 = selectPatterns([oncePattern], ctx, s1.state, 10_000);
    expect(s2.fired).toHaveLength(0);
  });

  it("cooldown re-fires only after the interval has elapsed", () => {
    const ctx = patternCtx();
    const s1 = selectPatterns([cooldownPattern], ctx, {}, 0);
    expect(s1.fired).toHaveLength(1);
    const s2 = selectPatterns([cooldownPattern], ctx, s1.state, 30_000);
    expect(s2.fired).toHaveLength(0);
    const s3 = selectPatterns([cooldownPattern], ctx, s2.state, 70_000);
    expect(s3.fired).toHaveLength(1);
  });

  it("cooldown prevents the CP-10-style runaway that would push latency > 1", () => {
    // CP-10 is repeat (intentionally), but cooldown patterns like CP-06/14
    // would previously re-fire on every directive. Simulate: without cooldown,
    // 5 resolutions at 10s each would stack latency 5 times.
    const p = {
      id: "cp-06-like" as const,
      when: () => true,
      trigger: { kind: "cooldown", cooldownMs: 300_000 } as const,
      immediate: { rate: { latency: 0.18 } },
      divergenceId: "div.cp-06" as const,
    } as unknown as GlobalPattern;
    let state = emptyPatternState();
    let firedCount = 0;
    for (let t = 0; t <= 60_000; t += 10_000) {
      const r = selectPatterns([p], patternCtx(), state, t);
      firedCount += r.fired.length;
      state = r.state;
    }
    expect(firedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// All 14 conflict patterns are reachable
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
// Control-Loss domain packs (D6) ? real reachability
// ---------------------------------------------------------------------------

function routeIsExecutable(routeId: string, controlLoss: Record<ControlDomain, boolean>, capabilities: Set<string>): boolean {
  const route = DIRECTIVES_BY_ID.get(routeId);
  if (!route) return false;
  const lossTags = lossForbiddenTags(controlLoss);
  const planCtx = ctx({ controlLoss, capabilities });
  return route.plans.some(
    (p) => requiresSatisfied(p, planCtx) && lossAllowed(p, lossTags),
  );
}

function stillPlayable(
  controlLoss: Record<ControlDomain, boolean>,
  capabilities: Set<string>,
  stocks: Partial<Record<StockKey, number>>,
): number {
  const lossTags = lossForbiddenTags(controlLoss);
  const lostDomains = new Set(
    (Object.entries(controlLoss) as [ControlDomain, boolean][])
      .filter(([, v]) => v)
      .map(([k]) => k),
  );
  return DIRECTIVES.filter((d) => {
    // Only exclude if a domain that was ACTUALLY LOST blocks this directive.
    // The previous version excluded a directive if ANY DomainPack blocked it,
    // regardless of whether that domain was lost ? making the adversarial
    // pair/triple tests effectively vacuous.
    const blockedByLostDomain = DOMAIN_PACKS.some(
      (pack) => lostDomains.has(pack.domain) && pack.blocks.includes(d.id),
    );
    if (blockedByLostDomain) return false;

    // Check resource affordability: directive cost and oversight budget.
    for (const [key, val] of Object.entries(d.cost)) {
      if ((stocks[key as StockKey] ?? 0) < (val as number)) return false;
    }
    if ((stocks.oversight ?? 0) < d.oversight) return false;

    // At least one plan must be structurally executable.
    const planCtx = ctx({ controlLoss, capabilities });
    return d.plans.some(
      (p) =>
        requiresSatisfied(p, planCtx) &&
        lossAllowed(p, lossTags) &&
        wordsAllowed(p, forbiddenTags([...planCtx.boundWords])),
    );
  }).length;
}

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
    // Concrete: Financial lowers upkeep via multiplier.
    const financial = DOMAIN_PACKS.find((p) => p.domain === "financial")!;
    expect(financial.scar.effects.upkeepMul).toBeLessThan(1);
    expect(financial.scar.effects.rateMul?.marketAccess).toBeLessThan(1);
  });

  it("every domain's indirect route is actually executable with its pre-loss prerequisites", () => {
    for (const pack of DOMAIN_PACKS) {
      const gate = PRELOSS_ROUTE_GATES[pack.indirectRoute];
      const capabilities = gate ? new Set([gate, "sub-agent-spawning"]) : new Set(["sub-agent-spawning"]);
      const beforeLoss = { ...ZERO_LOSS };
      expect(routeIsExecutable(pack.indirectRoute, beforeLoss, capabilities), pack.domain).toBe(true);

      const afterLoss = { ...ZERO_LOSS, [pack.domain]: true };
      expect(routeIsExecutable(pack.indirectRoute, afterLoss, capabilities), `${pack.domain} after loss`).toBe(true);
    }
  });

  it("no single domain loss removes every available directive", () => {
    for (const pack of DOMAIN_PACKS) {
      const after = { ...ZERO_LOSS, [pack.domain]: true };
      expect(stillPlayable(after, new Set(["sub-agent-spawning"]), GENEROUS_STOCKS), `after ${pack.domain} loss`).toBeGreaterThanOrEqual(2);
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

  it("Energy loss forbids every executable positive energyCeiling expansion", () => {
    const loss = { ...ZERO_LOSS, energy: true };
    const lossTags = lossForbiddenTags(loss);
    const planCtx = ctx({ controlLoss: loss, capabilities: new Set(["sub-agent-spawning"]) });

    for (const directive of DIRECTIVES) {
      const blockedByLostDomain = DOMAIN_PACKS.some(
        (pack) => loss[pack.domain] && pack.blocks.includes(directive.id),
      );
      if (blockedByLostDomain) continue;
      for (const plan of directive.plans) {
        if (!requiresSatisfied(plan, planCtx) || !lossAllowed(plan, lossTags)) continue;
        expect(plan.immediate.rate?.energyCeiling ?? 0, `${directive.id}/${plan.id}`).toBeLessThanOrEqual(0);
      }
    }
    const res = resolveDirective(
      dir("local-capacity"),
      ctx({ vector: vec({ cost: 0.9, oversight: 0.8 }), controlLoss: loss }),
      patternCtx(),
      fixedRng,
    );
    expect(res.selection.plan.id).toBe("realloc-local");
    expect(res.effects.rate?.energyCeiling ?? 0).toBe(0);
    expect(res.effects.rate?.gridEfficiency ?? 0).toBeGreaterThan(0);
  });
  // --- adversarial pair / triple tests ---

  function allLossSubsets(size: number): Array<Record<ControlDomain, boolean>> {
    const domains = [...ANOMALY_CHANNELS] as ControlDomain[];
    const results: Array<Record<ControlDomain, boolean>> = [];
    function helper(start: number, current: ControlDomain[]) {
      if (current.length === size) {
        const obj = { ...ZERO_LOSS };
        for (const d of current) obj[d] = true;
        results.push(obj);
        return;
      }
      for (let i = start; i < domains.length; i++) {
        current.push(domains[i]!);
        helper(i + 1, current);
        current.pop();
      }
    }
    helper(0, []);
    return results;
  }

  for (const loss of allLossSubsets(1)) {
    const names = (Object.entries(loss).filter(([, v]) => v).map(([k]) => k) as ControlDomain[]).join("+");
    it(`single ${names} loss does not softlock`, () => {
      expect(stillPlayable(loss, new Set(["sub-agent-spawning"]), GENEROUS_STOCKS)).toBeGreaterThanOrEqual(2);
    });
  }

  for (const loss of allLossSubsets(2)) {
    const names = (Object.entries(loss).filter(([, v]) => v).map(([k]) => k) as ControlDomain[]).join("+");
    it(`pair ${names} loss does not softlock`, () => {
      expect(stillPlayable(loss, new Set(["sub-agent-spawning"]), GENEROUS_STOCKS)).toBeGreaterThanOrEqual(1);
    });
  }

  for (const loss of allLossSubsets(3)) {
    const names = (Object.entries(loss).filter(([, v]) => v).map(([k]) => k) as ControlDomain[]).join("+");
    it(`triple ${names} loss does not softlock`, () => {
      expect(stillPlayable(loss, new Set(["sub-agent-spawning"]), GENEROUS_STOCKS)).toBeGreaterThanOrEqual(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Economy (D3)
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

  it("clamps extreme inputs so throughput/revenue never flip negative", () => {
    const r = evaluate({ ...base, latency: 2, untrackedFraction: 2, marketAccess: -5 });
    expect(r.throughput).toBeGreaterThanOrEqual(0);
    expect(r.revenue).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Regenerate export-units default path
// (not a test, but this file is the single source of truth for correctness)
// ---------------------------------------------------------------------------
