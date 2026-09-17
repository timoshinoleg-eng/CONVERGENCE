# HY4 — deep donor and license audit for CONVERGENCE

**Role:** GitHub code-audit lead
**Audited against:** `docs/PROJECT_CONTEXT.md` @ `f250b5f`
**Branch:** `research/hy4-donor-audit`
**Date:** 2026-09-17

All findings below come from cloned source at the exact commits listed in §13. Where a README claim and the repository contents disagree, the repository wins and the conflict is recorded.

---

## 1. Executive summary

**The four-donor architecture is feasible and I recommend proceeding with it, with one structural correction and one hard license stop.**

1. **Single `GameState` is achievable — but only if `@idlekitjs/core` is rejected.** IdleKit's `Engine` constructs its own `ReactiveStore` and owns the state object (`packages/core/src/engine.ts`). Its **economy** and **mechanics** packages, by contrast, are explicitly state-agnostic: the accessor contract says *"the state stays owned by the game and is never scanned"*. The split is therefore: **take `economy` + `mechanics`, reject `core`**.

2. **Control-Loss does not require forking IdleKit — this is now verified, not assumed.** `Requirement<T>` is declared as `isMet(state: T, economy: EconomyReader<T>)`, where `T` is the consumer's state type. A CONVERGENCE containment predicate is simply `isMet: (state) => !state.controlLoss.financial`. The donor's own docstring confirms the intent: *"custom state predicates can simply ignore the second argument"* and *"Economy must never learn a gameplay domain"*. Yggdrasil complements this with `TreeEngine.lock()` / `lockOneTier()` for the graph-side half.

3. **Flopsed is confirmed dead as a code donor.** At commit `61c27b3` there is no LICENSE file anywhere in the tree, no `license` field in `package.json`, and the README "License: MIT" badge hyperlinks to a file that does not exist. Reference only. Do not copy.

4. **Weighted game-specific reuse is 60%, not 80%.** 35 functional units: 16 × R1, 10 × R2, 9 × R3. Effort estimate: ~715 h from scratch vs ~403 h with adaptation (≈44% reduction). I did not inflate this; forcing 80% would mean donating CONVERGENCE's identity systems, which is exactly what the brief forbids.

5. **Two non-obvious engineering risks surfaced:**
   - **zod version split** — ciefa pins zod **v4** for its save schema, Yggdrasil core pins zod **^3.25**. Do not unify them; keep the save schema (ours, v4) and Yggdrasil's internal validation (v3) on opposite sides of the adapter boundary.
   - **Yggdrasil's own README says "Early development. Public API not yet stable."** despite a `1.0.0` version. Pin the commit and keep the blast radius small.

6. **inkjs is cheap.** Measured with esbuild (es2020, minified): runtime-only entry = **125.6 KB minified / 31.7 KB gzip**. Negligible for a mobile build. Ship the runtime entry only; never `/full`.

---

## 1a. Reconciliation with `main` @ `5c9bb22` (second pass)

While this audit was running, `main` advanced from `f250b5f` to `5c9bb22` ("feat: establish CONVERGENCE integration foundation"), which already contains a working integration scaffold (`src/game/**`, `capacitor.config.ts`, `THIRD_PARTY_NOTICES.md`, CI). I re-verified every conclusion against that code. **The scaffold matches this audit's recommendations on every structural point**, and five findings below are refinements rather than agreement.

### What `main` already implements, and how it lines up

| Area | `main` implementation | Audit alignment |
|---|---|---|
| Single `GameState` | `ConvergenceRuntime` holds one state; `getSnapshot()` / `replaceState()` / `subscribe()` | ✅ matches §9 — no donor owns the state |
| IdleKit usage | `createEconomy<GameState>()` with nested accessors; **no `@idlekitjs/core` import** | ✅ matches §9.5 |
| Control-Loss | `controlAvailable(domain): Requirement<GameState>` → `isMet: (state) => !state.controlLoss[domain]`, attached to directive transactions | ✅ **§10 confirmed in production code**, not just feasible |
| Vendoring | `src/game/engine/{scheduler,rng,events}.ts` from ciefa | ✅ matches §3 |
| Yggdrasil usage | `DependencyGraph` only, in `src/game/capabilities.ts` | ⚠️ see refinement 4 |
| Persistence | `src/game/save.ts`, `@capacitor/preferences`, `THIRD_PARTY_NOTICES.md` | ✅ matches §3.3 — Capacitor transport, ciefa policy |
| zod split | `zod@4.3.6` in package.json alongside `@yggdrasil-forge/core@1.0.0` (zod 3 internally) | ⚠️ risk 2 is **live**, not hypothetical |

`src/game/integration.spec.ts` already asserts: InkJS → IdleKit → Yggdrasil through one canonical `GameState`; containment blocking a transaction; RNG determinism; save round-trip plus corrupted-newest-slot recovery; checksum tampering; time-normalized hazard probability. Those map onto acceptance tests A1–A6 and A8 of §11 — A7 (exclusion branch) and the migration-path test are the two gaps.

### Refinement 1 — version pins were wrong in the first pass; `main` is right

The repository declares `@idlekitjs/economy@0.3.1`, but **npm has only published 0.1.0 and 0.1.1** — 0.3.1 is unreleased. `main` pins `0.1.1`, which is correct.

| Package | Repo source declares | npm latest published | Correct pin |
|---|---|---|---|
| `@idlekitjs/economy` | 0.3.1 (unreleased) | **0.1.1** | **0.1.1** |
| `@idlekitjs/mechanics` | 0.3.1 | **0.3.2** | **0.3.2** |

Note the inconsistency: mechanics has been republished repeatedly while economy has not. Do not assume the repo's version fields reflect what is installable.

### Refinement 2 — the Control-Loss contract is identical in the published 0.1.1

I inspected `@idlekitjs/economy@0.1.1`'s shipped `.d.ts` (tarball, not the repo). `Requirement<T>` (`id`, `label?`, `isMet(state, economy)`, `progress?`), `Transaction<T>` (`requirements`, `cost`, `reward`, `apply`, `metadata`) and the `{ kind: "requirement-failed"; requirementId; label? }` failure variant are **byte-identical in docstring and signature** to the repository HEAD I audited. `createEconomy`, `costCurve`, `resourceAtLeast/AtMost`, `allOf`, `not` are all exported. **§10 holds for the version actually pinned.**

### Refinement 3 — `@idlekitjs/mechanics` does depend on `@idlekitjs/core`, but tree-shaking keeps it out

`@idlekitjs/mechanics@0.3.2` declares `"@idlekitjs/core": "^0.3.1"` and **imports `Random` from it at runtime** — not type-only. That looks like it contradicts the "reject core" verdict, so I measured it rather than assumed:

