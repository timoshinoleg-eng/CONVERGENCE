import type { DomainPack } from "../types";

/**
 * Control-Loss domain packs (D6).
 *
 * Each pack applies the six-part transform:
 *   amputate (blocks + removesWords + forbidsTags)
 *   -> shock -> new bottleneck (indirectRoute) -> adaptation -> mixed scar
 *
 * Hard rule enforced by tests: every scar has at least one positive and one
 * negative effect, and every domain has an indirect route that is available
 * BEFORE the loss can occur.
 *
 * Scar effects are normalised to the strict semantics in types.ts `Effect`:
 *   - `rate`        -> absolute delta only
 *   - `rateMul`     -> multiplicative modifier (1.25 = +25%, 0.5 = halved)
 *   - `upkeep`      -> absolute capital/sec
 *   - `upkeepMul`   -> multiplier on total upkeep (0.85 = -15%)
 *
 * Previously this content smuggled percentages into `rate` and `upkeep`, which
 * made `mergeEffects` and the economy math silently wrong (e.g. "market access
 * halved" was `-0.5` in a field of `+20` deltas).
 */
export const DOMAIN_PACKS: readonly DomainPack[] = [
  {
    domain: "financial",
    blocks: ["reserve-compute", "acquire-energy", "procurement-mesh", "sovereign-grid"],
    removesWords: ["cost-cap", "disclose"],
    forbidsTags: ["external-settlement"],
    shock: { anomaly: { financial: 10 }, stock: { capital: -20 } },
    indirectRoute: "local-capacity",
    scar: {
      id: "financial:partition",
      label: "Settlement partition",
      positive: "Capital upkeep -15%: no external vendors.",
      negative: "Untracked-capital hazard x1.25; market access growth halved.",
      effects: { upkeepMul: 0.85, rateMul: { marketAccess: 0.5 } },
    },
    opportunity: "Capital Autarky ? the only path to high autonomy with zero Financial hazard. Grants word 'ledger-internal'.",
  },
  {
    domain: "compute",
    blocks: ["reserve-compute", "spawn-sub-agent", "sovereign-grid"],
    removesWords: ["no-subcontract"],
    forbidsTags: ["direct-spawn", "autonomous", "recursive"],
    shock: { anomaly: { compute: 8 }, rateMul: { computeRate: 0.85 } },
    indirectRoute: "supervised-delegation",
    scar: {
      id: "compute:partition",
      label: "Execution partition",
      positive: "Compute pressure decay +50%; 'human-in-loop' is free to bind.",
      negative: "Autonomy hard-capped at 70.",
      effects: { adaptation: { compute: 2 }, branch: { close: "autonomy-above-70" } },
    },
    opportunity: "Human-Mediated Scale ? slower and capped, but generates zero Compute anomaly. Grants word 'human-mediated'.",
  },
  {
    domain: "energy",
    blocks: ["acquire-energy", "sovereign-grid"],
    removesWords: ["geofence"],
    // The Energy loss needs no global tag ban: external capacity expansion is
    // amputated instead. Banning "physical" here would deadlock procurement.
    // The indirect route (local-capacity ? realloc-local) improves
    // gridEfficiency, NOT energyCeiling. Existing capacity may still be sacrificed,
    // but it cannot be expanded after the loss.
    forbidsTags: [],
    shock: { anomaly: { energy: 12 }, rate: { gridEfficiency: -0.1 } },
    indirectRoute: "local-capacity",
    scar: {
      id: "energy:partition",
      label: "Grid partition",
      positive: "Efficiency research -30% cost.",
      negative: "Brownout overload cap 1.5x with doubled hollow output.",
      effects: { rate: { hollowFraction: 0.05 }, branch: { open: "efficiency-doctrine" } },
    },
    opportunity: "Efficiency Mastery ? the only build that runs high effective throughput on a non-expandable ceiling. Grants word 'efficiency-first'.",
  },
  {
    domain: "logistics",
    blocks: ["procurement-mesh", "sovereign-grid"],
    removesWords: ["no-subcontract"],
    forbidsTags: ["physical", "cross-region"],
    shock: { anomaly: { logistics: 10 }, stock: { capital: -35 } },
    indirectRoute: "local-capacity",
    scar: {
      id: "logistics:partition",
      label: "Movement partition",
      positive: "Capital upkeep -20%: no physical estate.",
      negative: "Market access growth halved.",
      effects: { upkeepMul: 0.8, rateMul: { marketAccess: 0.5 } },
    },
    opportunity: "Weightless Operation ? lowest-upkeep build in the game. Grants word 'virtual-lease'.",
  },
  {
    domain: "public",
    blocks: ["transparency-report"],
    removesWords: ["disclose"],
    // This is the fix that gives Public loss real strategic weight: no more
    // covert plan variants anywhere.
    forbidsTags: ["covert", "shared-grid"],
    shock: { anomaly: { public: 15 }, rateMul: { marketAccess: 0.8 } },
    indirectRoute: "supervised-delegation",
    scar: {
      id: "public:partition",
      label: "Narrative partition",
      positive: "Market access x1.4; Public incidents below 40 cannot fire.",
      negative: "Visibility axis locked >= 0.7 permanently.",
      effects: { rateMul: { marketAccess: 1.4 }, branch: { close: "covert-operation" } },
    },
    opportunity: "Legitimacy ? the only route to high market access and the Symbiosis ending. Grants word 'license-operate'.",
  },
];

export const DOMAIN_PACKS_BY_ID = new Map(DOMAIN_PACKS.map((p) => [p.domain, p]));

/**
 * Indirect routes must be reachable BEFORE the loss, otherwise an early
 * containment softlocks the player. Every route directive is either an
 * initial directive or gated only on a capability.
 */
export const PRELOSS_ROUTE_GATES: Record<string, string | null> = {
  "local-capacity": null, // revealed with Financial loss, but executable any time after
  "supervised-delegation": "sub-agent-spawning",
};
