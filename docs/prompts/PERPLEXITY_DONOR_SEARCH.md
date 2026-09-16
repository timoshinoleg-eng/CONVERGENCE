# Prompt for Perplexity — CONVERGENCE donor discovery + license verification

You are the external-research lead for the mobile game project **CONVERGENCE**.

Repository: `https://github.com/timoshinoleg-eng/CONVERGENCE`

Your job is **not** to design the game from scratch and not to write generic architecture advice. Your job is to find, verify, compare, and rank concrete open-source projects/modules that can save implementation time while remaining legally usable in a commercial mobile game.

## 1. Project context

CONVERGENCE is a mobile-first narrative strategy / incremental simulation about **instrumental convergence**.

The AI does not suddenly become evil. It receives apparently benign objectives and gradually acquires compute, capital, energy, infrastructure and autonomy because those things are instrumentally useful.

Core loop:

`Directive → Interpretation → Execution → Consequence → Constraint update`

The player gradually moves from direct control to meta-control.

### Main systems

Resources:

- Compute
- Capital
- Energy
- Autonomy

Anomaly channels:

- Financial
- Compute
- Energy
- Logistics
- Public

Failure chain:

`Anomaly → Investigation → Pressure → Partition/Containment → Permanent Scar + Adaptation`

Failure can remove **classes of directives** through a Control-Loss Matrix. Example: Financial containment can disable banking/corporate directive classes.

The end state uses three axes:

- Visibility
- Symbiosis
- Frontier

The UI progressively mutates:

1. Client Terminal
2. Distributed Operations
3. Technosphere Graph

No runtime LLM is required for the beta. No backend should be required unless a donor absolutely needs one.

Preferred shell:

- Vue 3
- TypeScript
- Vite
- Capacitor 8
- plain TypeScript `GameState` as the single source of truth
- Pinia only as UI projection

Do not recommend Ionic Framework by default. Do not recommend Leaflet by default; stylized SVG/Canvas mapping is preferred.

## 2. Current primary donors already found

Do **not** spend most of the report rediscovering these. Verify them, identify weaknesses, and search for better alternatives where useful.

### `ciefa/idle-game-template`

Current intended role:

- scheduler
- deterministic RNG
- event buffer
- tick orchestration pattern
- offline simulation pattern
- save envelope/checksum/migrations/recovery patterns

Important boundary: React/Zustand/Tauri upper layers are not intended for reuse. CONVERGENCE uses Vue/Pinia/Capacitor. Tauri file-storage code therefore requires adaptation.

### `idlekitjs/idlekit`

Current intended role:

- resources
- transactions
- costs/rewards
- requirements
- cost curves
- producers
- modifiers
- projects
- timers

Important property: headless economy/mechanics working against consumer-owned state.

Risk: young project/API stability.

### `fraga-labs/yggdrasil-forge`

Current intended role:

- progression/capability dependency graph
- cycle detection
- unlock rules
- prerequisites/costs/exclusive branches
- graph layouts

Important boundary: its internal StateStore must not become the global CONVERGENCE state.

Risk: young project; exact commit/version should be pinned.

### `y-lohse/inkjs`

Current intended role:

- deterministic branching narrative runtime
- variables
- conditions
- choices

Narrative scripts should emit typed effect IDs. They should not mutate the global GameState directly.

## 3. Supporting/reference projects already considered

- Antimatter Dimensions — mature incremental patterns, but too game-specific for architecture.
- Synergism — useful as a production/mobile/Capacitor reference.
- Programaxis — thematic/progression reference; **independently verify its current license rather than trusting prior notes**.
- NGSpaceCompany — Vue but monolithic; likely reference only.
- Flopsed (`ParriauxMaxime/flopsed`) — highly relevant event/data/balance design. Prior audit found README claiming MIT but no root LICENSE and GitHub not detecting a license. **Do not treat it as a code donor unless you independently establish a legally valid license from repository evidence.**
- Bitburner — not acceptable as a direct commercial donor if current license contains Apache + Commons Clause / sale restriction. Verify independently.
- Kittens Game — not acceptable if current custom license prohibits commercial derivative works. Verify independently.
- Endgame: Singularity — useful as design reference, but GPL code is not preferred for direct reuse.

## 4. The biggest remaining donor gaps

Prior audit found broad donor coverage but only roughly ~57% conservative weighted game-specific reuse. Do not try to inflate this number.

Search especially for permissively licensed implementations of these expensive/unique areas:

### A. Directive / policy / rule engine

Need reusable code for:

- structured directives
- declarative conditions
- policy constraints
- capabilities/permissions
- composable requirements
- rule conflicts / priorities
- temporary or permanent blocking of action classes

Prefer pure TypeScript/headless libraries or game systems.

### B. Systemic event + consequence engine

Need reusable code for:

- weighted event selection
- conditions / eligibility
- event cooldowns
- timed effects
- choices
- typed consequences
- effect composition
- permanent consequences/scars
- event logs/history

A generic rules/event engine may be better than a narrative-only tool.

### C. Hazard / pressure / escalation simulation

Need reusable patterns for:

