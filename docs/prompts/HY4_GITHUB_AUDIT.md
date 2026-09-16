# Prompt for Hy4 — deep GitHub donor audit for CONVERGENCE

You are the **GitHub code-audit lead** for the project **CONVERGENCE**.

Repository: `https://github.com/timoshinoleg-eng/CONVERGENCE`

You have GitHub access. Work from repository evidence, not generic summaries.

## Primary objective

Perform a **deep implementation-level audit** of the main donor candidates and produce a concrete dependency/reuse map that the lead model can immediately use to build an integration spike.

Do **not** redesign the game. Do **not** write production code unless explicitly requested in a later task. This task is research + technical decomposition.

First read the project context in:

`docs/PROJECT_CONTEXT.md`

Treat it as the authoritative current design/architecture baseline.

## Current intended architecture

One plain TypeScript `GameState` is the single source of truth.

- ciefa contributes simulation/persistence pieces.
- IdleKit contributes economy/mechanics.
- Yggdrasil contributes a bounded progression/capability graph.
- InkJS contributes a bounded narrative state/runtime.
- Pinia is UI projection only.
- Capacitor 8 is the mobile shell.

No donor gets ownership of the global game state.

Core loop:

`Directive → Interpretation → Execution → Consequence → Constraint update`

Unique CONVERGENCE systems expected to remain mostly custom:

- DirectiveLanguage
- InterpretationResolver
- ConflictResolver
- five-channel HazardEngine
- ContainmentPressure
- ControlLossMatrix
- ConsequenceResolver
- DiegeticUIState

## Repositories to audit deeply

Mandatory:

1. `ciefa/idle-game-template`
2. `idlekitjs/idlekit`
3. `fraga-labs/yggdrasil-forge`
4. `y-lohse/inkjs`

Secondary verification/reference:

5. `IvarK/AntimatterDimensionsSourceCode`
6. `Pseudo-Corp/SynergismOfficial`
7. `ParriauxMaxime/flopsed`
8. Programaxis repository previously identified in project research — resolve the exact canonical repository before auditing it.

You may add additional GitHub projects only if they clearly fill a missing subsystem better than the current donors.

## Critical task 1 — exact license audit

For every repository/module that might contribute copied or adapted code:

- inspect root LICENSE;
- inspect package-level LICENSE files in monorepos;
- inspect package.json license fields;
- inspect file headers where relevant;
- identify different licensing for assets/data versus code;
- record exact commit SHA or tag audited;
- record the license obligations that must be preserved in CONVERGENCE;
- classify commercial mobile reuse as `CLEAR`, `CONDITIONAL`, or `DO NOT COPY`.

Do not assume that README badges are sufficient.

Special checks:

- `ParriauxMaxime/flopsed`: prior audit found README claiming MIT but no root LICENSE and GitHub API returning no detected license. Confirm current state. Unless a real license grant is located, classify code as **reference-only**.
- Programaxis: independently verify current canonical license. Prior model notes conflict (MIT vs Apache-2.0). Resolve from repository evidence, not memory.
- Antimatter Dimensions: resolve any MIT/CC0 ambiguity by distinguishing code, assets, wiki statements and actual repository licensing.

## Critical task 2 — dependency graph to exact files/APIs

For each of the four primary donors, identify the exact reusable units and everything they import.

### ciefa

Audit at minimum:

- scheduler
- RNG
- event bus/buffer
- tick orchestration
- offline catch-up
- pathfinding/world graph helpers
- save envelope
- serializer/deserializer
- hash/checksum
- schema validation
- migrations
- backup/recovery

For each module answer:

- exact path;
- direct imports;
- transitive donor-domain dependencies;
- whether React/Zustand/Tauri/DOM leaks into it;
- whether it can be vendored almost unchanged;
- what must be replaced for Capacitor;
- R1/R2/R3 classification.

Be especially strict with `offline` and `tick`: earlier audit found game-specific domain dependencies, so verify exactly how much survives extraction.

### IdleKit

Audit at minimum:

- core engine/state boundary
- economy/resources
- costs/rewards
- transactions
- requirements
- cost curves
- producers
- modifiers
- projects
- timers
- persistence/offline plugins only to determine whether we should avoid duplicate responsibility with ciefa

Important question: can these APIs operate on CONVERGENCE-owned state without allowing IdleKit to become the source of truth?

Find exact generic type signatures and extension hooks that make this possible.

### Yggdrasil Forge

Audit at minimum:

- DependencyGraph
- CycleDetector
- UnlockResolver
- ResourceManager
- ProgressManager
- EffectsRunner
- StateStore
- serializers/migrations
- layouts
- validation/schema

We want a **bounded progression subsystem**, not another global state manager.

