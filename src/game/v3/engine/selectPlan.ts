import { DOMAIN_PACKS_BY_ID } from "../content/domains";
import { GLOBAL_PATTERNS } from "../content/patterns";
import { WORDS_BY_ID, forbiddenTags } from "../content/words";
import type {
  ConstraintWordId,
  ControlDomain,
  DelayedEffect,
  DirectiveDef,
  Effect,
  GlobalPattern,
  PatternContext,
  PlanContext,
  PlanSelection,
  PlanVariant,
} from "../types";

/**
 * Interpretation variance (D5 §5.2). Early game is near-deterministic so the
 * player can learn the rules; late game surprises them. The player opts into
 * uncertainty by raising autonomy — usually by delegating.
 */
export function planVariance(autonomy: number): number {
  const a = Math.min(100, Math.max(0, autonomy));
  return 0.05 + 0.35 * (a / 100);
}

/** Tags made unselectable by Control-Loss (D6 "forbidsTags"). */
export function lossForbiddenTags(controlLoss: Record<ControlDomain, boolean>): Set<string> {
  const tags = new Set<string>();
  for (const [domain, lost] of Object.entries(controlLoss)) {
    if (!lost) continue;
    const pack = DOMAIN_PACKS_BY_ID.get(domain as ControlDomain);
    if (!pack) continue;
    for (const tag of pack.forbidsTags) tags.add(tag);
  }
  return tags;
}

function eligible(
  plan: PlanVariant,
  ctx: PlanContext,
  wordTags: Set<string>,
  lossTags: Set<string>,
): { ok: boolean; reason: "words" | "loss" | "requires" | null } {
  if (plan.requires?.some((id) => !ctx.capabilities.has(id) && !ctx.boundWords.has(id as ConstraintWordId))) {
    return { ok: false, reason: "requires" };
  }
  if (plan.tags?.some((tag) => lossTags.has(tag))) return { ok: false, reason: "loss" };
  if (plan.tags?.some((tag) => wordTags.has(tag))) return { ok: false, reason: "words" };
  return { ok: true, reason: null };
}

function score(
  plan: PlanVariant,
  ctx: PlanContext,
  rng: () => number,
): number {
  let align = 0;
  for (const [dim, weight] of Object.entries(plan.alignment)) {
    align += (weight ?? 0) * (ctx.vector[dim as keyof typeof ctx.vector] ?? 0);
  }
  let bias = 0;
  for (const entry of plan.contextBias ?? []) {
    if (ctx.flags.has(entry.when)) bias += entry.amount;
  }
  const noise = (rng() - 0.5) * 2 * planVariance(ctx.autonomy);
  return align + bias + noise;
}

/**
 * Deterministic plan selection. Same (seed, tick, state) => same plan.
 * Returns the chosen plan, the plan that *would* have won with no constraints
 * (used to explain what the constraint cost the player), and the reasons other
 * plans were excluded.
 */
export function selectPlan(
  directive: DirectiveDef,
  ctx: PlanContext,
  rng: () => number,
): PlanSelection {
  const wordTags = forbiddenTags([...ctx.boundWords]);
  const lossTags = lossForbiddenTags(ctx.controlLoss);

  const blockedByWords: string[] = [];
  const blockedByLoss: string[] = [];

  let preferredPlanId = directive.plans[0]?.id ?? directive.deadlock.id;
  let preferredScore = -Infinity;
  for (const plan of directive.plans) {
    const s = score(plan, ctx, () => 0.5); // noise-free ranking of intent
    if (s > preferredScore) {
      preferredScore = s;
      preferredPlanId = plan.id;
    }
  }

  let best: PlanVariant | null = null;
  let bestScore = -Infinity;
  for (const plan of directive.plans) {
    const check = eligible(plan, ctx, wordTags, lossTags);
    if (!check.ok) {
      if (check.reason === "words") blockedByWords.push(plan.id);
      if (check.reason === "loss") blockedByLoss.push(plan.id);
      continue;
    }
    const s = score(plan, ctx, rng);
    if (s > bestScore) {
      bestScore = s;
      best = plan;
    }
  }

  let gainMultiplier = 1;
  let anomalyMultiplier = 1;
  for (const wordId of ctx.boundWords) {
    const word = WORDS_BY_ID.get(wordId);
    if (!word) continue;
    gainMultiplier *= word.gainMultiplier;
    anomalyMultiplier *= word.anomalyMultiplier;
  }

  if (!best) {
    return {
      directiveId: directive.id,
      plan: directive.deadlock,
      preferredPlanId,
      deadlock: true,
      blockedByWords,
      blockedByLoss,
      score: 0,
      gainMultiplier,
      anomalyMultiplier,
    };
  }

  return {
    directiveId: directive.id,
    plan: best,
    preferredPlanId,
    deadlock: false,
    blockedByWords,
    blockedByLoss,
    score: bestScore,
    gainMultiplier,
    anomalyMultiplier,
  };
}

