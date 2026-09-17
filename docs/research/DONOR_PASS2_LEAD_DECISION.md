# CONVERGENCE — Lead decision on Perplexity donor pass 2

Date: 2026-09-17

This document reconciles the Perplexity addendum with the code that is already running in `main`. The goal is to avoid replacing a green beta foundation merely because a new library is mature or attractive on paper.

## Executive decision

Do **not** replace the current beta core wholesale.

The current `main` has already passed typecheck, integration tests, production web build, Capacitor sync and Android `assembleDebug`. Any new donor must therefore beat an existing, tested subsystem on at least one of these axes: correctness, maintainability, content-authoring leverage, or measurable reduction of own code. Mature-library age alone is not enough.

Status after this review:

| Candidate | Decision | Reason |
|---|---|---|
| `@casl/ability` | **SPIKE / likely useful later** | Strong fit for richer permission semantics, but current Control-Loss is already implemented through IdleKit `Requirement<GameState>` without duplicated state. |
| `rot-js` RNG | **SPIKE, not beta replacement** | Mature seeded RNG and weighted selection; adopting it now changes persisted RNG state and risks breaking deterministic save/replay behavior before beta. |
| `rot-js` Scheduler | **DO NOT replace current wall-clock scheduler** | ROT schedulers are game-action/turn queues. CONVERGENCE's current scheduler is a wall-clock boundary that feeds elapsed time into deterministic simulation. These are different responsibilities. |
| `json-rules-engine` | **POSTPONE** | Current directive eligibility is already expressible using IdleKit requirements. Revisit when designers need large declarative JSON rule sets. |
| `xstate` | **POSTPONE** | Current canonical `GameState` already owns phase and five containment tracks. Adding an actor/statechart runtime now would create a second state owner unless carefully reduced to a pure derived adapter. |
| `seedrandom` | **REJECT / unnecessary** | Current RNG works; if replaced, `rot-js` already supplies seeded RNG and state serialization. |
| Endgame: Singularity code | **REFERENCE ONLY** | Root `LICENSE.txt` explicitly licenses code as GPL-2-or-later; data/art are CC BY-SA 3.0. GitHub `NOASSERTION` metadata does not override the repository's explicit license text. |
| Yggdrasil Forge | **KEEP** | Still the best identified headless progression graph fit. |
| InkJS | **KEEP** | Already integrated and tested for narrative branching. |
| IdleKit economy | **KEEP** | Already integrated; requirements/transactions cleanly operate over canonical `GameState`. |

## Factual corrections

### Endgame: Singularity is explicitly GPL-2+

The Perplexity addendum says the project is "not confirmed GPL" because GitHub metadata reports `NOASSERTION`. That conclusion is incorrect at file level.

`singularity/singularity/LICENSE.txt` explicitly states that the program may be redistributed/modified under GNU GPL version 2 or later, and separately identifies data/artwork as CC BY-SA 3.0. Therefore:

- GitHub metadata classification is not authoritative here;
- source code remains unsuitable as a direct donor for CONVERGENCE's permissive-license policy;
- the project stays a design/reference donor only.

### The npm package is `rot-js`, not `rot.js`

`ondras/rot.js/package.json` declares:

- package name: `rot-js`;
- version observed during audit: `2.2.1`;
- license: BSD-3-Clause;
- ESM entry: `lib/index.js`;
- zero runtime dependencies according to npm.

The correct installation/import surface is therefore `rot-js`.

### rot.js already contains weighted selection

The RNG implementation includes:

- `setSeed()`;
- `getUniform()`;
- `getUniformInt()`;
- `getWeightedValue()`;
- `getState()` / `setState()`;
- `clone()`.

Consequently a separate weighted-sampler package is unnecessary. We may still write a tiny typed wrapper around `getWeightedValue()` if event objects need stable IDs.

## Why CASL is not an automatic replacement for current Control-Loss

Current CONVERGENCE already expresses loss of control as executable requirements on transactions:

```ts
controlAvailable("financial")
controlAvailable("compute")
```

Those requirements are checked by the same economy layer that executes a directive. This is valuable because the rule cannot be bypassed by a UI bug: hiding/disabling a button is not the security boundary.

CASL becomes valuable when the permission model becomes richer than five booleans, for example:

- multiple directive classes under one domain;
- fallback/alternative actions (`FinancialTransfer` blocked but `ShadowBarter` available);
- conditional permissions by visibility, phase, scars, region or capability;
- UI needs a first-class query such as `can("issue", directiveClass)`.

If CASL is adopted, the architecture must remain one-way:

```text
canonical GameState
      ↓
derive CASL rules
      ↓
Ability.can(...) for presentation / directive catalogue filtering
      ↓
execution still re-validates authoritative IdleKit/domain requirements
```

CASL must never become a second mutable source of truth.

## Why rot-js Scheduler is not a direct scheduler replacement

Current CONVERGENCE scheduler responsibility:

```text
Date.now()/setInterval boundary
        ↓
{ currentTime, deltaMs }
        ↓
pure/deterministic simulation
```

ROT's `Scheduler.Action`/`Speed` responsibility is different: it orders actors/items in a logical game-time queue and re-enqueues them based on duration/speed.

Therefore replacing the current scheduler would conflate wall-clock progression with action ordering. If CONVERGENCE later needs scheduled agents, delayed projects or discrete world events, a ROT scheduler/event queue can be evaluated *inside* the simulation layer while the outer wall-clock boundary remains intact.

## RNG migration risk

Current beta saves serialize a seed plus monotonic counter. The current RNG can reproduce a value directly from `(seed, counter)`.

ROT RNG is a mutable Alea generator whose serializable state is four numeric internals returned by `getState()`. Replacing RNG before closed beta would require:

1. save schema migration;
2. test fixture updates;
3. deterministic/offline equivalence checks;
4. verification that existing saves do not change future incident sequences unexpectedly.

The maturity benefit is real, but the migration is not justified immediately before user testing. Evaluate it in an isolated spike first.

## XState and json-rules-engine

The proposed stack is currently over-complete.

### XState

Do not make XState the owner of global phase while `GameState.meta.phase` and `GameState.containment[*].stage` already exist. That creates two copies of state and forces synchronization.

Revisit XState when one or more of these become true:

- nested/parallel transition logic becomes difficult to reason about with pure functions;
- state transitions need visualization/inspection tooling;
- scripted events require guarded transitions across many orthogonal regions;
- the statechart itself materially removes custom transition code.

Until then, pure transition functions over canonical `GameState` are simpler.

### json-rules-engine

It is a good candidate for *content authoring*, not a mandatory core dependency today. IdleKit `Requirement<GameState>` already handles the current predicates and is synchronously integrated with transactions.

Adopt `json-rules-engine` only when directive/event eligibility moves to sizeable JSON-authored content where non-programmers need to edit nested `all/any` rules without TypeScript changes.

## Beta architecture remains

```text
canonical plain GameState
│
├── simulation/timing
│   ├── current wall-clock scheduler (ciefa-derived)
│   ├── current deterministic RNG (ciefa-derived)
│   └── own hazard/containment simulation
│
├── economy
│   └── IdleKit resources / requirements / transactions
│
├── progression
│   └── Yggdrasil dependency graph
│
├── narrative
│   └── InkJS
│
├── persistence
│   └── versioned A/B snapshots + Capacitor Preferences
│
└── Vue/Pinia
    └── UI projection + native lifecycle adapter
```

No runtime LLM, backend, monetization, XState, CASL, json-rules-engine or rot-js is required to complete the first closed beta.

## Safe next step

Run one isolated donor spike, with no merge to `main` unless it demonstrates measurable value:

1. Add `@casl/ability` and `rot-js` on a spike branch only.
2. Implement the same five current Control-Loss tests through a derived CASL Ability without removing authoritative IdleKit requirements.
3. Implement a ROT RNG adapter compatible with CONVERGENCE's `TickRng` interface.
4. Add deterministic tests: same seed/state → same incident sequence; serialize/restore → same next values.
5. Measure production bundle delta with Vite.
6. Compare adapter LOC and complexity against current code.
7. Do **not** change save schema or beta build until the spike shows a clear benefit.

Acceptance for adoption:

- all existing integration tests stay green;
- Android APK still builds;
- no second mutable state owner;
- bundle increase is acceptable;
- code becomes simpler or enables a concrete beta/post-beta feature, not merely "more mature".