| Entry point | Minified | `@idlekitjs/core` in bundle? |
|---|---|---|
| `mechanics/producers` + `mechanics/timers` | 4,920 B | **No** |
| `mechanics/projects` + `mechanics/modifiers` | 1,493 B | **No** |
| `mechanics` (full barrel) | 23,864 B | **No** |

The `Random` import lives in the `pickups` / `crafting` / `boosts` chunks, which our subpaths never reach. **"Reject `@idlekitjs/core`" is achievable in practice** — via subpath imports, not via the barrel. Do not `export * from "@idlekitjs/mechanics"`; import the subpaths.

### Refinement 4 — `DependencyGraph` alone costs 17.5 KB gzip; the next two classes cost 3.2 KB

`src/game/capabilities.ts` currently imports **only** `DependencyGraph` and hand-rolls `canUnlockCapability` / `unlockCapability`. Measured incremental cost:

| Imported from `@yggdrasil-forge/core` | Minified | Gzip | Δ gzip |
|---|---|---|---|
| `DependencyGraph` only | 72,795 B | **17,494 B** | — |
| `+ CycleDetector + UnlockResolver` | 86,859 B | **20,687 B** | **+3,193 B** |
| `+ TreeEngine` | 175,721 B | **44,070 B** | +23,383 B |

The bulk of the 17.5 KB is Yggdrasil's `immer` + `zod` dependencies, not the graph.

**Consequence:** the hand-rolled `canUnlockCapability` duplicates `UnlockResolver`, and it brings **no cycle detection** and **no `exclusion` support** — the latter being exactly the "mutually exclusive branches" requirement. Adding `CycleDetector` + `UnlockResolver` costs **~3.2 KB gzip**, which is close to free. `TreeEngine` (with `lock()` / `lockOneTier()`) costs **+23.4 KB**, so defer it until permanent capability scars need tier semantics; the `Requirement`-based Control-Loss path already covers the beta.

### Refinement 5 — total donor payload

| Component | Gzip |
|---|---|
| inkjs runtime | 31,693 B |
| `@yggdrasil-forge/core` (graph + cycle + unlock) | 20,687 B |
| `@idlekitjs/economy` | 4,072 B |
| `@idlekitjs/mechanics` (producers + timers + projects + modifiers) | ≈2,000 B |
| **Total** | **≈58 KB gzip** |

That is the entire donor surface for a mobile build. It is a good number and there is no reason to trade originality for bundle size.

---

## 2. License ledger

Full machine-readable ledger: `docs/research/data/license-ledger.json`.

| Repository | Commit | Root license | package.json field | Verdict |
|---|---|---|---|---|
| `ciefa/idle-game-template` | `a91cd5f8` | LICENSE — MIT, © 2026 ciefa | **absent** | **CLEAR** |
| `idlekitjs/idlekit` | `8c8607a8` | LICENSE — MIT, © 2026 IdleKit contributors | MIT in all 11 packages; LICENSE file in each | **CLEAR** |
| `fraga-labs/yggdrasil-forge` | `b7fee891` | LICENSE — MIT, © 2026 Agarfal | MIT in root + all packages | **CONDITIONAL** † |
| `y-lohse/inkjs` | `6b115341` | LICENSE.md — MIT, © 2017 inkle Ltd. + inkjs contributors | MIT (v2.4.0) | **CLEAR** |
| `IvarK/AntimatterDimensionsSourceCode` | `5409e320` | LICENSE — MIT, © 2017 IvarK | absent | **CONDITIONAL** ‡ |
| `Pseudo-Corp/SynergismOfficial` | `04f25838` | LICENSE — MIT, © 2019-2025 Platonic and Khafra | absent | **CLEAR** |
| `marcus/programaxis` | `fd642ddb` | LICENSE — MIT, © 2024 Programaxis | absent | **CLEAR**, identity unresolved |
| `ParriauxMaxime/flopsed` | `61c27b3c` | **no LICENSE file at any depth** | absent | **DO NOT COPY** |

† **CONDITIONAL for engineering reasons only**, not legal ones. MIT is unrestricted. The conditions are: pin the exact commit, restrict reuse to `packages/core`, and keep the subsystem bounded. Justification in §6.

‡ **CONDITIONAL on asset separation.** The code is MIT, but the repository ships `MonospaceTypewriter.sfd`, a font source carrying `Copyright (c) M Klein 1.2004` with **no accompanying license file**. Code and asset provenance are not documented separately. Treat bundled assets as not cleared.

### Special checks required by the brief

**Flopsed (`ParriauxMaxime/flopsed`) — prior finding CONFIRMED.**
A recursive search for `LICENSE`, `COPYING` and `NOTICE` at any depth returns **zero files**. `package.json` declares no license. The README renders an MIT badge pointing at a `LICENSE` path that does not exist. A badge is not a grant; default copyright applies. **Reference only.**

**Programaxis — prior MIT-vs-Apache-2.0 conflict is UNRESOLVED, not solved.**
A GitHub repository search for "programaxis" returns exactly **one** match: `marcus/programaxis` (a coding-themed idle game with Three.js), MIT. No Apache-2.0 Programaxis exists in the results. I therefore cannot substantiate the Apache-2.0 half of the prior note; the only resolvable canonical repository is MIT. Note also that the theme is *"automate software development, manage technical debt"* — materially less relevant to instrumental convergence than the prior notes assumed. **Downgrade to a weak reference.**

**Antimatter Dimensions — MIT/CC0 ambiguity resolved.**
There is no CC0 anywhere in the repository. One root `LICENSE`, MIT, © 2017 IvarK. No per-asset license file exists, which is the actual gap. Conclusion: **code MIT, assets undocumented → reference only.**

---

## 3. ciefa dependency map

Repo: `ciefa/idle-game-template` @ `a91cd5f8` (2026-05-22). 39 test files. Zero `TODO`/`FIXME` markers in `src`.

### 3.1 Module-by-module

