# Gameplay redesign — what to hand over

Companion index to [`GAMEPLAY-REDESIGN.md`](./GAMEPLAY-REDESIGN.md) (1457 lines).
That document is self-sufficient as a design; the artifacts below make it
**executable and verifiable**. Everything is local, no backend required.

## Send in this order

| # | Path | Why | How to verify |
|---|---|---|---|
| 1 | `src/game/v3/` (10 files, ~2040 lines) | **The main one.** Working reference core: 14 constraint words, 8 directives × 23 plans, 6 conflict patterns, 5 domain packs, `selectPlan` + `economy`. Turns deliverables 2/3/5/6 from prose into code | `npx vitest run src/game/v3` → **37 passed** |
| 2 | `src/game/v3/README.md` | 4 steps to wire into v2: save migration → `resolveDirective` in `executeDirective` → Interpretation Window queue → `DOMAIN_PACKS` in `applyContainment` | read first |
| 3 | `docs/PACING_BASELINE.json` | **Measured "before".** 5 scenarios × 30 min: milestones, resources, anomalies. This is the bug in numbers — aggressive and measured both end at autonomy **59**. Regression base: after U-01…U-08 these numbers **must** diverge | `npm run test:pacing -- --testTimeout=180000` |
| 4 | `docs/IMPLEMENTATION-UNITS.json` | 30 units (U-01…U-29 + U-26b) machine-readable: feature, player value, systems, donor, R1/R2/R3, difficulty, deps, acceptance. Imports into Issues / Project Board without retyping | `node scripts/export-units.mjs` (regenerates from the doc) |
| 5 | `docs/MECHANICS-MATRIX.csv` | 28 mechanics × 10 columns from section C. Open in a sheet, assign owners | open in Excel/Sheets |

## Do not send

- `package-lock.json` — byproduct of a local `npm install`, not part of this work.

## Correction to the document

Unit **U-26 was wrong** and has been rewritten. It used to read "headless fast-path
for the pacing harness", based on the belief that
`replays the full pacing suite deterministically` was broken. It is not:

- the test needs **7.8 s**; vitest's default `testTimeout` is **5 s**;
- with `--testTimeout=180000` the whole suite is green: **115/115, 12 files, 28.6 s**.

So no rewrite is needed — just raise the timeout. Current wording:
**U-26** = raise the timeout (S) · **U-26b** = optional headless fast-path (M, defer) ·
**U-27** = behaviour-divergence assertion, ship it together with U-05/U-06 — that is
the gate proving the Interpretation Cycle actually changed behaviour.

## Status at handover

```
npm run typecheck                       clean
npx vitest run src/game/v3              37 passed   (~1s)
npx vitest run --testTimeout=180000     115 passed  (~28.6s)
```

No file in `src/game/*.ts` (v2) is modified. There is no second simulation loop and
`GameState` is still the single canonical state.

## Remaining work, in P0 order (section B)

U-25 save migration → U-01 Oversight → U-02 upkeep → U-03 energy ceiling →
U-05 priority vector → U-06 `selectPlan` → U-07 interpretation window →
U-08 constraint words. Without those eight there is still no decision to make.
