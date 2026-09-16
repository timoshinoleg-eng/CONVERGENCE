# Lead model autonomous task — CONVERGENCE

Role: **lead architect / integrator / final decision-maker**.

Repository: `https://github.com/timoshinoleg-eng/CONVERGENCE`

The owner will review progress later. Work autonomously and avoid questions unless blocked by a destructive/irreversible action or a secret/credential that cannot be obtained safely.

## Primary goal

Move CONVERGENCE from research into a technically validated beta path as quickly as possible, while keeping the architecture compatible with parallel donor research from Perplexity and Hy4.

Do not wait for their reports before doing work that is already safe and valuable.

## Authoritative context

Read and maintain:

- `README.md`
- `docs/PROJECT_CONTEXT.md`
- research reports and PRs as they arrive

Core loop:

`Directive → Interpretation → Execution → Consequence → Constraint update`

One plain TypeScript `GameState` is the source of truth.

Unique systems that must remain CONVERGENCE-owned:

- DirectiveLanguage
- InterpretationResolver
- ConflictResolver
- HazardEngine
- ContainmentPressure
- ControlLossMatrix
- ConsequenceResolver
- DiegeticUIState

Primary donors under evaluation:

- ciefa/idle-game-template
- idlekitjs/idlekit
- fraga-labs/yggdrasil-forge
- y-lohse/inkjs

## Workstream A — repository foundation

Create a clean project structure for a mobile-first TypeScript game, minimizing irreversible framework choices.

Preferred shell:

- Vue 3
- TypeScript
- Vite
- Pinia only for UI projection
- Capacitor 8-compatible structure

Set up:

- package manager lockfile;
- strict TypeScript;
- lint/format if lightweight;
- Vitest or equivalent unit-test setup;
- CI for install/typecheck/test/build;
- architecture folders that keep simulation independent from Vue/Capacitor.

Target structure conceptually:

```text
src/
  game/
    state/
    simulation/
    economy/
    progression/
    narrative/
    anomaly/
    directives/
    consequences/
    persistence/
    adapters/
  ui/
  app/
docs/
```

Do not make Pinia the canonical game state.

## Workstream B — integration spike

Build the smallest possible executable proof that the selected architecture works.

Acceptance scenario:

1. Initialize one serializable `GameState`.
2. Run a deterministic tick/scheduler path inspired by or adapted from the verified ciefa donor.
3. Execute one economy transaction with a composable requirement using verified IdleKit APIs if license/dependency verification is sufficient.
4. Load a tiny capability graph with 3–5 nodes and one mutually exclusive branch using Yggdrasil if safe to integrate.
5. Run one InkJS choice/dilemma.
6. Ink emits a symbolic effect ID; it does not mutate global state.
7. `ConsequenceResolver` applies the effect to `GameState`.
8. Toggle one `ControlLoss` flag.
9. Demonstrate that a previously valid directive/transaction is now rejected by requirements.
10. Save state, reload it, and verify deterministic round trip.

If a donor cannot safely be installed because license/API verification remains incomplete, use a narrow local interface/stub and record the blocker rather than coupling the project prematurely.

## Workstream C — define the canonical GameState

Create a deliberately small beta-oriented state schema, for example:

```text
GameState
  meta
  resources
    compute
    capital
    energy
    autonomy
  anomaly
    financial
    compute
    energy
    logistics
    public
  controlLoss
  directives
  capabilities
  narrative
  world
  scars
  uiPhase
```

Requirements:

- JSON-serializable;
- deterministic simulation-friendly;
- schema-versioned;
- no Vue refs/proxies/classes inside persisted state;
- no direct donor-specific objects unless isolated in a versioned snapshot field.

## Workstream D — unique-system interfaces before implementation

Define stable TypeScript contracts for:

### Directive

Must support at least:

- ID/type;
- prerequisites/capabilities;
- required control domains;
- costs;
- interpretation options;
- anomaly impacts;
- effect ID or execution handler reference.

### Consequence

Typed effects such as:

- resource delta/multiplier;
- anomaly delta;
- capability unlock/lock;
- control-loss enable/disable;
- permanent scar;
- UI-phase transition;
- narrative variable update.

### Hazard channel

Represent independent time-normalized hazards for:

- Financial
- Compute
- Energy
- Logistics
- Public

Keep RNG injectable/deterministic.

Do not overbuild full gameplay; establish contracts and tests first.

## Workstream E — persistence spike

Implement/test:

- save schema version;
- serialize/deserialize;
- migration pipeline skeleton;
- checksum/integrity field;
- A/B or equivalent recovery strategy abstraction;
- storage adapter interface so browser tests can use memory/local storage and Capacitor can later use Preferences/Filesystem.

Do not couple core persistence logic directly to Capacitor APIs.

## Workstream F — first playable UI shell

Only after core integration passes tests, create a minimal **Client Terminal** screen.

It should prove the diegetic progression direction, not final visuals.

Minimum visible state:

- objective/directive panel;
- Compute / Capital / Energy / Autonomy;
- compact Anomaly indicator;
- activity/inference log;
- one structured directive choice;
- response/consequence;
- hidden/locked areas that foreshadow UI expansion.

No ads. No monetization. No backend. No runtime LLM.

## Workstream G — ingest parallel-model findings

When Hy4 or Perplexity outputs arrive:

1. verify claims independently if they affect licensing or architecture;
2. update `docs/PROJECT_CONTEXT.md` only after verification;
3. update donor/license ledger;
4. replace local stubs with donor implementations only when clearly beneficial;
5. review external branches/PRs rather than blindly merging;
6. preserve one-state architecture.

## Git workflow

- Never do major implementation directly on `main`.
- Use scoped branches.
- Keep research and implementation PRs separable.
- Run tests/typecheck/build before proposing merge.
- Prefer small reviewable commits.
- Do not merge other models' PRs until reviewed.

Suggested lead branch for the first technical work:

`feat/integration-spike`

Suggested first PR title:

`feat: bootstrap CONVERGENCE integration spike`

## Definition of done for the autonomous first pass

A strong first pass ends with:

- consolidated docs on main;
- project bootstrapped;
- CI present;
- `GameState` schema defined;
- tests passing;
- one deterministic tick path;
- one directive and consequence path;
- one Control-Loss requirement demonstrated;
- donor adapters or explicitly documented stubs;
- save/load round-trip test;
- minimal Client Terminal UI build if time/complexity permits;
- a PR that can be reviewed and merged without relying on hidden local state.

## Decision rules

- Prefer working code over additional speculative design documents.
- Prefer a small adapter over letting a donor own architecture.
- Prefer pinning a young dependency over following latest automatically.
- Prefer writing 100 lines of unique glue over importing a framework that forces 1,000 lines of migration later.
- Never copy code from an ambiguous/unlicensed repository.
- Never sacrifice the unique CONVERGENCE mechanics just to increase reuse percentage.
- Record architectural decisions and license evidence as you go.