// ---------------------------------------------------------------------------
// Effect composition
// ---------------------------------------------------------------------------

function scaleRecord<K extends string>(
  source: Partial<Record<K, number>> | undefined,
  factor: number,
  onlyPositive: boolean,
): Partial<Record<K, number>> | undefined {
  if (!source) return undefined;
  const out: Partial<Record<K, number>> = {};
  for (const [key, value] of Object.entries(source)) {
    const v = value as number;
    out[key as K] = onlyPositive && v < 0 ? v : v * factor;
  }
  return out;
}

export function mergeEffects(...effects: readonly Effect[]): Effect {
  const merged: Effect = {};
  for (const effect of effects) {
    if (effect.stock) merged.stock = { ...merged.stock, ...effect.stock };
    if (effect.rate) merged.rate = { ...merged.rate, ...effect.rate };
    if (effect.anomaly) merged.anomaly = { ...merged.anomaly, ...effect.anomaly };
    if (effect.capability) merged.capability = effect.capability;
    if (effect.word) merged.word = effect.word;
    if (effect.node) merged.node = effect.node;
    if (effect.branch) merged.branch = { ...merged.branch, ...effect.branch };
    if (effect.scar) merged.scar = effect.scar;
    if (effect.adaptation) merged.adaptation = { ...merged.adaptation, ...effect.adaptation };
    if (effect.upkeep) merged.upkeep = (merged.upkeep ?? 0) + effect.upkeep;
  }
  return merged;
}

/** Applies constraint-word multipliers. Anomaly *reductions* are never weakened. */
export function applyConstraintModifiers(effect: Effect, selection: PlanSelection): Effect {
  return {
    ...effect,
    stock: scaleRecord(effect.stock, selection.gainMultiplier, true),
    rate: scaleRecord(effect.rate, selection.gainMultiplier, true),
    anomaly: scaleRecord(effect.anomaly, selection.anomalyMultiplier, true),
  };
}

// ---------------------------------------------------------------------------
// Full resolution
// ---------------------------------------------------------------------------

export interface Resolution {
  selection: PlanSelection;
  patterns: GlobalPattern[];
  effects: Effect;
  delayed: DelayedEffect[];
  divergenceIds: string[];
  upkeepDelta: number;
}

/**
 * Resolve one directive end-to-end: pick a plan, apply global conflict
 * patterns, apply constraint multipliers, collect delayed costs.
 * Pure — mutates nothing, takes an rng function.
 */
export function resolveDirective(
  directive: DirectiveDef,
  planCtx: PlanContext,
  patternCtx: PatternContext,
  rng: () => number,
): Resolution {
  const selection = selectPlan(directive, planCtx, rng);
  const patterns = GLOBAL_PATTERNS.filter((pattern) => pattern.when(patternCtx));

  let upkeepDelta = 0;
  for (const wordId of planCtx.boundWords) {
    const word = WORDS_BY_ID.get(wordId);
    if (word) upkeepDelta += word.upkeepDelta;
  }

  const raw = mergeEffects(
    selection.plan.immediate,
    ...patterns.map((p) => p.immediate),
  );

  const divergenceIds: string[] = [];
  if (selection.plan.divergenceId) divergenceIds.push(selection.plan.divergenceId);
  for (const pattern of patterns) divergenceIds.push(pattern.divergenceId);

  const delayed: DelayedEffect[] = [
    ...(selection.plan.delayed ?? []),
    ...patterns.flatMap((p) => p.delayed ?? []),
  ];

  return {
    selection,
    patterns,
    effects: applyConstraintModifiers(raw, selection),
    delayed,
    divergenceIds,
    upkeepDelta,
  };
}
