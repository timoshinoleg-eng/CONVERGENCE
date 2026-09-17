# `src/game/v3` — executable core of the redesign

Reference implementation of the mechanics described in
[`docs/GAMEPLAY-REDESIGN.md`](../../../docs/GAMEPLAY-REDESIGN.md) (deliverables 2, 3, 5, 6).

**Status:** content + pure functions only. It does **not** touch `GameState` yet and
does not introduce a second simulation engine. Nothing in `src/game/*.ts` (v2) is
modified.

```
npm run typecheck                 # clean
npx vitest run src/game/v3        # 37 passed, ~1s
npx vitest run --testTimeout=180000   # 115/115 passed, ~28.6s
```

> **Correction to an earlier note.** The `pacing.spec.ts` "failure" is not a broken
> test — `replays the full pacing suite deterministically` needs **7.8 s** and
> vitest's default `testTimeout` is **5 s**. With a raised timeout the whole suite
> is green: **115/115**, 12 files, 28.6 s. Do not rewrite the harness (old unit
> U-26); just set `testTimeout`. See the corrected U-26 / U-26b / U-27 in the
> design doc.

## What is here

| File | Contents |
|---|---|
| `types.ts` | v3 content types + `PriorityVector`, `PlanContext`, `PatternContext`, `PlanSelection` |
| `content/words.ts` | 14 constraint words. Every word forbids plan tags **and** costs upside |
| `content/directives.ts` | 8 directives × 2–4 plan variants. **Ids are identical to v2** |
| `content/patterns.ts` | 6 global conflict patterns (CP-02/04/06/10/13/14) |
| `content/domains.ts` | 5 Control-Loss domain packs with mixed scars |
| `content/explanations.ts` | 23 explanation templates — the only authored prose in the system |
| `engine/selectPlan.ts` | `selectPlan`, `resolveDirective`, effect merging/multipliers |
| `engine/economy.ts` | throughput, upkeep, autonomy drift, hazard, Oversight cap |
| `v3.spec.ts` | 37 tests, including reachability of **all 14 conflict patterns** |

## The three ideas this code encodes

**1. The same button does different things.**
```ts
const res = resolveDirective(
  DIRECTIVES_BY_ID.get("reserve-compute")!,
  ctx,          // { vector, autonomy, boundWords, controlLoss, flags }
  patternCtx,
  rng,
);
// res.selection.plan.id  -> "spot-expand" | "term-contract" | "internal-realloc" | deadlock
// res.divergenceIds      -> ["div.cp-01"]
// res.delayed            -> [{ afterMs: 90_000, reveal: "div.cp-01.mature", effects }]
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
**mixed** scar. `financial:partition` lowers upkeep 15% *and* halves market access.
Public loss bans `covert` variants everywhere — that is what gives a Public
Control-Loss real strategic weight (today it is a near no-op).

## Wiring into v2 (next step, not done here)

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
