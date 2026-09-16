# CONVERGENCE

Narrative strategy / incremental simulation about instrumental convergence, autonomous systems, and the gradual transformation of an AI assistant into a planetary-scale technosphere.

## Current goal

Ship a playable mobile-first beta quickly while reusing permissively licensed open-source game systems wherever this does not weaken the unique mechanics of CONVERGENCE.

## Core loop

`Directive → Interpretation → Execution → Consequence → Constraint update`

## Core design pillars

- Evolving diegetic UI: Client Terminal → Distributed Operations → Technosphere Graph.
- Resources: Compute, Capital, Energy, Autonomy.
- Five-channel anomaly model: Financial, Compute, Energy, Logistics, Public.
- Containment is not Game Over: failures create Permanent Scars and can remove classes of directives via a Control-Loss Matrix.
- End state is determined by Visibility × Symbiosis × Frontier rather than a single fixed ending.
- No runtime LLM is required for the beta; narrative logic can be deterministic/data-driven.
- Mobile target: Vue 3 + TypeScript + Vite + Capacitor 8; one plain TypeScript `GameState` is the source of truth, while UI state management is only a projection.

## OSS strategy

Current primary donor candidates:

- `ciefa/idle-game-template` — simulation kernel, deterministic scheduling/RNG, save/migration patterns.
- `idlekitjs/idlekit` — economy primitives, requirements, transactions, modifiers, producers/projects/timers.
- `fraga-labs/yggdrasil-forge` — progression/capability graph and unlock logic.
- `y-lohse/inkjs` — branching narrative runtime.

Supporting/reference candidates include Antimatter Dimensions, Synergism, Programaxis, NGSpaceCompany, and Flopsed. Every code donor must pass an explicit license and dependency audit before reuse.

## Working rule for reuse

Do **not** inflate reuse by counting Vue, Capacitor, or other infrastructure libraries as game-specific implementation. Track:

- `R1` — retained almost directly.
- `R2` — materially adapted donor implementation.
- `R3` — reimplemented or original CONVERGENCE code.

The current research baseline is roughly 88% donor coverage by functional area, but only about 57% conservative weighted game-specific reuse. The project should preserve originality rather than force an artificial 80% code-reuse metric.

Detailed research, prompts, architecture decisions, and integration work will be consolidated under `docs/`.
