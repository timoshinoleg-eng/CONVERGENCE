# CONVERGENCE Gameplay V3 — Wave 1 Parallel Task Map

## Source authority
1. main @ 0824bdd14119d73f7f0d3a75084c81b322a8b101
2. GAMEPLAY_V3_MASTER_SPEC.md
3. GAMEPLAY_V3_30M_VERTICAL_SLICE_SPEC.md
4. GAMEPLAY_V3_DATA_CONTRACTS.md
5. GAMEPLAY_V3_BETA_V2_MIGRATION_MAP.md

Old isolated PR #32/src/game/v3 is not source of truth.

## Ownership rule
Only Lead/Integration may change V3 production core during Wave 1.
External models produce specs, fixtures, wireframes, test plans or tests-only patches.

## A1 — Economy / Asset Systems
No GitHub required.
Deliver:
- V3_ECONOMY_SPEC.md
- 10–12 Asset catalog
- exact first-30-minute formulas
- Capital ledger model
- Compute/Energy capacity accounting
- Ghost/Corporation/Swarm balance traces
- exploit/dominance analysis

## A2 — Situation / Event Design
No GitHub required.
Deliver:
- V3_SITUATION_CATALOG.md
- situations.json or TypeScript data pack
- 15–18 state-driven situations
- causes, options, ignore outcomes, future hooks
No operational real-world cybercrime instructions; keep fictional/systemic abstractions.

## A3 — Progression / Rupture
No GitHub required.
Deliver:
- V3_PROGRESSION_AND_RUPTURE_SPEC.md
- phase shift challenges
- 25/50/75/100 ladder for domains in slice
- Domain Pack alignment
- Agent/Network/Regional verb shifts

## A4 — Board / UX
No GitHub required.
Deliver:
- V3_BOARD_UX_SPEC.md
- portrait/mobile wireframes
- LOCAL/AGENT/NETWORK/REGIONAL board states
- ledger drill-down
- Situation drawer
- visual language for supervision, autonomy, Legibility, pressure

## A5 — Acceptance / Red-Team
GitHub optional.
Deliver:
- GAMEPLAY_V3_ACCEPTANCE_TEST_PLAN candidate
- adversarial scenarios
- if coding: tests-only files/patch
Must not fix production core.

## Lead — current session
- freeze master docs/contracts
- reconcile external outputs
- define exact implementation interfaces
- only then begin Asset economy implementation