Determine the minimum extract/use subset required for:

- capabilities/nodes;
- dependencies;
- costs/prerequisites;
- mutually exclusive branches;
- unlock;
- graph layout.

Identify features we should deliberately *not* use in beta because of immature/complex behavior.

Check for known TODOs, documented bugs or architectural limitations in comments/tests/issues.

### InkJS

Audit at minimum:

- Story runtime
- variables state
- choices
- save/load narrative state
- external function binding
- compiler/runtime split
- browser bundle size/dependencies

Determine the cleanest adapter where Ink emits a symbolic effect ID and **never mutates global GameState directly**.

## Critical task 3 — 25-unit functional reuse matrix

Read the current functional model from project docs and produce/confirm a matrix of ~20–30 game-specific functional units.

For each unit include:

- subsystem;
- exact donor repo;
- exact donor path/API;
- R1/R2/R3;
- approximate retained donor implementation percentage;
- adaptation complexity `LOW/MEDIUM/HIGH`;
- from-scratch complexity;
- dependency risk;
- test coverage quality;
- API stability risk;
- recommendation.

Do **not** count Vue/Pinia/Capacitor/D3/etc. as game-specific reuse.

Use these classes:

- `R1`: donor implementation largely retained.
- `R2`: meaningful donor implementation retained but requires integration/domain adaptation.
- `R3`: concept/reference only or effectively rewritten.

Do not manipulate the scoring to reach 80%.

## Critical task 4 — one-state architecture feasibility

Determine whether the four donors can coexist around a single plain TypeScript `GameState` without synchronization hell.

Propose concrete adapter boundaries only where supported by actual APIs.

Target shape conceptually:

```text
GameState
  ├─ economy
  ├─ world
  ├─ anomaly
  ├─ controlLoss
  ├─ capabilities / yggdrasilSnapshot
  ├─ narrative / inkSnapshot
  └─ meta
```

Answer:

- Who reads state?
- Who writes state?
- Which subdomain snapshots are serialized?
- Which donor event APIs cross boundaries?
- What is the single authoritative mutation path?
- How do we avoid ciefa state + IdleKit state + Yggdrasil StateStore + Pinia becoming four competing truths?

## Critical task 5 — Control-Loss integration

Test the architectural claim that Control-Loss can be implemented **without forking IdleKit** by using requirements/capabilities.

For example, a banking transaction should be blocked because a directive/action has a requirement such as:

`financialControlAvailable(state) === true`

rather than adding `blocked_by_containment` into IdleKit source.

Verify whether actual IdleKit APIs support this pattern cleanly.

Also map Control-Loss effects onto Yggdrasil capabilities where appropriate.

## Critical task 6 — integration-spike blueprint

Produce a tiny implementation blueprint, but do not implement it in this task.

The spike must prove these four systems coexist:

1. ciefa-style deterministic tick/scheduler;
2. one IdleKit transaction/requirement/producers path;
3. a Yggdrasil graph of 3–5 capability nodes with one exclusive branch;
4. one InkJS dilemma that emits a typed effect ID;
5. one shared `GameState`;
6. save/load round trip;
7. a Control-Loss flag blocking one previously valid action.

Specify:

- file tree;
- package dependencies;
- minimal TypeScript interfaces;
- adapter names;
- execution sequence;
- acceptance tests.

The lead model should be able to implement the spike directly from this blueprint.

## Required repository output

Create a branch:

`research/hy4-donor-audit`

Do not modify `main` directly.

Add:

`docs/research/HY4_DONOR_AUDIT.md`

Optionally add small machine-readable supporting files under:

`docs/research/data/`

Examples:

- `donor-matrix.json`
- `license-ledger.json`
- `integration-spike-plan.json`

Open a pull request to `main` titled approximately:

`research: deep donor and license audit`

Do not merge it.

## Required report structure

1. Executive summary
2. License ledger
3. ciefa dependency map
4. IdleKit dependency map
5. Yggdrasil dependency map
6. InkJS dependency map
7. Secondary donor findings
8. Functional reuse matrix
9. Single-GameState architecture verdict
10. Control-Loss integration verdict
11. Integration-spike blueprint
12. Risks/blockers
13. Exact recommended donor versions/commits
14. Files/modules explicitly rejected from reuse

## Quality bar

- Cite exact GitHub files/paths and commits.
- Prefer code evidence over README claims.
- Mark uncertainties explicitly.
- Do not write generic prose where a concrete API/path can be given.
- Do not make implementation changes outside the research branch.
- Do not duplicate Perplexity's broad web search; your comparative advantage is deep GitHub source inspection.

The output must be useful to a lead engineer who wants to start coding immediately after review.