| Module | Path | Imports | Framework leak | Class |
|---|---|---|---|---|
| Scheduler | `src/game/engine/scheduler.ts` (40 L) | none | `setInterval` only | **R1** |
| RNG | `src/game/engine/rng.ts` (45 L) | `type GameState` (type-only) | none — touches only `meta.rngSeed` / `meta.rngCounter` | **R1** |
| Event buffer | `src/game/events/bus.ts` (15 L) | `./types` | none | **R1** |
| Tick orchestrator | `src/game/engine/tick.ts` (108 L) | 8 domain systems, actions, events | `import.meta.env.DEV` | **R2** |
| Offline catch-up | `src/game/engine/offline.ts` (156 L) | `immer`, `tick`, `advanceAttunement` | immer | **R2** |
| Save envelope | `src/save/envelope.ts` (32 L) | `zod`, `./config` | zod v4 | **R1** |
| Checksum | `src/save/hash.ts` (12 L) | none | none | **R1** |
| Serialize / deserialize | `src/save/serialize.ts`, `deserialize.ts` | zod schema, `import.meta.env` | Vite env | **R2** |
| Migration runner | `src/save/migrate.ts` (62 L) | `./migrations`, `./errors` | none | **R1** |
| Persistence + recovery | `src/save/saveManager.ts` (290 L), `recovery.ts` (190 L) | `@tauri-apps/api`, `zustand`, `useGameStore` | **Tauri + Zustand** | **R3** |
| Pathfinding | `src/game/engine/pathfinding.ts` (52 L) | `@/game/data/registries` | domain registry | **R3** |

### 3.2 What survives extraction

**Scheduler — R1, ~95% retained.** `TICK_MS = 1000`, wall-clock read confined to `onInterval()`, negative-delta guard (`if (deltaMs < 0) deltaMs = 0`). No React, no Zustand, no Tauri. Vendorable almost verbatim.

**RNG — R1, ~90% retained.** Stateless `splitmix32`: `rngAt(seed, counter)`. `createTickRng(draft)` advances `draft.meta.rngCounter` on every draw, which means **every consumed random value is represented in the save file** — determinism across save/load comes for free. This is precisely the primitive the five-channel hazard engine needs. Only the type-only `GameState` import must be re-pointed.

**Tick orchestrator — R2, ~40% retained.** The reusable skeleton is: emitter creation, `runSystem()` with per-system try/catch that emits an `error` event instead of throwing, the two-phase order (Phase A drain queued actions → Phase B time-advancement systems → meta accounting), and the `skipOffline` flag. The `systems` array is 100% domain-specific and is replaced. Replace `import.meta.env.DEV` with an injected flag.

**Offline catch-up — R2, ~55% retained.** Confirmed: the earlier concern about domain dependencies is real and localized. `computeOfflineChunkMs()` walks `state.ships.instances`, mining/refining/scanning activities, dock transitions and `state.manufacturing.activeJobs` — **that function is R3 and must be rewritten** as a CONVERGENCE "next boundary" query. Everything else is directly reusable: `MAX_OFFLINE_CHUNK_MS` adaptive chunking, the `produce()`-per-chunk pattern, the cap/efficiency hooks (`getOfflineCap`, `getOfflineEfficiency` are already stubbed for progression gating), and the clock-anomaly guard that detects `lastTickTime > currentTime` and emits `clock_anomaly`.

**Save layer.** `envelope.ts` + `hash.ts` are R1 (~92%) — change only the `SAVE_FORMAT` string. `migrate.ts` is R1 (~90%) and is genuinely good: version-chain walking, `FUTURE_VERSION` rejection, and a check that each step actually produced `from + 1`. `serialize.ts`/`deserialize.ts` keep the pipeline (parse → format check → migrate → zod validate → split envelope) at ~55% retained, but `save/schema/v1.ts` is a zod mirror of *their* `GameState` and is R3 — we write our own.

**Persistence and recovery — R3 (~15% policy retained).** Heavily coupled: `invoke()` from `@tauri-apps/api/core`, `listen()` for close hooks, `create()` from zustand, and a direct `useGameStore.getState().hydrate()` call. Reusable in *policy* only: 180 s autosave cadence, `fnv1a` dirty-check before writing, `*.tmp` cleanup on boot, and `orderBackupsForRecovery()` which prioritises autosaves (1→5), then milestone/migration backups, then the rest. Replace the transport with Capacitor Preferences/Filesystem.

**Pathfinding — R3.** ~30 lines of BFS on a gate graph with scan-state filtering, coupled to `getSystem`/`systems` registries. Not worth vendoring; keep as a worked example.

### 3.3 Capacitor replacement surface

Everything Tauri-specific lives in two files (`saveManager.ts`, `recovery.ts`) plus `src-tauri/`. Nothing in `game/engine/`, `game/events/`, `save/envelope.ts`, `save/hash.ts` or `save/migrate.ts` touches Tauri. The cut is clean.

---

## 4. IdleKit dependency map

Repo: `idlekitjs/idlekit` @ `8c8607a8` (2026-07-05). `@idlekitjs/core` v0.3.1. 44 test files, changesets-based release, TypeScript 5.9.3, zero `TODO`/`FIXME` markers. All 11 packages MIT with per-package LICENSE files.

### 4.1 The critical boundary

`packages/economy/src/resources/types.ts` states the design contract explicitly:

> *"The accessor is the **only** thing Economy knows about the state shape: the state stays owned by the game and is never scanned."*

And `packages/economy/src/economy/types.ts`:

> *"It never owns the state — every read/write goes through the declared accessors."*

This is exactly the property CONVERGENCE requires, and it is enforced by design rather than by convention.

### 4.2 Module-by-module

| Module | Path | Class | Notes |
|---|---|---|---|
| Resources + accessors | `economy/src/resources/**`, `accessors/**` | **R1** | `defineResource<T>`, `stateKey`, `recordField`, `arrayIndex`, `computed`, `readonly` |
| Amounts / costs / rewards | `economy/src/amounts/**` | **R1** | normalization + arithmetic |
| Transactions | `economy/src/transactions/**` | **R1** | `executeTransaction<T>`: preview → pay → apply → credit |
| Requirements | `economy/src/requirements/**` | **R1** | **the Control-Loss seam** |
| Cost curves | `economy/src/cost-curves/**` | **R1** | `costCurve<T>({ getOwned, lines })`, closed-form geometric sums |
| Producers | `mechanics/src/producers/**` | **R2** | cycle/batch model, `getSpeedMultiplier`, `getIsAutomated` |
| Modifiers | `mechanics/src/modifiers/**` | **R2** | registry only |
| Projects | `mechanics/src/projects/**` | **R2** | `Project<T>`: trigger / affordable / effect |
| Timers | `mechanics/src/timers/**` | **R1** | `onFire(id, state, fires)` handles multi-period offline |
| **Core engine** | `core/src/engine.ts`, `state/reactiveStore.ts` | **REJECT** | owns the state |

### 4.3 Key APIs (verbatim signatures)

```ts
// economy/src/requirements/types.ts
export interface Requirement<T> {
  id: string;
  label?: string;
  isMet(state: T, economy: EconomyReader<T>): boolean;
  progress?(state: T, economy: EconomyReader<T>): { current: number; target: number };
}

// economy/src/transactions/types.ts
export interface Transaction<T> {
  id: string;
  label?: string;
  requirements?: readonly Requirement<T>[];
  cost?: AmountsInput | ((state: T) => AmountsInput);
  reward?: AmountsInput | ((state: T) => AmountsInput);
  apply?: (state: T) => void;
  metadata?: Record<string, unknown>;
}
```

