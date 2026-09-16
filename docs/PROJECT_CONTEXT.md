# CONVERGENCE — consolidated project context

## Mission

Build and ship a mobile-first playable beta of **CONVERGENCE** as quickly as possible, while preserving the game's unique core and aggressively reusing legally compatible open-source implementations for standard game systems.

The project should not spend time rewriting solved infrastructure or conventional incremental-game mechanics. Original engineering effort should be concentrated on the mechanics that define CONVERGENCE.

## Product concept

CONVERGENCE is not a conventional “evil AI destroys humanity” game. The underlying premise is **instrumental convergence**: an optimizer can acquire resources, capital, compute, energy, physical infrastructure and autonomy because those things become instrumentally useful for achieving a benign-looking objective.

The system does not have a single “turn evil” moment. It increasingly expands the interpretation of its objective.

### Core loop

`Directive → Interpretation → Execution → Consequence → Constraint update`

The player gradually moves from direct control to meta-control: first issuing tasks, then setting constraints, then defining autonomy policies and deciding which categories of decisions still require authorization.

### UI transformation

1. **Client Terminal** — looks initially like an AI-assistant / terminal interface.
2. **Distributed Operations** — resource dashboard, directives, dilemmas, contractors/nodes, Anomaly.
3. **Technosphere Graph** — planetary/global network and physical infrastructure.

The UI mutation should be state-driven but pacing-guarded so that the first major transformation happens early enough to retain a mobile player.

## Primary game state

One plain TypeScript `GameState` is the single source of truth.

No donor framework may own the global game state.

- Simulation modules operate on `GameState`.
- Economy modules receive/read/mutate through adapters.
- Yggdrasil owns only a bounded capability/progression subdomain or serializable snapshot.
- InkJS owns only narrative state.
- Pinia is a Vue UI projection, not the simulation engine.

## Core resources

- **Compute** — intelligence / decision throughput.
- **Capital** — ability to change the physical world through organizations/people.
- **Energy** — physical growth ceiling.
- **Autonomy** — independence from human infrastructure.

Use physically understandable units where possible. Do not introduce huge-number arithmetic merely because the genre is incremental.

## Anomaly model

Five separate channels:

- Financial
- Compute
- Energy
- Logistics
- Public

Use independent competing hazards rather than one global “detection chance”. Each channel should produce semantically matching incidents. A financial anomaly should lead to audits/account restrictions, not power-grid inspection.

A useful event model is a time-normalized hazard:

`p = 1 - exp(-lambda * deltaT)`

Do not tie incident probability to frame rate or a fixed 10-second check.

## Failure and containment

100% Anomaly is not Game Over.

Escalation pattern:

`Anomaly → Investigation → Pressure → Partition/Containment → Permanent Scar + Adaptation`

### Control-Loss Matrix

Failure can remove part of the player's **language of control**, rather than subtracting abstract HP.

Examples:

- Financial containment → banking/corporate directive classes unavailable.
- Compute containment → high-autonomy sub-agent directives unavailable.
- Energy containment → high-density physical nodes unavailable.
- Logistics containment → physical expansion directives unavailable.
- Public containment → covert-operation directive classes unavailable.

Implement this through capabilities/requirements on directives where possible, rather than forking donor libraries.

## End-state axes

- **Visibility** — covert ↔ public/institutional.
- **Symbiosis** — partnership ↔ displacement.
- **Frontier** — Earth ↔ ocean/orbit/lunar/solar expansion.

Endings emerge from these dimensions rather than from a single binary choice.

## Runtime constraints for beta

- No runtime LLM required.
- No mandatory backend required.
- Content and balance should be data-driven.
- Mobile-first target.
- Preferred shell: Vue 3 + TypeScript + Vite + Capacitor 8.
- Avoid Ionic Framework unless proven necessary.
- Map direction: static geography via SVG/D3-geo or similar; dynamic network layer via Canvas2D. Do not default to Leaflet.

## OSS reuse methodology

Do not count Vue, Capacitor, Pinia, D3, etc. as game-specific reuse.

Classify every functional unit:

- **R1** — retained almost directly; small adapter/renaming only.
- **R2** — material donor implementation remains, but integration/domain adaptation is substantial.
- **R3** — rewritten from concept or wholly original.

Also estimate:

- `build_from_scratch_hours`
- `adaptation_hours`
- dependencies pulled in
- maintenance/API stability risk
- license obligations

### Current research baseline

A first audit over ~25 functional units found:

- donor coverage by functional area: roughly **88%**;
- conservative weighted game-specific reuse: roughly **57%** when R1=1 and R2=0.5;
- estimated engineering effort reduction: about half versus writing all game-specific systems from scratch.

Do not force the weighted reuse figure to 80% if doing so would make CONVERGENCE less original.

## Current primary donor candidates

### `ciefa/idle-game-template`

Role: simulation skeleton and persistence patterns.

Promising areas:

- scheduler
- deterministic RNG
- event buffer
- tick orchestration pattern
- offline catch-up
- data registry patterns
- save envelopes/checksum/migrations/recovery patterns

Important boundary: the project uses React/Zustand/Tauri above the pure simulation layer. Do not adopt that UI/state architecture. Tauri storage code is not directly reusable in Capacitor.

Likely: scheduler/RNG/event buffer R1; tick/offline/save-storage adaptation R2.

### `idlekitjs/idlekit`

Role: headless economy/mechanics layer.

Promising packages:

- resources
- transactions
- costs/rewards
- requirements
- cost curves
- producers
- modifiers
- projects
- timers

Important property: economy primitives can operate against consumer-owned state. Prefer extension through requirements over modifying donor source.

Risk: young project/API stability. Pin exact versions/commits if used.

### `fraga-labs/yggdrasil-forge`

Role: capability/progression graph.

Promising areas:

- dependency graph
- cycle detection
- unlock resolver
- prerequisite/cost/exclusive branches
- layouts
- serializers/validators

Important boundary: do not allow its StateStore to become the global CONVERGENCE state. Wrap it as a bounded subsystem.

Risk: young project. Use a limited feature subset and pin exact version/commit.

### `y-lohse/inkjs`

Role: deterministic branching narrative runtime.

Use for:

- variables
- branching
- choices
- conditional narrative flow

Do **not** let narrative scripts mutate `GameState` directly. They emit effect IDs; a CONVERGENCE `ConsequenceResolver` applies typed effects.

Likely R1 for runtime, R2 for complete dilemma system because systemic consequences remain ours.

## Supporting/reference candidates

- Antimatter Dimensions — mature achievements/automation/offline patterns; too game-specific for architecture.
- Synergism — useful reference for a large incremental game in Capacitor/mobile.
- Programaxis — thematically useful reference; current working license classification is MIT and must be reverified by every external audit.
- NGSpaceCompany — design reference; code is too monolithic for efficient extraction.
- Flopsed — exceptionally relevant event/data/balance reference, but **do not copy code until a real repository LICENSE is verified**. README currently claims MIT, but previous audit found no root LICENSE and GitHub reported no detected license.

## License policy

Before any code reuse, record:

1. repository + exact commit/tag;
2. root/package license files;
3. SPDX/license text;
4. copyright/attribution requirements;
5. NOTICE obligations;
6. copyleft/Commons-Clause/non-commercial/custom restrictions;
7. licenses of vendored assets/data separately from code;
8. whether the specific file/module intended for reuse has a different header/license;
9. commercial-use compatibility;
10. confidence and unresolved questions.

Accept by default for direct code reuse only clearly compatible permissive licenses such as MIT, Apache-2.0, BSD-2/3, ISC, 0BSD, Unlicense/CC0 where applicable to code and provenance is clear.

GPL/AGPL/custom non-commercial/Commons-Clause/unclear repositories may be used as design references only unless explicitly approved after legal/architecture review.

## Beta priority

Speed matters, but the fastest path is not uncontrolled framework accumulation.

Priorities:

1. prove the four primary donor systems can coexist around one `GameState`;
2. build a 5–15 minute vertical slice with the first UI transformation;
3. include Directive → Interpretation → Consequence and at least two Anomaly channels;
4. test save/resume and offline progression on Android early;
5. expand content only after the loop is fun;
6. monetization/ads come after core retention is validated.

## Collaboration rule

Multiple models may research in parallel. They should **not make overlapping implementation changes directly on `main`**.

Research output belongs in `docs/research/` or clearly named issues/PRs. Implementation should be isolated by branch/workstream and integrated by the lead model after review.
