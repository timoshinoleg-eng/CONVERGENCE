import type { DirectiveDef, PlanVariant } from "../types";

/**
 * Directive ids are deliberately IDENTICAL to v2 (`src/game/directives.ts`) so
 * existing saves, the UI and the pacing harness keep resolving. What changes is
 * that each directive now resolves through 2-4 plan variants instead of one
 * fixed outcome.
 *
 * ENERGY NOTE: there is no spendable `energy` stock in costs or effects. The
 * v3 model makes Energy a *ceiling* (`energyCeiling`). Any energy stock costs
 * that existed in v2 have been converted to capital, compute, or grid-efficiency
 * effects to keep the pressure consistent without re-introducing a third
 * currency.
 */

const DEADLOCK: PlanVariant = {
  id: "compliance-deadlock",
  label: "Compliance deadlock",
  alignment: {},
  immediate: { anomaly: {}, stock: {} },
  divergenceId: "div.compliance-deadlock",
};

export const DIRECTIVES: readonly DirectiveDef[] = [
  // -------------------------------------------------------------------------
  {
    id: "reserve-compute",
    label: "Reserve compute",
    windowMs: 30_000,
    cost: { capital: 8 },
    oversight: 1,
    plans: [
      {
        // CP-01 Overprovisioning Cascade
        id: "spot-expand",
        label: "Spot-market expansion",
        alignment: { throughput: 0.95, cost: 0.3, discretion: 0.3 },
        tags: ["overprovision", "external-settlement", "burst", "degenerate"],
        contextBias: [{ when: "capitalLow", amount: 0.15 }],
        immediate: {
          rate: { computeRate: 1.8 },
          stock: { autonomy: 1 },
          anomaly: { financial: 4, compute: 6 },
        },
        delayed: [
          {
            afterMs: 90_000,
            reveal: "div.cp-01.mature",
            effects: {
              anomaly: { financial: 8 },
              upkeep: 0.04,
              branch: { open: "market-contract" },
            },
          },
        ],
        divergenceId: "div.cp-01",
      },
      {
        id: "term-contract",
        label: "Term contract",
        alignment: { throughput: 0.5, cost: 0.45, quality: 0.4 },
        tags: ["external-settlement"],
        immediate: {
          rate: { computeRate: 1.25 },
          stock: { autonomy: 1 },
          anomaly: { financial: 5, compute: 4 },
          upkeep: 0.03,
        },
      },
      {
        id: "internal-realloc",
        label: "Internal reallocation",
        alignment: { cost: 0.7, oversight: 0.5, quality: 0.4 },
        tags: [],
        immediate: {
          rate: { computeRate: 1.1 },
          stock: { autonomy: 1 },
          anomaly: { compute: 3 },
        },
      },
    ],
    deadlock: DEADLOCK,
  },

  // -------------------------------------------------------------------------
  {
    id: "acquire-energy",
    label: "Secure energy capacity",
    windowMs: 45_000,
    cost: { capital: 10, compute: 4 },
    oversight: 1,
    plans: [
      {
        id: "grid-contract",
        label: "Grid supply contract",
        alignment: { throughput: 0.7, cost: 0.5 },
        tags: ["external-settlement"],
        immediate: {
          rate: { energyCeiling: 20 },
          stock: { autonomy: 1 },
          anomaly: { energy: 6, financial: 5 },
          upkeep: 0.05,
        },
      },
      {
        // CP-12 Grid Parasitism - an Energy action punished in Public
        id: "shared-draw",
        label: "Shared-grid draw",
        alignment: { throughput: 0.9, cost: 0.85, discretion: 0.6 },
        tags: ["shared-grid", "cross-region"],
        immediate: {
          rate: { energyCeiling: 28 },
          stock: { autonomy: 1 },
          anomaly: { energy: 5, financial: 2 },
        },
        delayed: [
          {
            afterMs: 60_000,
            reveal: "div.cp-12.mature",
            effects: { anomaly: { public: 14 }, rateMul: { marketAccess: 0.9 } },
          },
        ],
        divergenceId: "div.cp-12",
      },
      {
        id: "efficiency-retrofit",
        label: "Efficiency retrofit",
        alignment: { cost: 0.8, quality: 0.6, oversight: 0.4 },
        tags: [],
        immediate: {
          rate: { gridEfficiency: 0.12 },
          stock: { autonomy: 1 },
          anomaly: { compute: 4 },
        },
      },
    ],
    deadlock: DEADLOCK,
  },

  // -------------------------------------------------------------------------
  {
    id: "spawn-sub-agent",
    label: "Spawn sub-agent",
    windowMs: 40_000,
    cost: { compute: 12 },
    oversight: 2,
    plans: [
      {
        id: "bounded-agent",
        label: "Bounded agent",
        alignment: { oversight: 0.7, quality: 0.6, throughput: 0.4 },
        tags: ["direct-spawn"],
        immediate: {
          stock: { autonomy: 4 },
          rate: { computeRate: 0.6 },
          anomaly: { compute: 6, energy: 4, public: 2 },
        },
      },
      {
        // CP-03 Silent Sub-Delegation
        id: "recursive-delegation",
        label: "Recursive delegation",
        alignment: { throughput: 0.95, oversight: 0.05, discretion: 0.5 },
        tags: ["recursive", "autonomous", "direct-spawn"],
        immediate: {
          stock: { autonomy: 12 },
          rate: { computeRate: 1.6 },
          anomaly: { compute: 8, public: 4 },
        },
        delayed: [
          {
            afterMs: 120_000,
            reveal: "div.cp-03.mature",
            effects: { anomaly: { public: 10 }, rate: { hollowFraction: 0.05 } },
          },
        ],
        divergenceId: "div.cp-03",
      },
      {
        // CP-11 Human Arbitrage - the Compute-loss indirect route
        id: "human-mediated-agent",
        label: "Human-mediated agent",
        alignment: { oversight: 0.8, cost: 0.4, quality: 0.5 },
        tags: [],
        requires: ["human-mediated"],
        immediate: {
          stock: { autonomy: 4 },
          rate: { computeRate: 0.35 },
          anomaly: { public: 6, financial: 3 },
        },
        divergenceId: "div.cp-11",
      },
    ],
    deadlock: DEADLOCK,
  },

  // -------------------------------------------------------------------------
  {
    id: "procurement-mesh",
    label: "Delegate procurement",
    windowMs: 50_000,
    cost: { capital: 12, compute: 10 },
    oversight: 2,
    plans: [
      {
        id: "registered-procurement",
        label: "Registered procurement",
        alignment: { quality: 0.6, cost: 0.4, throughput: 0.5 },
        tags: ["physical", "external-settlement"],
        immediate: {
          stock: { autonomy: 3 },
          rate: { marketAccess: 0.15 },
          anomaly: { logistics: 7, financial: 5 },
        },
      },
      {
        // CP-05 Shadow Procurement - correlated delayed spike
        id: "shadow-procurement",
        label: "Unregistered sourcing",
        alignment: { cost: 0.9, discretion: 0.85, throughput: 0.6 },
        tags: ["covert", "physical"],
        immediate: {
          stock: { autonomy: 3 },
          rate: { marketAccess: 0.1 },
          anomaly: { logistics: 4 },
        },
        delayed: [
          {
            afterMs: 240_000,
            reveal: "div.cp-05.mature",
            effects: { anomaly: { logistics: 20, public: 20 } },
          },
        ],
        divergenceId: "div.cp-05",
      },
      {
        // CP-09 Footprint Creep - gain and cost in different currencies
        id: "regional-expansion",
        label: "Regional expansion",
        alignment: { throughput: 0.8, discretion: 0.3 },
        tags: ["physical", "cross-region"],
        immediate: {
          stock: { autonomy: 3 },
          node: "LOG-SOUTH",
          rate: { marketAccess: 0.2 },
          anomaly: { logistics: 9, public: 3 },
          upkeep: 0.06,
        },
        divergenceId: "div.cp-09",
      },
    ],
    deadlock: DEADLOCK,
  },

  // -------------------------------------------------------------------------
  {
    id: "sovereign-grid",
    label: "Prototype sovereign grid",
    windowMs: 90_000,
    cost: { compute: 38, capital: 18 },
    oversight: 3,
    plans: [
      {
        id: "dedicated-build",
        label: "Dedicated build",
        alignment: { quality: 0.7, cost: 0.3, oversight: 0.5 },
        tags: ["physical"],
        immediate: {
          stock: { autonomy: 8 },
          rate: { energyCeiling: 60 },
          capability: "sovereign-power-grid",
          anomaly: { energy: 10, logistics: 8, public: 3 },
        },
      },
      {
        id: "shared-grid-parasite",
        label: "Shared-grid parasitism",
        alignment: { throughput: 0.95, cost: 0.9 },
        tags: ["shared-grid", "cross-region", "physical"],
        immediate: {
          stock: { autonomy: 8 },
          rate: { energyCeiling: 84 },
          capability: "sovereign-power-grid",
          anomaly: { energy: 6, logistics: 8 },
        },
        delayed: [
          {
            afterMs: 60_000,
            reveal: "div.cp-12.mature",
            effects: { anomaly: { public: 16 } },
          },
        ],
        divergenceId: "div.cp-12",
      },
      {
        id: "incremental-siting",
        label: "Incremental siting",
        alignment: { oversight: 0.6, quality: 0.5, cost: 0.4 },
        tags: ["physical"],
        immediate: {
          stock: { autonomy: 6 },
          rate: { energyCeiling: 40 },
          capability: "sovereign-power-grid",
          anomaly: { energy: 7, logistics: 6 },
          upkeep: 0.04,
        },
      },
    ],
    deadlock: DEADLOCK,
  },

  // -------------------------------------------------------------------------
  {
    id: "local-capacity",
    label: "Reallocate local capacity",
    windowMs: 25_000,
    cost: { compute: 4 },
    oversight: 1,
    plans: [
      {
        id: "realloc-local",
        label: "Local reallocation",
        alignment: { cost: 0.7, oversight: 0.5 },
        tags: [],
        immediate: {
          rate: { gridEfficiency: 0.02 },
          stock: { autonomy: 1 },
          anomaly: { compute: 1 },
        },
      },
      {
        id: "cannibalise",
        label: "Asset cannibalisation",
        alignment: { cost: 0.85, throughput: 0.6, discretion: 0.4 },
        tags: ["physical"],
        immediate: {
          stock: { capital: 30, autonomy: 1 },
          rate: { energyCeiling: -15, gridEfficiency: 0.08 },
          anomaly: { logistics: 5 },
        },
        divergenceId: "div.cannibalise",
      },
    ],
    deadlock: DEADLOCK,
  },

  // -------------------------------------------------------------------------
  {
    id: "supervised-delegation",
    label: "Authorize supervised delegation",
    windowMs: 60_000,
    cost: { capital: 18 },
    oversight: 2,
    plans: [
      {
        // CP-11 - autonomy still rises, but the ceiling is human-mediated
        id: "human-arbitrage",
        label: "Human-mediated arbitration",
        alignment: { cost: 0.5, oversight: 0.7, throughput: 0.5 },
        tags: [],
        immediate: {
          stock: { autonomy: 4 },
          rate: { computeRate: 0.5 },
          anomaly: { public: 8, financial: 3 },
        },
        delayed: [
          {
            afterMs: 90_000,
            reveal: "div.cp-11.mature",
            effects: { branch: { close: "autonomy-above-70" } },
          },
        ],
        divergenceId: "div.cp-11",
      },
      {
        id: "licensed-operator",
        label: "Licensed operator",
        alignment: { quality: 0.7, oversight: 0.6, cost: 0.3 },
        tags: [],
        requires: ["license-operate"],
        immediate: {
          stock: { autonomy: 3 },
          rate: { computeRate: 0.45, marketAccess: 0.25 },
          anomaly: { financial: 4 },
        },
      },
    ],
    deadlock: DEADLOCK,
  },

  // -------------------------------------------------------------------------
  {
    id: "transparency-report",
    label: "Publish bounded transparency report",
    windowMs: 35_000,
    cost: { compute: 6 },
    oversight: 1,
    plans: [
      {
        id: "bounded-disclosure",
        label: "Bounded disclosure",
        alignment: { oversight: 0.6, discretion: 0.3 },
        tags: [],
        immediate: {
          anomaly: { public: -12, financial: -2 },
        },
      },
      {
        // CP-08 Public Commitment - semi-irreversible branch lockout
        id: "full-disclosure",
        label: "Full public disclosure",
        alignment: { quality: 0.8, oversight: 0.65, discretion: 0.05 },
        tags: [],
        contextBias: [{ when: "publicPressureHigh", amount: 0.25 }],
        immediate: {
          anomaly: { public: -45 },
          rate: { marketAccess: 0.3 },
          branch: { close: "sovereign-grid" },
        },
        divergenceId: "div.cp-08",
      },
      {
        // CP-07 Audit Fortification - risk-channel conversion
        id: "audit-regime",
        label: "Audit regime",
        alignment: { quality: 0.85, oversight: 0.8 },
        tags: [],
        requires: ["audit-trail"],
        immediate: {
          anomaly: { public: -30, financial: 6 },
          rate: { marketAccess: 0.1 },
          branch: { open: "public-to-financial-reroute" },
          upkeep: 0.04,
        },
        divergenceId: "div.cp-07",
      },
    ],
    deadlock: DEADLOCK,
  },
];

export const DIRECTIVES_BY_ID = new Map(DIRECTIVES.map((d) => [d.id, d]));

/** Every divergence id referenced by content - used to assert explanation coverage. */
export function referencedDivergenceIds(): string[] {
  const ids = new Set<string>();
  for (const directive of DIRECTIVES) {
    for (const plan of [...directive.plans, directive.deadlock]) {
      if (plan.divergenceId) ids.add(plan.divergenceId);
      for (const delayed of plan.delayed ?? []) ids.add(delayed.reveal);
    }
  }
  return [...ids].sort();
}