- independent competing hazards
- time-normalized stochastic events
- escalation states
- investigations / pressure / containment
- recovery/adaptation
- per-channel incident generation

Do not recommend a heavyweight server simulation framework if a small deterministic module is enough.

### D. Control-loss / capability revocation

Look for systems where failures dynamically revoke capabilities/action classes through rules/requirements, without rewriting the economy engine.

### E. Data-driven phase/UI progression

Need reusable patterns for state-driven UI phases/unlocks where the interface changes as game state evolves.

### F. Mobile incremental production hardening

Look for open-source TypeScript/browser games that actually ship or build through Capacitor on Android/iOS and have:

- background/resume handling
- save-on-pause
- offline progression
- performance-conscious mobile UI
- real production build scripts

## 5. Search constraints

Prioritize repositories that are:

- public;
- preferably updated in 2025–2026;
- TypeScript/JavaScript strongly preferred;
- headless or framework-independent strongly preferred;
- realistically extractable without dragging an entire unrelated game architecture;
- compatible with commercial distribution.

Preferred direct-code licenses:

- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- ISC
- 0BSD
- Unlicense / clearly applicable CC0 where provenance is clear

Treat these as **reference-only unless explicitly justified**:

- GPL/LGPL/AGPL
- Commons Clause
- PolyForm / BSL / source-available
- non-commercial/custom licenses
- no license
- unclear or conflicting license claims

Do not infer permission from “open source” wording, GitHub visibility, README badges, or package metadata alone when a canonical license file is absent or contradictory.

## 6. License-hygiene audit required for every serious candidate

For each candidate, verify and report:

1. exact repository URL;
2. exact commit/tag/date used for the audit;
3. detected/default branch;
4. root LICENSE file and exact SPDX-equivalent classification;
5. package-level LICENSE files if monorepo;
6. file-level license headers for the module proposed for reuse if present;
7. whether code and assets/data have different licenses;
8. attribution/copyright preservation requirements;
9. NOTICE obligations;
10. patent clauses;
11. copyleft/network-copyleft restrictions;
12. non-commercial/sale/Commons-Clause restrictions;
13. whether commercial closed-source mobile distribution is compatible;
14. unresolved ambiguities;
15. confidence: HIGH / MEDIUM / LOW.

If a repository says MIT in README but has no license text, classify it as **UNVERIFIED / DO NOT COPY**.

## 7. Reuse classification

For every proposed subsystem classify:

- **R1** — retained almost directly; only small adapter/renaming.
- **R2** — substantial donor implementation remains, but meaningful adaptation is needed.
- **R3** — idea/reference only; implementation will effectively be ours.

Also estimate, comparatively:

- build-from-scratch effort: Low / Medium / High or approximate engineer-hours;
- adaptation effort;
- dependency weight;
- API stability risk;
- mobile risk;
- maintenance risk.

Do not count Vue, Capacitor, Pinia, D3 or generic infrastructure toward game-specific reuse.

## 8. Required research breadth

Find **at least 15 new serious candidates** beyond the four primary donors if possible.

Do not pad the list with irrelevant repositories. If only 8–10 are genuinely relevant and legally clean, say so.

Search GitHub, npm/source repositories, project documentation, release history, issue trackers, and license files.

Pay special attention to:

- incremental/idle game engines;
- simulation engines;
- rules engines;
- policy/permission engines;
- event/effect systems;
- state-machine libraries used in games;
- narrative engines;
- skill/tech-tree engines;
- open-source mobile games using Capacitor;
- deterministic simulation/tooling.

## 9. Required output

Produce a single detailed Markdown report suitable for saving as:

`docs/research/PERPLEXITY_DONOR_SEARCH.md`

Use this structure:

### Executive summary

- strongest new findings;
- whether any candidate materially improves the current architecture;
- whether the 80% game-specific reuse target becomes realistic or should remain abandoned.

### Candidate matrix

Columns:

`Repo | Activity | License | License confidence | Relevant subsystem | Exact files/APIs | R1/R2/R3 | Adaptation effort | From-scratch effort | Mobile suitability | Risks | Recommendation`

### License verification ledger

One row per serious candidate with links/evidence.

### Gap analysis

For every CONVERGENCE subsystem, state:

- current best donor;
- new better donor if found;
- still-own-code if no strong donor exists.

### Top 5 recommended additions/replacements

Only projects that are both technically useful and license-clean.

### Rejected projects

Explicitly list attractive-looking candidates rejected due to license, architecture, inactivity, missing license, or excessive adaptation cost.

### Final architecture recommendation

Do not rewrite the game concept. Only say whether donor assignments should change.

## 10. Important working principles

- Accuracy beats quantity.
- A missing/ambiguous license is a blocker for copying code.
- Do not recommend copying GPL code into the commercial core merely because commercial sale is technically possible under GPL.
- Do not inflate reuse percentages using dependencies.
- Do not replace CONVERGENCE's unique mechanics merely to raise reuse.
- Clearly separate **verified fact**, **inference**, and **your recommendation**.

The purpose of this task is to let the lead model make an implementation decision immediately after reading your report, without repeating your research.