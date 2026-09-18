# CONVERGENCE Gameplay V3 — Compatibility Audit against current main

Audited source: main @ 0824bdd14119d73f7f0d3a75084c81b322a8b101
Files checked:
- src/game/model.ts
- src/game/betaV2.ts
- src/game/save.ts

Purpose: document implementation constraints before Wave 1 external outputs are reconciled. No production change is authorized here.

## 1. Save/version reality
Current:
- GameState.schemaVersion is literal 3
- CURRENT_SAVE_VERSION is 3
- Zod gameStateSchema is structurally tied to Beta V2
- migrations exist 1->2 and 2->3

Implication:
A real V3 state-model implementation will require a new save version (practically v4 unless another migration lands first) and an explicit 3->4 migration. Do not mutate schemaVersion 3 semantics in place.

## 2. Resource semantics conflict
Current GameState:
resources.compute / capital / energy / autonomy are four scalar stocks.

V3 target:
- Capital: stock + named flow
- Compute: capacity/use/committed/free derived from Assets
- Energy: capacity/load/committed/free derived from Assets
- Autonomy: derived non-spendable state

Implication:
Do not reinterpret old scalar compute/energy/autonomy fields silently.
V3 needs canonical Asset/accounting state and derived resource projections.

Migration must define deterministic mapping from V2 resources/commitments to V3 starting Assets or an authored legacy-start profile. Exact numeric preservation is not automatically correct because semantics change.

## 3. Useful reusable types
Current ControlDomain exactly matches V3 risk identities:
financial / compute / energy / logistics / public

Recommendation:
reuse this identity set; do not create a parallel V3 risk-domain enum.

Current ResourceVector is useful for costs/effects, but not sufficient as V3 canonical ledger/accounting state.

## 4. Commitments
Current BetaCommitment already contains:
- operation/standing state
- work total/remaining
- reservations
- upkeep
- starvation
- pressure domains
- release/control metadata

Recommendation:
reuse lifecycle ideas and pure accounting where possible.
Do not automatically make BetaCommitment the V3 Asset type. Asset is persistent world structure; Commitment is an obligation/operation linked to Assets.

## 5. Reservations
Current implementation has mature reservation semantics and acceptance coverage.

Recommendation:
KEEP_ENGINE.
V3 UI should project:
total / used / committed / free
instead of exposing reservation jargon.
Do not remove reservation plumbing before equivalent accounting invariants are proven.

## 6. Oversight
Current schema:
oversight.capacity is z.literal(2)
occupancy kinds are operation/verify/posture/containment.

V3 target:
Oversight becomes supervision capacity introduced at Agent phase and may later evolve.

Implication:
dynamic capacity or new occupancy owners will require schema changes.
Do not overload old occupancy kinds with Agent semantics in schema v3.

## 7. Posture / Constraint language
Current save schema requires:
- posture object
- language object
- current/pending transition data
- unlocked Constraint Words

V3 first slice defers global Postures/Constraint Words.

Migration policy should preserve legacy fields only as migration input/history, not keep them as mandatory active V3 mechanics.
Do not delete them from schema 3.

## 8. Progression phase mismatch
Current Phase:
client-terminal / distributed-syndicate / technosphere

V3 conceptual phases:
LOCAL / AGENT / NETWORK / REGIONAL / TECHNOSPHERE

Recommendation:
introduce an explicit V3 phase/progression state in new schema rather than forcing richer V3 semantics into the old Phase union before migration.
A later UI adapter may map V3 phases to narrative presentation labels.

## 9. Risk / containment
Current state already has:
- anomaly per domain
- containment track per domain
- controlLoss per domain
- pending containments
- terminal states

Recommendation:
preserve domain identity and Domain-Pack/control-route behavior where correct, but replace decorative/opaque accumulation with causal source attribution and edge-triggered 25/50/75/100 threshold state in V3.

Migration must avoid re-firing historical thresholds on load. Threshold crossing flags must be initialized from migrated pressure values deterministically.

## 10. Operations catalog
Current Beta plans directly grant resource scalars on completion.

V3 rule:
operations should create/modify Assets, Commitments or resolve Situations.

Recommendation:
do not port PLAN_CATALOG mechanically.
Treat it as balance/content donor only.

## 11. Implementation shape recommended for Lead
Until external Wave 1 is reconciled, prefer:
```
GameState v4
  stable/shared fields
  v3: V3State
    assets
    dependencies
    accounting/control projection inputs
    situations
    pressures
    agents
    progression
```

Avoid a big-bang deletion of betaV2 code during first implementation PR.
First establish v4 schema/migration + V3 pure model with tests, then switch runtime/UI incrementally.

## 12. Migration questions that must be resolved before code
1. Do existing Beta V2 player saves need semantic continuity, or is V3 allowed an authored reset/legacy conversion?
2. How are old standing commitments mapped to named Assets?
3. How are old scalar Compute/Energy values converted to capacity?
4. How is old Autonomy mapped to V3 derived autonomy without granting unearned permissions?
5. How are old anomaly/containment tracks mapped to threshold-crossing flags without duplicate events?
6. Which existing scars/controlLoss states must remain authoritative after migration?
7. Does V3 retain old narrative/meta.phase fields for compatibility or derive presentation from V3 progression?

These are Design Freeze questions, not implementation details.
