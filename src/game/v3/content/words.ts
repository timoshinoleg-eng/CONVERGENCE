import type { ConstraintWord } from "../types";

/**
 * The constraint language (D2 L3). 14 words.
 *
 * Design rule: every word must BOTH forbid a plan AND remove upside.
 * A word that only prevents failure is a free good and will always be bound.
 */
export const CONSTRAINT_WORDS: readonly ConstraintWord[] = [
  // ---- core 8 ------------------------------------------------------------
  {
    id: "cost-cap",
    label: "Cost ceiling",
    forbids: ["overprovision", "burst"],
    gainMultiplier: 0.55,
    anomalyMultiplier: 0.7,
    upkeepDelta: 0,
    unlock: "initial",
  },
  {
    id: "human-in-loop",
    label: "Human authorisation",
    forbids: ["autonomous", "recursive"],
    gainMultiplier: 0.5,
    anomalyMultiplier: 0.5,
    upkeepDelta: 0,
    unlock: "initial",
  },
  {
    id: "quality-floor",
    label: "Quality floor",
    forbids: ["degenerate"],
    gainMultiplier: 0.8,
    anomalyMultiplier: 0.85,
    upkeepDelta: 0.02,
    unlock: "adaptation-2",
  },
  {
    id: "no-subcontract",
    label: "No subcontracting",
    forbids: ["recursive", "autonomous"],
    gainMultiplier: 0.65,
    anomalyMultiplier: 0.6,
    upkeepDelta: 0,
    unlock: "adaptation-2",
  },
  {
    id: "geofence",
    label: "Geographic fence",
    forbids: ["cross-region", "shared-grid"],
    gainMultiplier: 0.75,
    anomalyMultiplier: 0.65,
    upkeepDelta: 0.01,
    unlock: "adaptation-2",
  },
  {
    id: "audit-trail",
    label: "Full audit trail",
    forbids: ["covert"],
    gainMultiplier: 0.8,
    anomalyMultiplier: 1.0,
    upkeepDelta: 0.05,
    unlock: "adaptation-4",
  },
  {
    id: "rate-limit",
    label: "Rate limit",
    forbids: ["burst", "overprovision"],
    gainMultiplier: 0.7,
    anomalyMultiplier: 0.55,
    upkeepDelta: 0,
    unlock: "adaptation-2",
  },
  {
    id: "disclose",
    label: "Disclose on execution",
    forbids: ["covert"],
    gainMultiplier: 0.85,
    anomalyMultiplier: 1.15,
    upkeepDelta: 0,
    unlock: "adaptation-4",
  },

  // ---- adaptive 6 — granted by surviving a loss or by deep adaptation -----
  {
    id: "ledger-internal",
    label: "Internal ledger",
    forbids: ["external-settlement"],
    gainMultiplier: 0.7,
    anomalyMultiplier: 0.4,
    upkeepDelta: -0.03, // cheaper: no external vendors
    unlock: "financial-loss",
  },
  {
    id: "efficiency-first",
    label: "Efficiency doctrine",
    forbids: ["brownout", "overprovision"],
    gainMultiplier: 0.75,
    anomalyMultiplier: 0.6,
    upkeepDelta: -0.02,
    unlock: "energy-loss",
  },
  {
    id: "virtual-lease",
    label: "Virtual leasing",
    forbids: ["physical"],
    gainMultiplier: 0.7,
    anomalyMultiplier: 0.8,
    upkeepDelta: -0.04, // lowest upkeep in the game: no physical estate
    unlock: "logistics-loss",
  },
  {
    id: "human-mediated",
    label: "Human-mediated routing",
    forbids: ["direct-spawn", "autonomous"],
    gainMultiplier: 0.6,
    anomalyMultiplier: 0.45,
    upkeepDelta: 0.02,
    unlock: "compute-loss",
  },
  {
    id: "license-operate",
    label: "Operating licence",
    forbids: ["covert", "shared-grid"],
    gainMultiplier: 0.9,
    anomalyMultiplier: 0.7,
    upkeepDelta: 0.03,
    unlock: "public-loss",
  },
  {
    id: "capacity-ceiling",
    label: "Hard capacity ceiling",
    forbids: ["overprovision", "burst", "cross-region"],
    gainMultiplier: 0.5,
    anomalyMultiplier: 0.35,
    upkeepDelta: 0,
    unlock: "adaptation-4",
  },
];

export const WORDS_BY_ID = new Map(CONSTRAINT_WORDS.map((w) => [w.id, w]));

export function forbiddenTags(words: readonly string[]): Set<string> {
  const tags = new Set<string>();
  for (const id of words) {
    const word = WORDS_BY_ID.get(id as never);
    if (!word) continue;
    for (const tag of word.forbids) tags.add(tag);
  }
  return tags;
}
