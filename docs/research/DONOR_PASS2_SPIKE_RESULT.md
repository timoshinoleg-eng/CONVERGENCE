# CONVERGENCE — CASL + rot-js Spike Result

Date: 2026-09-17
Issue: #12
Spike PR: #13 (draft, intentionally not merged)

## Purpose

Test two recommendations from the Perplexity donor pass against the already-working beta core instead of adopting them from reputation alone:

- `@casl/ability` 7.0.1 for Control-Loss permissions;
- `rot-js` 2.2.1 for seeded RNG / weighted selection.

The current wall-clock scheduler was deliberately **not** replaced because ROT schedulers solve logical actor/action ordering, not the outer `Date.now()/deltaMs` boundary used by CONVERGENCE.

## What was implemented in the spike

### CASL

A derived `Ability` was built from canonical `GameState.controlLoss`. It mirrored the five current directive control-domain mappings while leaving IdleKit requirements authoritative for execution.

The test matrix compared CASL against actual `ConvergenceRuntime.executeDirective()` for all current combinations:

- 5 Control-Loss domains;
- 5 directives;
- 25 domain × directive combinations.

Result: **CASL matched the authoritative runtime in every tested combination.**

### rot-js RNG

A spike adapter provided:

- `next()`;
- `chance()`;
- integer range;
- weighted selection using built-in `getWeightedValue()`;
- snapshot/restore using `getState()` / `setState()`.

Tests verified:

- identical seed → identical sequence;
- serialized state → restored generator continues with the identical next sequence;
- weighted selection remains deterministic for identical seed/state.

Result: **rot-js is technically suitable as a deterministic RNG donor.**

## CI evidence

Spike CI after the type-level adapter fix:

- typecheck: PASS;
- existing integration suite: 10/10 PASS;
- donor spike suite: 5/5 PASS;
- total: **15/15 PASS**;
- production Vite build: PASS;
- Capacitor Android generation/sync: PASS;
- Gradle `assembleDebug`: PASS;
- APK artifact upload: PASS.

The first spike run exposed one real TypeScript integration detail: `rot-js#getWeightedValue()` is typed as `string | undefined`; the adapter must reject an empty weight map explicitly. This was fixed before the final run.

## Bundle measurement

The spike intentionally invoked both candidate adapters from the production entry so tree shaking could not remove them.

| Build | Main JS raw | Main JS gzip | Modules transformed |
|---|---:|---:|---:|
| Current `main` baseline | 481.72 kB | 133.04 kB | 135 |
| CASL + rot-js spike | 504.80 kB | 141.03 kB | 192 |
| Delta | **+23.08 kB** | **+7.99 kB** | +57 |
| Relative delta | **+4.79%** | **+6.01%** | — |

This is a combined probe, not a per-package attribution. It is sufficient for the beta decision because neither package is currently necessary to unlock a missing beta feature.

## Decision

### `@casl/ability`: POSTPONE, keep as approved post-beta candidate

CASL works and its mental model is excellent for a future richer permission system. It is **not needed for the first beta**, because current Control-Loss is already enforced inside the authoritative transaction path through IdleKit `Requirement<GameState>` predicates.

Adding CASL today would create a duplicated directive→control-domain mapping unless directive metadata is first refactored into one shared declarative source.

Adopt later when at least one of these is required:

- multiple action classes per control domain;
- alternative permissions such as `FinancialTransfer` blocked while `ShadowBarter` remains available;
- permissions depending on phase, Visibility, scars, region, operator or capability;
- UI/content systems need a stable first-class `can("issue_directive", subject)` query.

If adopted, CASL rules must always be **derived from canonical GameState**. Execution must still revalidate authoritative domain/economy requirements.

### `rot-js` RNG: POSTPONE until after first beta save compatibility window

rot-js is mature and technically solid. It also makes a separate `seedrandom` or weighted-sampler dependency unnecessary.

However the current beta RNG is only a small deterministic `(seed, counter)` implementation and already works in online/offline tests. Switching to ROT Alea state now would require changing persisted RNG representation to the internal four-number state, therefore:

- save schema migration;
- deterministic fixture changes;
- compatibility policy for already distributed saves;
- additional regression testing with no immediate player-facing gain.

Do not take this migration immediately before closed beta.

ROT may still become useful later for:

- event variant weighted selection;
- richer stochastic content tools;
- discrete scheduled agents/events if a logical event queue is introduced.

### `rot-js` Scheduler: REJECT as replacement for current wall-clock scheduler

The responsibilities differ. Keep the current outer scheduler:

```text
wall clock → deltaMs → deterministic simulation
```

If logical action scheduling becomes necessary, a ROT event/scheduler component may be embedded **inside** simulation as a separate subsystem.

### XState / json-rules-engine: unchanged — POSTPONE

The spike produced no evidence that either dependency is needed for beta.

- Keep phase/containment in canonical `GameState` with pure transition functions.
- Keep current IdleKit requirements for current predicates.
- Revisit JSON rules only when sizeable designer-authored declarative rule content appears.
- Revisit XState only when nested/parallel transition complexity becomes expensive enough to justify a statechart runtime.

## Beta consequence

**No dependency or save-schema change from this spike should be merged to `main`.**

The current beta core remains the lower-risk implementation:

- one canonical GameState;
- IdleKit requirements/transactions;
- Yggdrasil capability graph;
- InkJS narrative;
- current deterministic RNG and wall-clock scheduler;
- own Anomaly / Containment / Control-Loss mechanics;
- Capacitor lifecycle/persistence.

The spike branch/PR remains useful as executable evidence, but the experiment is complete and should be closed without merge.
