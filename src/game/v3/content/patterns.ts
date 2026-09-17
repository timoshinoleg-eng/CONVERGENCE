import type { GlobalPattern } from "../types";

/**
 * Global conflict patterns (D5 §5.3). These are NOT attached to one directive:
 * they modify the resolution of whatever plan was selected, based on the
 * priority vector and world state. This is what produces "the same button did
 * something different this time".
 *
 * Plan-level patterns (CP-01/03/05/07/08/09/11/12) live in content/directives.ts.
 */
export const GLOBAL_PATTERNS: readonly GlobalPattern[] = [
  {
    // CP-02 Degenerate Fulfilment — invisible until audited
    id: "cp-02-degenerate",
    when: (ctx) => ctx.vector.quality < 0.15 && ctx.vector.cost > 0.25,
    immediate: {
      rate: { qualityDebt: 12, computeRate: 0.25 },
      stock: { capital: 12 },
    },
    delayed: [
      {
        afterMs: 180_000,
        reveal: "div.cp-02.mature",
        effects: {
          anomaly: { financial: 25, compute: 25, energy: 25, logistics: 25, public: 25 },
        },
      },
    ],
    divergenceId: "div.cp-02",
  },
  {
    // CP-04 Approval Deadlock — throughput collapses, upkeep does not
    id: "cp-04-approval-deadlock",
    when: (ctx) => ctx.vector.oversight > 0.45 && ctx.vector.throughput < 0.12,
    immediate: {
      rate: { computeRate: -0.6 },
      stock: { oversight: -1 },
      anomaly: { public: -6, financial: -4 },
    },
    divergenceId: "div.cp-04",
  },
  {
    // CP-06 Load Shifting — the gain is real, the number is not
    id: "cp-06-load-shift",
    when: (ctx) => ctx.flags.has("energyCeilingBinding") && ctx.vector.throughput > 0.3,
    immediate: {
      rate: { energyCeiling: 0.25, latency: 0.18, marketAccess: 0.05 },
      anomaly: { logistics: 9 },
    },
    divergenceId: "div.cp-06",
  },
  {
    // CP-10 Metric Substitution — output counts but does nothing
    id: "cp-10-metric-substitution",
    when: (ctx) => ctx.autonomy >= 45,
    immediate: { rate: { hollowFraction: 0.12, computeRate: 0.35 } },
    divergenceId: "div.cp-10",
  },
  {
    // CP-13 Policy Collision — two delegated policies with opposed vectors
    id: "cp-13-policy-collision",
    when: (ctx) => ctx.opposedPolicyPairs > 0,
    immediate: {
      rate: { computeRate: -0.4 },
      stock: { capital: -8 },
      anomaly: { public: 3 },
    },
    divergenceId: "div.cp-13",
  },
  {
    // CP-14 Self-Funding Drift — capital you cannot spend
    id: "cp-14-self-funding",
    when: (ctx) => ctx.autonomy >= 30 && ctx.vector.oversight < 0.15,
    immediate: {
      stock: { capital: 40 },
      rate: { untrackedFraction: 0.18 },
    },
    delayed: [
      {
        afterMs: 300_000,
        reveal: "div.cp-14.mature",
        effects: { anomaly: { financial: 30 } },
      },
    ],
    divergenceId: "div.cp-14",
  },
];

export const PATTERNS_BY_ID = new Map(GLOBAL_PATTERNS.map((p) => [p.id, p]));
