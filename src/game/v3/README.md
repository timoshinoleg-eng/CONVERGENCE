# `src/game/v3` — executable core of the redesign

> **Status: spike / experimental.** This is a reference implementation, not
> production integration. It is not wired into `GameState`, `runtime.ts`, or the
> UI. It exists so the mechanics in
> [`docs/GAMEPLAY-REDESIGN.md`](../../../docs/GAMEPLAY-REDESIGN.md) can be read
> as running code and tested, instead of only as prose.

```
npm run typecheck                 # clean
npx vitest run src/game/v3        # 81 passed, ~1s
npx vitest run --testTimeout=180000   # 115/115 passed, ~28.6s
```

> **Correction to an earlier note.** The `pacing.spec.ts` "failure" is not a
> broken test — `replays the full pacing suite deterministically` needs **7.8 s**
> and vitest's default `testTimeout` is **5 s**. With a raised timeout the whole
> suite is green: **115/115**, 12 files, 28.6 s. Do not rewrite the harness (old
> unit U-26); just set `testTimeout`. See the corrected U-26 / U-26b / U-27 in
> the design doc.

## What is here

| File | Contents |
|---|---|
| `types.ts` | v3 content types + `PriorityVector`, `PlanContext`, `PatternContext`, `PlanSelection`, `PatternTrigger`, `PatternState` |
| `content/words.ts` | 14 constraint words. Every word forbids plan tags **and** costs upside |
| `content/directives.ts` | 8 directives × 2–4 plan variants. **Ids are identical to v2**. No spendable `energy` stock (ceiling-only model) |
| `content/patterns.ts` | 6 global conflict patterns (CP-02/04/06/10/13/14) with explicit trigger semantics |
| `content/domains.ts` | 5 Control-Loss domain packs with mixed scars, using strict `rate`/`rateMul`/`upkeep`/`upkeepMul` semantics |
| `content/explanations.ts` | 23 explanation templates — the only authored prose in the system |
| `engine/selectPlan.ts` | `selectPlan`, `resolveDirective`, `mergeEffects` (additive composition), `selectPatterns` (once/cooldown/repeat) |
| `engine/economy.ts` | throughput, upkeep, autonomy drift, hazard, Oversight cap. Fractional inputs clamped so throughput/revenue never go negative |
| `engine/rates.ts` | `RATE_RANGES`, `clampRate`, `applyEffectToRates` — safety rails for accumulated rate effects |
| `v3.spec.ts` | **81** tests, including reachability of all 14 conflict patterns, real indirect-route executability, pair/triple loss adversarial coverage, pattern trigger semantics, and clamping invariants |

## The three ideas this code encodes

**1. The same button does different things.**
```ts
const res = resolveDirective(
  DIRECTIVES_BY_ID.get("reserve-compute")!,
  ctx,          // { vector, autonomy, boundWords, controlLoss, flags }
  patternCtx,
  rng,
  { patternState, nowMs }, // optional trigger bookkeeping
);
// res.selection.plan.id  -> "spot-expand" | "term-contract" | "internal-realloc" | deadlock
// res.divergenceIds      -> ["div.cp-01"]
// res.delayed            -> [{ afterMs: 90_000, reveal: "div.cp-01.mature", effects }]
// res.patternState       -> updated cooldown/once bookkeeping
```
Selection is `argmax(alignment · vector + contextBias + noise)`, with
`variance = 0.05 + 0.35 · autonomy/100`. Early game is predictable so the player
learns the rules; late game surprises them, because they raised autonomy — usually
by delegating. Deterministic for a fixed `(seed, tick, state)`. No LLM.

**2. Constraints cost something.**
Every one of the 14 words has `gainMultiplier < 1`. Binding `cost-cap` does not
just prevent CP-01, it cuts the directive's gain to 55%. Over-constraining removes
every plan and resolves as `compliance-deadlock` — cost paid, nothing gained.

**3. Control-Loss is a state, not a flag.**
Each of the 5 domain packs applies six things: blocks directives, removes words,
bans plan tags globally, applies a shock, reveals an indirect route, and applies a
**mixed** scar. `financial:partition` lowers upkeep 15% (`upkeepMul: 0.85`) *and*
halves market access (`rateMul: { marketAccess: 0.5 }`). Public loss bans `covert`
variants everywhere — that is what gives a Public Control-Loss real strategic
weight. (Current `main` already amputates `transparency-report` on Public loss;
the v3 fix is making the ban apply to **plan variants** globally, not just one
directive.)

## Semantics enforced by the code (not just documented)

- **Effect fields have exactly one meaning.** `rate` = absolute delta (`+20`).
  `rateMul` = multiplier (`1.25` = +25%, `0.5` = halved). Same split for
  `upkeep` / `upkeepMul`. No more "0.25 means +25% in one place and +0.25 units
  in another".
- **Effects compose additively for deltas and multiplicatively for modifiers.**
  `mergeEffects` sums matching `stock`/`rate`/`anomaly` keys and multiplies
  `rateMul`/`upkeepMul`. Previously object-spread silently overwrote.
- **Patterns declare trigger semantics.** `repeat` / `once` / `cooldown` prevent
  a persistent condition (e.g. `autonomy >= 45`) from stacking the same effect
  on every directive.
- **Rates are clamped.** `latency`, `untrackedFraction`, `hollowFraction`, etc.
  have defined `RATE_RANGES`. Repeated application saturates instead of producing
  negative throughput or revenue.

## Wiring into v2 (next step, NOT AUTHORISED yet)

This spike is deliberately isolated. The product team is still consolidating
UX, visual, Telegram and red-team results into a compact Beta V2 spec. Do not
start the wiring below until that spec is frozen.

1. Add the v3 fields to `GameState` in `src/game/model.ts` and bump
   `schemaVersion` to 3 with a migration in `src/game/save.ts`.
2. In `ConvergenceRuntime.executeDirective`, replace the direct
   `economy.execute(...)` call with `resolveDirective(...)`; keep IdleKit
   requirements for cost/control gating.
3. Push the result onto a pending-resolution queue instead of applying it
   immediately (the Interpretation Window, unit U-07).
4. Apply `DOMAIN_PACKS` inside `applyContainment` instead of setting a boolean.

## Deliberately not here

No GameState mutation · no scheduler · no UI · no balance tuning · no save schema.
Numbers in `economy.ts` (`DEFAULT_PARAMS`) are placeholders for tuning, not final.