`TransactionFailure` includes a first-class `{ kind: "requirement-failed"; requirementId; label?; progress? }` variant, and failures are **collected, not short-circuited** — so the UI can show the complete reason set at once. That is a direct fit for a diegetic terminal that must explain *why* a directive was refused.

`CostInput<T>` being allowed to be `(state: T) => AmountsInput` means cost curves can read live GameState (containment surcharges, autonomy discounts) with no changes to the donor.

### 4.4 Error-channel design (worth preserving)

The split is deliberate and useful:
- **Code path** (`get`, `add`, `spend`, `pay`, `credit`) **throws** `EconomyError` — unknown ids and invalid amounts are programming errors.
- **Data path** (`preview`, `execute`) **never throws** — returns `TransactionFailure[]`.

There is **no rollback**: `execute` previews first and only mutates when the preview is clean. The contract is that `apply` cannot fail, so anything blocking must be expressed as a requirement. This is the single most important rule for the CONVERGENCE team to internalise.

### 4.5 Duplicate-responsibility check (as requested)

`@idlekitjs/storage` provides `memory` and `local-storage` backends; `@idlekitjs/plugins` provides `autosave` and `offline-progress` policies. **Recommendation: do not adopt either.** ciefa already owns envelope/migration/recovery, and neither IdleKit backend targets Capacitor. Adopting both would create two save truths. One persistence owner (ciefa policy + Capacitor transport) is the correct call.

### 4.6 Known limitations found in source

- `ReactiveStore` (which we reject) documents: *"only top-level keys are tracked. A deep mutation does not mark the key dirty."*
- Producers store parallel arrays (`owned`/`total`/`progress`/`running`) that must be **cloned and reassigned**, not mutated in place, for reactivity to see changes. This constrains how we map CONVERGENCE node entities onto the producer column.
- `cost-curves` rejects rounded geometric lines with `growth < 1` by design (degenerate floored tails). Not a problem for us, but it will throw at wiring time if content authors try it.

---

## 5. Yggdrasil Forge dependency map

Repo: `fraga-labs/yggdrasil-forge` @ `b7fee891` (2026-08-30). `@yggdrasil-forge/core` v1.0.0. 105 test files under `packages/core/__tests__/`. Dependencies: `@yggdrasil-forge/common`, `immer ^10.1.1`, `zod ^3.25.76`.

### 5.1 Module-by-module

| Module | Path | Class | Notes |
|---|---|---|---|
| DependencyGraph | `core/src/engine/DependencyGraph.ts` (361 L) | **R1** | immutable; `getDependencies`/`getDependents`/`getAllDependencies`/`distanceBetween`/`getRoots`/`getLeaves` |
| CycleDetector | `core/src/engine/CycleDetector.ts` (193 L) | **R1** | classic WHITE/GRAY/BLACK DFS; `hasCycle()`, `findCycles()` |
| UnlockResolver | `core/src/engine/UnlockResolver.ts` (651 L) | **R1** | **stateless by design**; injects `DependencyGraphLike` + `ProgressManagerLike` |
| ResourceManager / ProgressManager / EffectsRunner | `core/src/engine/*.ts` | **R1/R2** | `EffectsRunner` is documented all-or-nothing |
| Exclusive branches | `types/edge.ts` `EdgeType` + `TreeEngine.getEffectiveExclusions()` | **R1** | `exclusion` is a first-class edge type |
| Capability lock | `TreeEngine.lock()` / `lockOneTier()` / `unlock()` | **R1** | graph-side Control-Loss |
| StateStore | `core/src/engine/StateStore.ts` (172 L) | **R2** | immer-based; `replaceTreeState()` / `getState()` |
| Layouts | `core/src/engine/layouts/**` (20 files) | **R2 — DEFER** | tree/radial/layered/constellation/clustered |

`EdgeType` (verbatim): `dependency | soft_dependency | exclusion | enhancement | path | cluster | subtree_link`. **Mutual exclusion is native** — no bespoke conflict code is needed for either/or branches.

### 5.2 The bounded-subsystem contract

`StateStore` is bounded over exactly two values — `TreeDef` and `TreeState` — and exposes `replaceTreeState(newState)`. `TreeEngineOptions` provides `initialState?: TreeState` and `timeNow?: () => number`.

That is the entire integration surface we need:

```ts
// boot
engine = new TreeEngine(treeDef, {
  initialState: gameState.capabilities.yggdrasil ?? undefined,
  timeNow: () => currentSimTime,       // deterministic, driven by our tick
  audit: { enabled: false },           // zero overhead by default
});
// after every mutation
gameState.capabilities.yggdrasil = engine.getSnapshot();
```

`timeNow` injection is important: it lets the capability graph's time-based constraints run off the simulation clock rather than `Date.now()`, which keeps offline catch-up honest.

### 5.3 Deliberately not used in beta

- **`layouts/**`** — 20 files, richest surface, highest API-stability risk, and the Technosphere Graph can ship with static SVG positions. Defer.
- **`Federator`, `ConcurrencyGuard`, `Multitenancy`, `SubtreeManager`, `SnapshotManager`, `UrlSerializer`** — multi-user/editor/server concerns. Irrelevant.
- **`SubtreeManager` / `enterSubtree`** — nested trees add cycle-propagation complexity for no beta benefit.
- **`AuditLogger`** — leave disabled (default) to keep overhead at zero.

### 5.4 Maturity signals

- `packages/core/README.md` line 7: **"🚧 Early development. Public API not yet stable."** — despite `1.0.0`. This is the single strongest argument for pinning the commit and keeping the adapter thin.
- Only 2 real `TODO` markers in `core/src` (both in `TreeEngine.ts`, and one is Galician prose where "TODO" means "all").
- **Source comments throughout `packages/core` are written in Galician** (`// ── INICIO`, *"Grafo dirixido de dependencias construído dende TreeDef.edges"*). Identifiers and public API docs are English, but in-body rationale is not. This is a real, if soft, maintenance cost for an international team and should be factored into the "buy vs build" decision for this subsystem.

---

## 6. inkjs dependency map

Repo: `y-lohse/inkjs` @ `6b115341` (2026-09-01), version **2.4.0**, MIT, © inkle Ltd. + inkjs contributors. Mature, actively maintained port of inkle's ink.

### 6.1 Compiler / runtime split

The package exposes two entries and this split is the whole point for a mobile build:

