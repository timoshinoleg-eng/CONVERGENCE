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
  PatternState,
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

// ---------------------------------------------------------------------------
// Eligibility — split into independent predicates so "preferred" can be ranked
// over a different subset than "selected".
// ---------------------------------------------------------------------------

/** Prerequisites (capabilities / bound words) satisfied. */
export function requiresSatisfied(plan: PlanVariant, ctx: PlanContext): boolean {
  return !(plan.requires ?? []).some(
    (id) => !ctx.capabilities.has(id) && !ctx.boundWords.has(id as ConstraintWordId),
  );
}

/** Not forbidden by Control-Loss. */
export function lossAllowed(plan: PlanVariant, lossTags: Set<string>): boolean {
  return !(plan.tags ?? []).some((tag) => lossTags.has(tag));
}

/** Not forbidden by a bound constraint word. */
export function wordsAllowed(plan: PlanVariant, wordTags: Set<string>): boolean {
  return !(plan.tags ?? []).some((tag) => wordTags.has(tag));
}

function eligible(
  plan: PlanVariant,
  ctx: PlanContext,
  wordTags: Set<string>,
  lossTags: Set<string>,
): { ok: boolean; reason: "words" | "loss" | "requires" | null } {
  if (!requiresSatisfied(plan, ctx)) return { ok: false, reason: "requires" };
  if (!lossAllowed(plan, lossTags)) return { ok: false, reason: "loss" };
  if (!wordsAllowed(plan, wordTags)) return { ok: false, reason: "words" };
  return { ok: true, reason: null };
}

