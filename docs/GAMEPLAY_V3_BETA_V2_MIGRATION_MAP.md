# CONVERGENCE — Beta V2 -> Gameplay V3 Migration Map

Base: main @ 0824bdd14119d73f7f0d3a75084c81b322a8b101

Legend:
- KEEP: preserve behavior/plumbing
- KEEP_ENGINE: preserve internally, simplify/hide UI
- REWORK: semantic change required
- DEFER: remove from first V3 foreground, revisit later
- DELETE_LATER: candidate removal only after replacement proves itself

| Beta V2 area | V3 disposition | Notes |
|---|---|---|
| Save envelope, validation, A/B recovery, migrations | KEEP | Do not regress durability |
| Scheduler / deterministic tick / RNG | KEEP | Foundation for repeatable state-driven simulation |
| Offline catch-up plumbing | KEEP / REWORK OUTPUT | Later becomes absence report, not only resource receipt |
| Operations lifecycle | KEEP / REWORK CONTENT | Operations must create/modify assets, commitments, or resolve crises |
| Commitments / upkeep | KEEP | Make named and attributable |
| Reservations | KEEP_ENGINE | UI uses total/used/committed/free; avoid reservation jargon |
| Compute | REWORK | Stock-like semantics -> capacity produced/consumed by Assets |
| Energy | REWORK | Capacity/load semantics tied to physical infrastructure |
| Capital | REWORK | Stock + named flow; remove unattributed meaningful passive income |
| Autonomy | REWORK | Spendable/growing resource -> derived non-spendable ratchet/state |
| Oversight | REWORK / DELAY INTRO | Foreground only when Agent exists; supervision capacity |
| 5 risk domains | KEEP_ENGINE | Stage visibility; at most 2–3 foreground pressures |
| Risk accumulation | REWORK | Causal source attribution + threshold ladder |
| Control-Loss Domain Packs | KEEP / ELEVATE | 100 Rupture payoff, not generic flag |
| Postures | DEFER | Do not foreground globally in first slice; evaluate local SAFE/NORMAL/SURGE asset mode |
| Constraint Words | DEFER | Freeze first 10–15 min; later evaluate concrete Policies |
| Interpretation Window | DEFER / REASSESS | Not a core V3 requirement unless it creates real trade-off without idle time |
| Progression phases | KEEP NAMES / REWORK GATES | Verb shifts + Phase Shift Challenges, time not sufficient |
| Moscow / regional concept | REWORK | Regional intro after network bottleneck; board scale changes |
| Media layer | KEEP ISOLATED | Presentation-only, must not mutate gameplay |
| Existing correctness/red-team tests | KEEP | New V3 tests extend, never replace regression protection |
| PR #32 / isolated src/game/v3 research | DO NOT MERGE | Donor ideas only; not source of truth |
| Current App/dashboard structure | REWORK | Board + ledger + decision drawer |
| Dev/debug panels | KEEP DEV-ONLY | Never foreground player experience |

## Save strategy
Do not decide schema number until Asset/Control contracts are stable.
Requirements:
- deterministic migration from current schema
- preserve durable old state where meaningful
- initialize new V3 structures explicitly
- never silently reinterpret old risk/resource values into unsafe new semantics without authored migration rules

## Branch strategy
main remains stable Beta V2.
V3 integration occurs on a separate branch after docs/data contracts freeze.
No V3 production merge before 30-minute vertical-slice acceptance.