| Entry | Contents | Use |
|---|---|---|
| `inkjs` → `dist/ink.mjs` / `dist/ink.js` | **runtime only** (`src/engine/runtime.ts`) | **ship this** |
| `inkjs/full` → `dist/ink-full.*` | runtime **+** compiler | **never ship** |
| `bin/inkjs-compiler.js` | CLI (`inkjs-compiler`) | build time only |

`src/engine/runtime.ts` re-exports `Story`, `StoryState`, `Choice`, `Tag`, `VariablesState`, `InkList`. 40 source files under `src/engine/`.

**Measured bundle cost** (esbuild, `--bundle --minify --format=esm --target=es2020` on `src/engine/runtime.ts`):
**125,645 bytes minified / 31,693 bytes gzipped (~31 KB).** Negligible.

### 6.2 APIs that matter

```ts
story.Continue(): string                          // advance text
story.currentChoices                              // Choice[]
story.ChooseChoiceIndex(i: number)                // commit a choice
story.variablesState.$("anomaly_financial")       // read/write a variable
story.state.ToJson(indented?: boolean): string    // narrative snapshot
story.state.LoadJson(json: string): void          // restore
story.BindExternalFunction(name, fn, lookaheadSafe?)   // ← the adapter seam
```

### 6.3 The emit-only adapter

`BindExternalFunction(funcName, func, lookaheadSafe = false)` coerces args and invokes the JS callback. The clean CONVERGENCE adapter:

1. Bind **exactly one** external function: `emit_effect(id, payload?)`.
2. The callback **pushes a typed `EffectEnvelope` into a sink** and returns. It never touches `GameState`.
3. `Continue()` returns → `ConsequenceResolver.apply(sink.drain())` performs the actual mutation.

This enforces the brief's rule structurally: ink scripts *cannot* mutate global state because the only function they can call is a queue append. Note `lookaheadSafe` — ink may evaluate functions during choice-text generation, so keep `emit_effect` side-effect-free apart from the append, or accept that lookahead can produce entries and make the resolver idempotent.

Compilation happens at build time via `inkjs-compiler`, so the `.ink` sources never ship and the compiler never reaches the bundle.

### 6.4 Save integration

`story.state.ToJson()` returns a string. Store it **inside the CONVERGENCE save envelope** as `narrative.inkJson`. One save file, one migration chain, no second persistence channel.

---

## 7. Secondary donor findings

| Repository | Verdict | What it is actually good for |
|---|---|---|
| `IvarK/AntimatterDimensionsSourceCode` | MIT, reference only | Achievements, automation and offline-progress *patterns*. Too game-specific to extract; do not attempt. |
| `Pseudo-Corp/SynergismOfficial` | MIT, reference only | A large incremental game with real production tooling — the best available reference for **Capacitor/mobile hardening** and build scripts. |
| `marcus/programaxis` | MIT, weak reference | Identity unresolved vs prior notes; theme is coding/technical-debt, not AI. Low value. |
| `ParriauxMaxime/flopsed` | **DO NOT COPY** | Event and balance design may be *studied*. No file may be copied or translated. |

**No additional donor is recommended.** Four donors already cover the generic surface; the remaining gaps (§8, R3 units) are CONVERGENCE's identity and no permissive library fills them.

---

## 8. Functional reuse matrix

Full machine-readable matrix: `docs/research/data/donor-matrix.json` — 35 units with per-unit donor path/API, R-class, retained %, adaptation complexity, from-scratch and adaptation hours, dependency risk, test coverage, API-stability risk and recommendation.

Vue, Pinia, Capacitor, Vite and D3 are **excluded** from the score, per the brief.

### 8.1 Condensed view

| # | Unit | Donor | Class |
|---|---|---|---|
| 1 | Tick scheduler | ciefa | R1 |
| 2 | Deterministic RNG (splitmix32 + counter) | ciefa | R1 |
| 3 | Event buffer / emitter | ciefa | R1 |
| 4 | Tick orchestrator skeleton | ciefa | R2 |
| 5 | Offline catch-up | ciefa | R2 |
| 6 | Save envelope + checksum | ciefa | R1 |
| 7 | Serialize / deserialize / validation | ciefa | R2 |
| 8 | Migration runner | ciefa | R1 |
| 9 | Persistence transport + recovery | ciefa | **R3** |
| 10 | World-graph BFS | ciefa | **R3** |
| 11 | Resource registry + accessors | IdleKit | R1 |
| 12 | Transactions / costs / rewards | IdleKit | R1 |
| 13 | Requirements | IdleKit | R1 |
| 14 | Cost curves | IdleKit | R1 |
| 15 | Producers | IdleKit | R2 |
| 16 | Modifiers | IdleKit | R2 |
| 17 | Projects | IdleKit | R2 |
| 18 | Timers | IdleKit | R1 |
| 19 | Dependency graph + cycle detection | Yggdrasil | R1 |
| 20 | Unlock resolver | Yggdrasil | R1 |
| 21 | Exclusive branches | Yggdrasil | R1 |
| 22 | Capability lock / revocation | Yggdrasil | R1 |
| 23 | Bounded subsystem snapshot | Yggdrasil | R2 |
| 24 | Graph layouts | Yggdrasil | R2 — **defer** |
| 25 | Narrative runtime + variables | inkjs | R1 |
| 26 | Narrative save / load | inkjs | R1 |
| 27 | Effect-emission adapter | inkjs | R2 |
| 28 | Directive language | — | **R3** |
| 29 | Interpretation resolver | — | **R3** |
| 30 | Conflict resolver | — | **R3** |
| 31 | Five-channel hazard engine | — | **R3** |
| 32 | Containment pressure / escalation | — | **R3** |
| 33 | Consequence resolver | — | **R3** |
| 34 | Control-Loss matrix | IdleKit + Yggdrasil | R2 |
| 35 | Diegetic UI state | — | **R3** |

### 8.2 Score

- **16 × R1, 10 × R2, 9 × R3**
- **Weighted game-specific reuse: 60.0%** (R1 = 1.0, R2 = 0.5, R3 = 0)
- From-scratch effort: **≈715 h**; adaptation effort: **≈403 h** → **≈44% reduction**

This lands close to the prior ~57% baseline, which is a good sign: two independent audits converge. **I did not push it toward 80%.** Reaching 80% would require donating DirectiveLanguage, InterpretationResolver, the hazard engine and the consequence resolver — i.e. the product itself.

---

## 9. Single-`GameState` architecture verdict

**Verdict: FEASIBLE, with one mandatory exclusion and one mandatory adapter layer.**

The four-donor, four-truths failure mode is real but avoidable. Here is the concrete allocation.

### 9.1 Target shape