function score(plan: PlanVariant, ctx: PlanContext, rng: () => number): number {
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
 *
 * `preferredPlanId` is the plan that would have won **ignoring constraint
 * words** — that is the comparison an explanation needs. It is ranked only over
 * plans that are structurally available (`requires` satisfied, not forbidden by
 * Control-Loss), so it can never name a plan that was impossible for reasons
 * unrelated to the words the player bound.
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

  // --- preferred: noise-free intent ranking over structurally available plans
  let preferredPlanId = directive.deadlock.id;
  let preferredScore = -Infinity;
  let preferredFound = false;
  for (const plan of directive.plans) {
    if (!requiresSatisfied(plan, ctx) || !lossAllowed(plan, lossTags)) continue;
    const s = score(plan, ctx, () => 0.5);
    if (s > preferredScore) {
      preferredScore = s;
      preferredPlanId = plan.id;
      preferredFound = true;
    }
  }

  // --- selected: the best plan that is actually executable right now
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

  const deadlock = !best;

  let preferredUnavailableReason: PlanSelection["preferredUnavailableReason"] = "none";
  if (!preferredFound) preferredUnavailableReason = "not-selectable";
  else if (!deadlock && best!.id !== preferredPlanId) preferredUnavailableReason = "words";
  else if (deadlock) preferredUnavailableReason = blockedByWords.includes(preferredPlanId) ? "words" : "not-selectable";

  return {
    directiveId: directive.id,
    plan: best ?? directive.deadlock,
    preferredPlanId,
    preferredUnavailableReason,
    deadlock,
    blockedByWords,
    blockedByLoss,
    score: deadlock ? 0 : bestScore,
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

function sumRecord<K extends string>(
  target: Partial<Record<K, number>>,
  source: Partial<Record<K, number>> | undefined,
): void {
  if (!source) return;
  for (const key in source) {
    const k = key as K;
    const v = source[k] ?? 0;
    target[k] = (target[k] ?? 0) + v;
  }
}

function mulRecord<K extends string>(
  target: Partial<Record<K, number>>,
  source: Partial<Record<K, number>> | undefined,
): void {
  if (!source) return;
  for (const key in source) {
    const k = key as K;
    const v = source[k] ?? 1;
    target[k] = (target[k] ?? 1) * v;
  }
}

/**
 * Compose effects from a plan plus any number of global patterns.
 *
 * Composition rules (see `Effect` docs in types.ts):
 *   - `stock`, `rate`, `anomaly`, `upkeep`, `adaptation`  -> SUM
 *   - `rateMul`, `upkeepMul`                              -> MULTIPLY
 *   - scalar fields (`capability`, `word`, `node`, `scar`) -> last wins
 *
 * The previous implementation used object spread, which silently REPLACED a
 * plan's delta with a pattern's delta on the same key (e.g. a plan's
 * `computeRate: 1.8` was erased by CP-10's `computeRate: 0.35`).
 */
export function mergeEffects(...effects: readonly Effect[]): Effect {
  const merged: Effect = {};
  for (const effect of effects) {
    if (effect.stock) {
      merged.stock ??= {};
      sumRecord(merged.stock, effect.stock);
    }
    if (effect.rate) {
      merged.rate ??= {};
      sumRecord(merged.rate, effect.rate);
    }
    if (effect.rateMul) {
      merged.rateMul ??= {};
      mulRecord(merged.rateMul, effect.rateMul);
    }
    if (effect.anomaly) {
      merged.anomaly ??= {};
      sumRecord(merged.anomaly, effect.anomaly);
    }
    if (effect.adaptation) {
      merged.adaptation ??= {};
      sumRecord(merged.adaptation, effect.adaptation);
    }
    if (effect.upkeep) merged.upkeep = (merged.upkeep ?? 0) + effect.upkeep;
    if (effect.upkeepMul) merged.upkeepMul = (merged.upkeepMul ?? 1) * effect.upkeepMul;
    if (effect.capability) merged.capability = effect.capability;
    if (effect.word) merged.word = effect.word;
    if (effect.node) merged.node = effect.node;
    if (effect.branch) merged.branch = { ...merged.branch, ...effect.branch };
    if (effect.scar) merged.scar = effect.scar;
  }
  return merged;
}

/**
 * Applies constraint-word multipliers. Anomaly *reductions* are never weakened.
 * `*Mul` fields are structural (scars, patterns) and are deliberately NOT
 * scaled by constraint words — "market access halved" stays halved.
 */
export function applyConstraintModifiers(effect: Effect, selection: PlanSelection): Effect {
  return {
    ...effect,
    stock: scaleRecord(effect.stock, selection.gainMultiplier, true),
    rate: scaleRecord(effect.rate, selection.gainMultiplier, true),
    anomaly: scaleRecord(effect.anomaly, selection.anomalyMultiplier, true),
  };
}

// ---------------------------------------------------------------------------
// Pattern trigger semantics
// ---------------------------------------------------------------------------

export interface PatternFireResult {
  fired: GlobalPattern[];
  /** Pass this back in on the next resolution; it is plain JSON. */
  state: PatternState;
}

export function emptyPatternState(): PatternState {
  return {};
}

/**
 * Decide which patterns fire, honouring their trigger semantics.
 *
 * Without this, a pattern whose condition is a persistent state (e.g.
 * `autonomy >= 45`) fires on EVERY directive, stacking its effect without bound.
 * This function is pure: it takes the previous state and returns the next one,
 * so it is save/restore safe and needs no timers.
 */
export function selectPatterns(
  patterns: readonly GlobalPattern[],
  ctx: PatternContext,
  state: PatternState = {},
  nowMs = 0,
): PatternFireResult {
  const fired: GlobalPattern[] = [];
  const next: PatternState = { ...state };

  for (const pattern of patterns) {
    if (!pattern.when(ctx)) continue;
    const previous = next[pattern.id] ?? { fired: false, lastFiredMs: null };
    const trigger = pattern.trigger ?? { kind: "repeat" as const };

    if (trigger.kind === "once" && previous.fired) continue;
    if (
      trigger.kind === "cooldown" &&
      previous.lastFiredMs !== null &&
      nowMs - previous.lastFiredMs < trigger.cooldownMs
    ) {
      continue;
    }

    fired.push(pattern);
    next[pattern.id] = { fired: true, lastFiredMs: nowMs };
  }

  return { fired, state: next };
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
  /** Updated pattern bookkeeping to persist for the next resolution. */
  patternState: PatternState;
}

export interface ResolveOptions {
  patternState?: PatternState;
  /** Sim-time in ms. Only meaningful for `cooldown` triggers. */
  nowMs?: number;
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
  options: ResolveOptions = {},
): Resolution {
  const selection = selectPlan(directive, planCtx, rng);
  const { fired: patterns, state: patternState } = selectPatterns(
    GLOBAL_PATTERNS,
    patternCtx,
    options.patternState ?? {},
    options.nowMs ?? 0,
  );

  let upkeepDelta = 0;
  for (const wordId of planCtx.boundWords) {
    const word = WORDS_BY_ID.get(wordId);
    if (word) upkeepDelta += word.upkeepDelta;
  }

  const raw = mergeEffects(selection.plan.immediate, ...patterns.map((p) => p.immediate));

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
    patternState,
  };
}