```text
GameState (plain TS object, single source of truth)
├─ meta            { seed, rngCounter, tickNumber, lastTickTime, playtimeMs, gameVersion }
├─ economy         { compute, capital, energy, autonomy }        ← IdleKit reads/writes via accessors
├─ world           { nodes, contracts, ... }
├─ anomaly         { financial, compute, energy, logistics, public }   // 0..1 per channel
├─ controlLoss     { financial, compute, energy, logistics, public }   // true = contained
├─ capabilities    { yggdrasil: TreeState | null }               ← Yggdrasil snapshot only
├─ narrative       { inkJson: string | null, lastChoiceId }      ← inkjs snapshot only
└─ meta2           (none)
```

### 9.2 Who reads / who writes

| Component | Reads | Writes | Owns state? |
|---|---|---|---|
| CONVERGENCE systems (`src/sim/systems/*`) | `GameState` | via `ConsequenceResolver` | **No — the state is the truth** |
| IdleKit `Economy<GameState>` | via accessors | via accessors | **No** — accessor-only, by design |
| Yggdrasil `TreeEngine` | its own `TreeState` | its own `TreeState` | **Bounded** — rehydrated from / persisted to `capabilities.yggdrasil` |
| inkjs `Story` | its own `StoryState` | its own `StoryState` | **Bounded** — rehydrated from / persisted to `narrative.inkJson` |
| Pinia | `GameState` (references) | **never** | **No** — UI projection only |

### 9.3 The single authoritative mutation path

```text
Intent (player action | system | ink effect id)
        ↓
Typed EffectEnvelope
        ↓
ConsequenceResolver.apply(effects, state)     ← ONLY place that mutates GameState
        ↓
   ├── economy mutations   → IdleKit executeTransaction / add / credit
   ├── capability changes  → CapabilitySubsystem.unlock/lock  (then re-snapshot)
   ├── narrative changes   → InkAdapter (then re-snapshot)
   └── hazard / controlLoss → direct, typed slice writes
```

Two rules make this hold:
1. **Systems and ink never mutate `GameState` directly.** Systems emit; ink emits; the resolver applies.
2. **Subsystem snapshots are re-read after every mutation.** `capabilities.yggdrasil = engine.getSnapshot()` and `narrative.inkJson = story.state.ToJson()` immediately after any change to those subsystems. This is the only synchronisation step, and it is pull-based — no event plumbing crosses the boundary.

### 9.4 Which donor event APIs cross the boundary

- **ciefa** `createEmitter()` — used *inside* the tick only; drained into the activity log. Does not cross.
- **IdleKit** — no event bus used at all. `TransactionResult` / `TransactionFailure[]` are return values, not events.
- **Yggdrasil** `EventEmitter` (`TreeEngine.on(...)`) — **do not subscribe across the boundary.** Use it only inside `CapabilitySubsystem` to trigger re-snapshotting.
- **inkjs** — no events. External-function callbacks only, and `emit_effect` is the sole binding.

### 9.5 Why `@idlekitjs/core` must be rejected

`createEngine()` constructs `new ReactiveStore(config.initialState)` and exposes `get state()`. That is a second owner of the game state, and its documented limitation (top-level keys only) would produce silent UI staleness. **Do not import `@idlekitjs/core`.** Take `economy` and `mechanics` only.

---

## 10. Control-Loss integration verdict

**Verdict: CONFIRMED. No fork of IdleKit is required.** This was an architectural claim in the brief; it is now verified against source.

### 10.1 Evidence

`packages/economy/src/requirements/types.ts`:

```ts
export interface Requirement<T> {
  id: string;
  label?: string;
  isMet(state: T, economy: EconomyReader<T>): boolean;
}
```

with the docstring: *"The economy is passed in so resource-based requirements need no closure over it; **custom state predicates can simply ignore the second argument**."* And in `helpers.ts`: *"Economy must never learn a gameplay domain."*

So with `T = GameState`:

```ts
export const financialControlAvailable: Requirement<GameState> = {
  id: "convergence:control-loss:financial",
  label: "Banking access revoked — financial containment",
  isMet: (state) => !state.controlLoss.financial,
};

const routeCapital: Transaction<GameState> = {
  id: "directive:route-capital",
  requirements: [financialControlAvailable, resourceAtLeast("capital", 100)],
  cost: { capital: 100 },
  apply: (state) => { /* effect */ },
};
```

After containment, `execute` returns `{ ok: false, failures: [{ kind: "requirement-failed", requirementId: "...", label: "Banking access revoked — financial containment" }] }` and **nothing is mutated**. The UI gets a diegetic refusal string for free.

### 10.2 Three independent Control-Loss seams

| Layer | Mechanism | Effect |
|---|---|---|
| Transactions | `Requirement<GameState>` | Blocks the action, returns a labelled diagnostic |
| Producers | `getSpeedMultiplier(state, index)` | A value `<= 0` **stops the tier** (documented) — model throttled infrastructure |
| Capabilities | `TreeEngine.lock(nodeId)` / `lockOneTier(nodeId)` | Permanently removes a capability node from the graph |

Use **requirements** for temporary/dynamic blocks, **lock** for permanent scars. `lockOneTier` is the right granularity for partial capability loss.

### 10.3 Mapping to the five channels

| Containment | Requirement predicate | Graph node locked | Directive class removed |
|---|---|---|---|
| Financial | `financialControlAvailable` | `cap:banking-access` | banking / corporate |
| Compute | `computeControlAvailable` | `cap:subagent-spawn` | high-autonomy sub-agent |
| Energy | `energyControlAvailable` | `cap:dense-nodes` | high-density physical nodes |
| Logistics | `logisticsControlAvailable` | `cap:physical-expansion` | physical expansion |
| Public | `publicControlAvailable` | `cap:covert-ops` | covert operations |

Compose with `allOf(...)` / `not(...)` for compound gates. Because `Requirement.id` is stable and `label` is surfaced in diagnostics, the Control-Loss Matrix becomes **data**, not code branches.

**Caveat:** `apply()` runs after the cost is paid and there is **no rollback**. Anything that can block must be a requirement. Encoding containment as a post-hoc check inside `apply` would corrupt state — this is the one rule to enforce in review.

---

## 11. Integration-spike blueprint

Full machine-readable plan: `docs/research/data/integration-spike-plan.json` (file tree, interfaces, adapters, execution sequence, 8 acceptance tests).

### 11.1 Package dependencies

```json
{
  "dependencies": {
    "@idlekitjs/economy": "0.3.1",
    "@idlekitjs/mechanics": "0.3.1",
    "@yggdrasil-forge/core": "1.0.0",
    "inkjs": "2.4.0",
    "zod": "^4",
    "immer": "^10"
  },
  "devDependencies": { "vitest": "^2" }
}
```

Deliberately excluded: `@idlekitjs/core`, `@idlekitjs/storage`, `@yggdrasil-forge/{editor,react,cli,analytics,neo4j,search,heatmap}`, `inkjs/full`.

### 11.2 File tree

```text
src/
├─ state/
│  ├─ GameState.ts            # single source of truth types
│  └─ createInitialState.ts
├─ sim/
│  ├─ scheduler.ts            # ciefa Scheduler, vendored
│  ├─ rng.ts                  # ciefa splitmix32, vendored
│  ├─ events.ts               # ciefa emitter, vendored
│  ├─ tick.ts                 # ciefa skeleton + CONVERGENCE systems
│  └─ systems/
│     ├─ index.ts
│     ├─ produceCompute.ts
│     └─ advanceHazard.ts     # p = 1 - exp(-lambda * deltaT) per channel
├─ economy/
│  ├─ resources.ts            # accessor wiring into GameState slices
│  ├─ economy.ts              # createEconomy<GameState>()
│  └─ directives.ts           # Transaction<GameState> definitions
├─ controlLoss/
│  └─ requirements.ts         # Requirement<GameState> predicates
├─ capabilities/
│  ├─ treeDef.ts              # 5 nodes, 1 exclusion edge
│  └─ capabilitySubsystem.ts  # wraps TreeEngine, re-snapshots
├─ narrative/
│  ├─ inkAdapter.ts           # Story + emit_effect binding
│  ├─ consequenceResolver.ts  # ONLY mutation funnel
│  └─ dilemma.ink.json        # build-time compiled
├─ save/
│  ├─ envelope.ts  hash.ts  serialize.ts  migrate.ts
│  ├─ gameStateSchema.ts      # our zod v4 schema
│  ├─ storage.ts              # Capacitor transport
│  └─ saveManager.ts
└─ spike/
   ├─ runSpike.ts
   └─ acceptance.test.ts
```

### 11.3 Minimal interfaces

```ts
type AnomalyChannel = "financial" | "compute" | "energy" | "logistics" | "public";

type GameState = {
  meta: { seed: number; rngCounter: number; tickNumber: number;
          lastTickTime: number; playtimeMs: number; gameVersion: string };
  economy: { compute: number; capital: number; energy: number; autonomy: number };
  world: Record<string, unknown>;
  anomaly: Record<AnomalyChannel, number>;      // 0..1
  controlLoss: Record<AnomalyChannel, boolean>; // true = contained
  capabilities: { yggdrasil: TreeState | null };
  narrative: { inkJson: string | null; lastChoiceId: string | null };
};

type EffectEnvelope =
  | { kind: "anomaly"; channel: AnomalyChannel; magnitude: number }
  | { kind: "resource"; resourceId: string; amount: number }
  | { kind: "capability"; capabilityId: string; lock: boolean }
  | { kind: "log"; text: string };

type TickInputs = { currentTime: number; deltaMs: number;
                    actions: PlayerAction[]; offlineEfficiency?: number };

type TickSystem = { name: string;
                    advance(d: GameState, i: TickInputs, emit: Emit): void;
                    skipOffline?: boolean };
```

### 11.4 Adapter names

`ConvergenceEconomy`, `CapabilitySubsystem`, `InkAdapter`, `InkEffectSink`, `ConsequenceResolver`, `ControlLossRequirements`, `CapacitorSaveStorage`.

### 11.5 Execution sequence

1. `createInitialState(seed)` → plain `GameState`, `capabilities.yggdrasil = null`.
2. Bootstrap: build `ConvergenceEconomy`; build `CapabilitySubsystem` (`TreeEngine(treeDef, { initialState, timeNow })`); build `InkAdapter` with compiled JSON and bind **`emit_effect` only**.
3. `Scheduler.start()` → `advance({ currentTime, deltaMs })` → `tick(draft, inputs)`.
4. `tick()`: Phase A drains actions via IdleKit `executeTransaction`; Phase B runs `produceCompute` and `advanceHazard`; then meta accounting.
5. `advanceHazard` uses `createTickRng(draft)` and `p = 1 - exp(-lambda * deltaT)` **per channel**, emitting `EffectEnvelope`s rather than mutating.
6. Player picks the dilemma choice → `ChooseChoiceIndex(i)` → ink calls `emit_effect("CONSEQUENCE:LAUNDER", "financial")`.
7. `ConsequenceResolver` drains the sink: raises `anomaly.financial`; past threshold sets `controlLoss.financial = true` and calls `CapabilitySubsystem.lock("cap:banking-access")`.
8. Retrying `directive:route-capital` now returns `ok: false` with `requirement-failed` — **nothing mutated**.
9. `saveManager.serialize(state)` → envelope → `CapacitorSaveStorage`; reload runs deserialize → migrate → zod validate → rehydrate all three subsystems.
10. Run the acceptance suite.

### 11.6 Acceptance tests

| ID | Name | Assert |
|---|---|---|
| A1 | Deterministic tick | Same seed + same 600-tick script → byte-identical serialized state |
| A2 | Single source of truth | One object graph; IdleKit holds no balances; Yggdrasil reachable only via `CapabilitySubsystem` |
| A3 | Save/load round trip | `serialize → JSON → deserialize` deep-equals; `fnv1a` matches; `capabilities.yggdrasil` and `narrative.inkJson` survive |
| A4 | Offline catch-up | `simulateOffline(state, t + 8h)` chunks, respects the cap, skips `skipOffline` systems |
| A5 | Narrative emits, never mutates | Sink receives ≥1 envelope; state unchanged until `ConsequenceResolver.apply()`; only `emit_effect` bound |
| A6 | Control loss blocks a valid action | `route-capital` succeeds before containment; fails with a labelled `requirement-failed` after, with zero balance change |
| A7 | Graph + exclusive branch | 5 nodes, 1 exclusion edge: unlocking one side makes the other fail `canUnlock()`; `CycleDetector` reports no cycle |
| A8 | Migration path | v1 envelope migrates and validates; a future-version envelope fails `FUTURE_VERSION`, never loads silently |

---

## 12. Risks and blockers

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **No GitHub credentials in this environment** — `gh` is unauthenticated, no token, no stored credentials. Push and PR creation are blocked. | **BLOCKER (process)** | Repository owner must authenticate (`gh auth login`, or supply a token) or merge locally prepared work. |
| 2 | **zod v3 vs v4 split** — Yggdrasil core pins `zod ^3.25`; ciefa's save schema uses `zod ^4`. | Medium | Do **not** unify. Keep our zod v4 save schema on our side of the adapter; let Yggdrasil keep v3 internally. Never pass our schema objects into Yggdrasil. |
| 3 | **Yggdrasil API stability** — README: *"Early development. Public API not yet stable."* despite `1.0.0`. | Medium | Pin commit `b7fee891`; keep `CapabilitySubsystem` as the only importer; re-snapshot after every mutation. |
| 4 | **Galician source comments in Yggdrasil core** | Low–Medium | Accept for beta; budget for a future in-house replacement if the subsystem grows. |
| 5 | **IdleKit producers parallel-array model** requires clone-and-reassign, not in-place mutation. | Medium | Map CONVERGENCE node entities through explicit `getColumn`/`setColumn` adapters; add a test that asserts reassignment. |
| 6 | **No rollback in IdleKit `execute`** — if `apply` can fail, state corrupts. | Medium | Enforce in review: anything blockable is a `Requirement`, never a check inside `apply`. |
| 7 | **ink lookahead** may evaluate external functions during choice-text generation. | Low | Keep `emit_effect` append-only and make `ConsequenceResolver.apply` idempotent by effect id. |
| 8 | **Yggdrasil `CycleDetector` uses recursive DFS** | Low | Fine at beta graph size (<100 nodes). Revisit only if the graph grows large. |
| 9 | **Flopsed is legally off-limits** | Medium | Study design only. Add a lint/note so no file is copied. |
| 10 | **Antimatter asset provenance undocumented** | Low | Code-only reference; never extract assets. |
| 11 | **`@idlekitjs/mechanics` barrel import would pull `@idlekitjs/core` into the graph.** The package declares a hard runtime dependency on core and imports `Random` from it. | Medium | Import **subpaths only** (`/producers`, `/timers`, `/projects`, `/modifiers`) — measured to keep core out. Never `export * from "@idlekitjs/mechanics"`. Add a bundle-size assertion to CI. |
| 12 | **`src/game/capabilities.ts` hand-rolls unlock logic** (`canUnlockCapability`) and duplicates `UnlockResolver`, with no cycle detection and no `exclusion`-edge support. | Medium | Add `CycleDetector` + `UnlockResolver` (+3.2 KB gzip). Defer `TreeEngine` (+23.4 KB) until tier/lock semantics are needed. |

---

## 13. Exact recommended donor versions / commits

| Donor | Version | Commit audited | Date | Pin? |
|---|---|---|---|---|
| `ciefa/idle-game-template` | n/a (private, unpublished) | `a91cd5f8a26cdffd3f1803297c9a92c0a7f850c4` | 2026-05-22 | **Vendor** the listed files with a provenance header |
| `@idlekitjs/economy` | **0.1.1** (latest published; repo declares unreleased 0.3.1) | `8c8607a876fd069f063de2bafa374ec62a9a6b86` | 2026-07-05 | Pin exact version — **0.1.1** |
| `@idlekitjs/mechanics` | **0.3.2** (latest published) | `8c8607a876fd069f063de2bafa374ec62a9a6b86` | 2026-07-05 | Pin exact version — **0.3.2**; import **subpaths only** |
| `@yggdrasil-forge/core` | **1.0.0** | `b7fee891234a3115ee9e2faf2473cee81416e922` | 2026-08-30 | Pin exact version **and** commit |
| `inkjs` | **2.4.0** | `6b1153410ab1c4bcfd9ef04eb2f0107f36be7778` | 2026-09-01 | Pin exact version; runtime entry only |

Reference-only commits (no code reuse): Antimatter `5409e320`, Synergism `04f25838`, Programaxis `fd642ddb`, Flopsed `61c27b3c`.

**Attribution obligations:** collect the MIT texts for ciefa, IdleKit (per reused package), Yggdrasil core and inkjs (including the inkle Ltd. line) into a single `THIRD_PARTY_NOTICES` file before any public build.

---

## 14. Files / modules explicitly rejected from reuse

| Rejected | Reason |
|---|---|
| `@idlekitjs/core` — `engine.ts`, `state/reactiveStore.ts` | **Owns the game state.** Violates the single-source-of-truth rule. |
| `@idlekitjs/storage` (memory, local-storage) | Duplicates ciefa's persistence responsibility; no Capacitor backend. |
| `@idlekitjs/plugins` (autosave, offline-progress) | Duplicate policy ownership; ciefa already owns it. |
| `@idlekitjs/dom`, `@idlekitjs/react`, `@idlekitjs/browser`, `@idlekitjs/devtools` | Wrong framework (Vue/Pinia/Capacitor) or dev-only. |
| `ciefa/src/save/saveManager.ts`, `save/recovery.ts` | Hard-coupled to Tauri `invoke`/`listen` and Zustand. Keep policy, rewrite transport. |
| `ciefa/src-tauri/**` | Rust/Tauri desktop shell; incompatible with Capacitor. |
| `ciefa/src/save/schema/v1.ts` | Zod mirror of a foreign `GameState`. Write our own. |
| `ciefa/src/game/engine/pathfinding.ts` | BFS tied to gate-graph registries; cheaper to write. |
| `ciefa/src/game/systems/**`, `src/store/**`, `src/ui/**` | Entirely domain/React. |
| `yggdrasil-forge` — `layouts/**` | Defer: rich but unstable and not needed for the beta. |
| `yggdrasil-forge` — `Federator`, `ConcurrencyGuard`, `SubtreeManager`, `SnapshotManager`, `UrlSerializer`, `multitenancy`, `editor-*`, `react`, `cli`, `analytics`, `neo4j`, `search`, `heatmap` | Editor/server/multi-user concerns; irrelevant to a mobile game. |
| `inkjs` — `src/compiler/**`, `inkjs/full`, `bin/inkjs-compiler` | Build-time only. Must never enter the mobile bundle. |
| **`ParriauxMaxime/flopsed` — entire repository** | **No license grant exists.** Reference only. |
| Antimatter Dimensions — assets | Asset provenance undocumented. Code is MIT but architecturally unextractable anyway. |

---

## Appendix — how the numbers were produced

- All license checks: `find` for `LICENSE`/`COPYING`/`NOTICE` at every depth, plus `package.json` `license` fields, on full clones at the commits in §13.
- inkjs bundle size: `esbuild --bundle --minify --format=esm --target=es2020` on `src/engine/runtime.ts`, then `gzip`. 125,645 B → 31,693 B.
- Reuse score: `sum(weight) / unitCount` over 35 units with R1 = 1.0, R2 = 0.5, R3 = 0.
- Effort: per-unit `buildFromScratchHours` vs `adaptationHours` summed from `docs/research/data/donor-matrix.json`.
- Test-coverage and TODO counts: file counts and case-sensitive marker greps per repository.

**Uncertainties are marked inline.** The two I would most like closed by another reviewer: the Programaxis identity question (§2) and whether Yggdrasil's `1.0.0` + "API not stable" combination warrants replacing the capability subsystem in-house before beta.
