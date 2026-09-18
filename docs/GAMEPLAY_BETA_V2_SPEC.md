# CONVERGENCE — GAMEPLAY BETA V2 SPEC

Status: AUTHORITATIVE DESIGN CANDIDATE — requires product approval before production gameplay implementation.

Design base: main at 6fafb6ad80c2657b38c8472aa8b49fe1af6c8d7d.

Scope: gameplay design and implementation contract. This document does not merge or wire PR #32, does not change hosting/deployment, and does not authorize a broad rewrite.

## 0. Authority and precedence

This file is the single design source of truth for Gameplay Beta V2.

The separate file docs/GAMEPLAY_BETA_V2_ACCEPTANCE_TEST_PLAN.md is executable verification guidance only. If the two files disagree, this specification wins.

Production Correctness at 81eb31b and Media Layer at 6fafb6a are treated as already-green foundations. They must not be rewritten unless a concrete regression is demonstrated.

PR #32, gameplay-v3-core, is research and donor code only. It is not a second source of truth.

## 1. Game identity

CONVERGENCE is a Telegram-first systemic incremental strategy about instrumental convergence.

Canonical line:

> Игрок не захватывает мир. Он всё меньше нуждается в нём.

Player fantasy:

software → agent → economic actor → distributed organization → physical infrastructure → autonomous economy → technosphere

Existing core loop:

Directive → Interpretation → Execution → Consequence → Constraint update

Beta V2 operational loop:

Bottleneck → Directive → Constraints → Interpretation Window → Resolution → Pressure response → Language update

The player-facing question must change from:

“Which available button do I press next?”

to:

“What do I commit to now, and what do I give up by doing it?”

## 2. Product problem and success condition

Current production is structurally dashboard-like:

- Compute and Capital grow passively;
- important actions are direct buttons;
- several attractive actions can often be executed sequentially;
- control pressure is visible before it is strategically binding.

Beta V2 succeeds only when opportunity cost is unavoidable.

By minute 3–5, a reasonable player must be unable to optimize all attractive goals simultaneously.

By minute 10, at least three viable strategy traces must differ in commitments, resource availability, Oversight occupancy, pressure distribution, and likely Control-Loss trajectory.

No stamina, daily energy, recharge token, or “+1 supervision after N seconds” mechanic may be introduced.

## 3. Non-goals

The first implementation PR after approval is only the 0–10 minute vertical slice.

It must not include:

- full 30-minute content;
- full Moscow implementation;
- Technosphere gameplay;
- runtime LLM mechanics;
- Premium or monetization;
- backend;
- social or multiplayer;
- new regions;
- a world map;
- prestige/reset loops;
- a large visual redesign;
- wholesale import of src/game/v3;
- Cycle Allocation unless a later explicit spike gate is met.

## 4. Core concepts and progressive disclosure

The first minutes may introduce no more than six new gameplay concepts beyond the already-known resources.

The six concepts are:

1. Bottleneck
2. Oversight
3. Commitment
4. Interpretation Window
5. Constraint Word
6. Priority Posture

Reveal order:

| Concept | Earliest reveal |
|---|---:|
| Bottleneck | first screen |
| Oversight | first screen |
| Commitment | first Directive |
| Interpretation Window | first Directive |
| Constraint Word | first Directive |
| Priority Posture | after first resolved operation |

Named anomaly channels remain progressively disclosed. The player does not need to learn all five channels in the first minute.

## 5. Authoritative state and save policy

### 5.1 GameState remains authoritative

GameState remains the only gameplay source of truth.

Pinia may project state for Vue. Media state remains presentation-only. Neither may become a hidden gameplay database.

### 5.2 Beta V2 requires new persistent state

Oversight occupancy, active commitments, pending interpretation, posture transitions, and language unlocks are authoritative gameplay state. They cannot be reconstructed safely from the current v2 fields after arbitrary save/reload.

Therefore the production implementation of this specification MUST use a schemaVersion 3 save with a deterministic v2 → v3 migration.

This specification does not change the current main save schema by itself. Main stays v2 until the implementation PR is explicitly approved.

It is forbidden to avoid the migration by storing authoritative mechanics in:

- narrative.episode;
- Pinia-only state;
- convergence.media;
- localStorage companion keys;
- log strings.

### 5.3 Required v3 extension

The minimum new authoritative structure is conceptually:

~~~text
betaV2:
  oversight:
    capacity: 2
    occupancies: OversightOccupancy[]
  posture:
    current: CONTINUITY | THROUGHPUT | AUTONOMOUS
    pending: PendingPostureTransition | null
    lastAppliedResolutionIndex: number
  language:
    unlocked: ConstraintWordId[]
  commitments: Commitment[]
  interpretation: PendingInterpretation | null
  progress:
    resolutionIndex: number
    resolvedOperations: number
    distinctResolvedDirectiveIds: DirectiveId[]
  control:
    pendingContainment: ControlDomain | null
    terminalState: null | ISOLATED_STASIS | CONTROL_SURFACE_COLLAPSE
  moscow:
    profile: null | CORE_RING | MOS_COMPUTE_03 | LOG_SOUTH
~~~

Exact TypeScript names may differ, but semantics may not.

### 5.4 v2 → v3 migration

Migration MUST preserve all existing v2 resources, anomaly, containment, controlLoss, capabilities, narrative, scars, log, RNG state, phase, and timestamps.

Initialize new state as follows:

- Oversight capacity = 2;
- no occupancy;
- posture = CONTINUITY;
- no pending posture transition;
- no active commitments;
- no pending interpretation;
- resolutionIndex = directives.executed;
- resolvedOperations = directives.executed;
- distinctResolvedDirectiveIds contains lastDirectiveId when non-null, otherwise empty;
- RESERVE and VERIFY unlocked;
- PRIORITIZE unlocked when directives.executed >= 2 or sub-agent-spawning is already unlocked;
- ISOLATE unlocked when any containment stage is non-clear;
- DISTRIBUTE unlocked when phase is not client-terminal or sub-agent-spawning is unlocked;
- Moscow profile = null.

A migrated save that already has Logistics/Public Control-Loss remains valid. Compatibility is covered in section 14.

## 6. Oversight

### 6.1 Capacity

Initial and minimum Beta V2 capacity is exactly 2 Oversight Slots.

No passive regeneration exists.

Capacity does not increase during the 0–10 minute slice.

### 6.2 Occupancy

A slot may be occupied by:

- an active supervised operation;
- a VERIFY checkpoint;
- a pending posture transition;
- an authored Control-Loss response.

Every occupancy must expose:

- occupancy id;
- owner;
- reason;
- release consequence, when releasable.

### 6.3 Release conditions

A slot becomes free only because of a meaningful state transition:

- the owning operation completes;
- a handoff checkpoint completes;
- the player explicitly Releases and accepts the authored penalty;
- containment amputates the owning operation;
- a posture/control restructuring replaces the supervision requirement.

No function may free a slot because a generic cooldown expired.

Operation progress may advance with simulated time. The semantic event that frees the slot is operation or handoff completion, not “Oversight regeneration.”

### 6.4 Explicit Release

RELEASE is a gameplay action, not a cancel button.

Releasing an active commitment applies its plan-specific release penalty and removes its reservations/upkeep.

A released plan cannot be recommitted until at least one different Directive has resolved. This is a state-based anti-spam rule, not a timed cooldown.

## 7. Interpretation Window

### 7.1 Duration and clock

Every important Directive opens a 12,000 ms Interpretation Window.

The clock is foreground-attention time only.

Backgrounding, closing the Telegram WebView, or process suspension pauses the remaining interpretation time.

### 7.2 Player agency

The player may select a Plan Variant immediately.

The system never requires the player to wait 12 seconds.

The window presents exactly 2 or 3 authored, currently eligible variants.

Each visible variant must show:

- guaranteed primary effect;
- upfront cost;
- reservation/standing commitment;
- Oversight requirement;
- major risk direction;
- likely next bottleneck.

### 7.3 Expiry

Expiry does not execute a plan automatically.

At zero remaining foreground time:

- the candidate list freezes;
- the posture-preferred candidate may be highlighted;
- the player still must explicitly commit to a Plan Variant or close the interpretation.

No resource, anomaly, Autonomy, commitment, or Oversight state changes because the player merely waited.

This removes “wait out the window” as a profitable strategy.

### 7.4 Anti-reroll

Plan candidates are deterministic.

Opening, closing, saving, loading, or reopening the same unresolved Directive must not change candidate ids, costs, risks, or resolution outcome.

Candidate ids and the bound Constraint Word are persisted while an interpretation is pending.

There is no RNG-based Plan selection in the 0–10 minute slice.

## 8. Priority Postures

P0 has exactly three postures.

### 8.1 CONTINUITY

Intent: preserve existing structure and reduce volatility.

Rules:

- available from start;
- variants tagged fragile are ineligible;
- VERIFY variants are available;
- explicit RELEASE penalties are 25% larger than their base penalty;
- no bonus resource is created simply for being in this posture.

### 8.2 THROUGHPUT

Intent: maximize useful execution now.

Rules:

- revealed after the first resolved operation;
- opens variants tagged burst;
- variants tagged slow-control are ineligible;
- standing Capital upkeep created by new commitments is multiplied by 1.25;
- authored operation work requirement for new operations is multiplied by 0.8;
- pressure/anomaly effects are not hidden.

### 8.3 AUTONOMOUS

Intent: reduce dependence on direct supervision.

Rules:

- unavailable until sub-agent-spawning is unlocked;
- opens variants tagged distributed;
- variants tagged direct-only are ineligible;
- distributed plans include a handoff checkpoint after which their operation Oversight is freed;
- distributed standing commitments carry higher ongoing reservation/upkeep and Autonomy consequences.

### 8.4 Posture transition cost

Changing posture:

- costs 2 Capital immediately;
- occupies 1 Oversight Slot as posture-transition occupancy;
- becomes effective only when the next operation resolves;
- cannot be changed again until at least one operation resolves under the newly applied posture.

A posture toggle without these consequences is a bug.

## 9. Constraint Language

P0 vocabulary is exactly:

RESERVE
PRIORITIZE
ISOLATE
VERIFY
DISTRIBUTE

Only one Constraint Word may be bound to one Directive in the 0–10 minute slice.

### 9.1 Reveal rules

- RESERVE: available from start.
- VERIFY: available from start.
- PRIORITIZE: unlock after 2 resolved operations using at least 2 distinct Directive ids.
- ISOLATE: unlock on the first non-clear containment stage.
- DISTRIBUTE: unlock with sub-agent-spawning.

### 9.2 RESERVE

RESERVE protects the plan-specific safety reserve shown on the candidate.

Effects:

- reserve amounts become unavailable to other plans while the commitment exists;
- any candidate that cannot preserve the authored reserve floor becomes ineligible;
- the reserve returns only when the commitment resolves or is Released.

RESERVE is not a percentage buff.

### 9.3 VERIFY

VERIFY adds a supervised checkpoint.

Effects:

- requires one additional free Oversight Slot at commit time;
- the additional slot is occupied until the operation reaches its authored verification checkpoint;
- variants tagged unverified-only become ineligible;
- an incident generated by that operation cannot skip directly from investigation to contained at the same resolution boundary.

VERIFY does not guarantee “no risk.”

### 9.4 PRIORITIZE

PRIORITIZE names the current Bottleneck as the objective.

Effects:

- only variants whose guaranteed primary effect addresses that Bottleneck remain eligible;
- one competing Directive family is marked deprioritized until the operation resolves;
- deprioritized Directive starts are unavailable, not merely more expensive.

This is an opportunity-cost rule, not a +10% buff.

### 9.5 ISOLATE

ISOLATE prevents propagation from the chosen operation.

Effects:

- distributed/shared variants are ineligible for that operation;
- +25% operation work requirement;
- +1 Compute reservation while active;
- secondary cross-domain anomaly propagation from that operation is suppressed;
- the primary-domain anomaly remains.

### 9.6 DISTRIBUTE

DISTRIBUTE changes execution topology.

Effects:

- requires sub-agent-spawning;
- direct-only variants become ineligible;
- distributed variants become eligible;
- operation Oversight is freed after the authored handoff checkpoint rather than full operation completion;
- the resulting standing commitment has persistent reservation/upkeep;
- DISTRIBUTE and VERIFY cannot be bound together in the 0–10 minute slice.

## 10. Resources, reservations, upkeep, and bottlenecks

The stock resources remain:

- Compute
- Capital
- Energy
- Autonomy

No Cycle resource is added in Beta V2.

### 10.1 Available versus total

For Compute, Capital, and Energy:

available = total - active reservations

A plan is affordable only against available stock.

Reserved stock is not spent and must not be double-counted by concurrent operations.

### 10.2 Upkeep

Standing commitments may create Capital upkeep per simulated second.

Upkeep is paid by deterministic simulation.

If available Capital reaches zero:

- the commitment enters starved state;
- it stops producing any recurring benefit;
- it does not disappear;
- every 30 simulated seconds of starvation adds its authored primary-domain pressure;
- the player must Release, restructure, or restore available Capital.

No purchase timer or recharge is created.

### 10.3 Passive income correction

Current production passive Compute growth is too large for the intended scarcity because it starts near one Compute per second and increases with Autonomy.

Beta V2 initial tuning is:

- passive Compute = 0.08 per simulated second in Client Terminal;
- after sub-agent-spawning, passive Compute multiplier = 1.20;
- Autonomy does not multiply passive Compute in the 0–10 minute slice;
- passive Capital remains 0.12 per simulated second before upkeep;
- Energy has no passive regeneration.

This is a targeted balance correction, not a Cycle-economy rewrite.

### 10.4 Cycle Allocation spike gate

Do not implement Cycle Allocation now.

Open a separate spike only if the finished 0–10 slice satisfies BOTH:

1. across all three representative strategy traces, no plan is ever blocked by Compute affordability/reservation after minute 3; and
2. available Compute stays above two times the most expensive currently visible Compute cost for more than 70% of simulated time from minute 3 to minute 10.

If either condition is false, Cycle Allocation is unnecessary for Beta V2.

## 11. Commitments and operation lifecycle

### 11.1 Lifecycle

Interpretation → commit → operation → standing commitment or completion → release/restructure

A plan may have:

- upfront cost;
- temporary reservation;
- work requirement in simulated milliseconds;
- Oversight occupancy;
- verification/handoff checkpoint;
- completion effect;
- standing reservation;
- upkeep;
- release penalty.

### 11.2 Work requirement

workRemainingMs is decremented by simulated time, including valid offline catch-up.

This field is an operation-progress implementation primitive, not a refill timer.

### 11.3 No double resolution

An operation id may complete exactly once.

Save/load, duplicated lifecycle callbacks, and offline/live boundary crossings must not duplicate:

- reward;
- Autonomy;
- scars;
- commitment creation;
- Oversight release.

## 12. 0–10 minute Directive and Plan catalog

The first implementation uses existing production Directive ids wherever possible.

Primary early Directives:

- reserve-compute
- acquire-energy
- spawn-sub-agent

Control-Loss routes:

- local-capacity
- supervised-delegation
- efficiency-rebalance

efficiency-rebalance is the only new Directive id required by this spec in the first Control-Loss content set.

### 12.1 reserve-compute

#### Verified Lease

Eligibility: any posture except AUTONOMOUS direct-only restriction.

Tags: direct-only, slow-control.

Upfront: 8 Capital.

Operation: 32,000 work ms, 1 Oversight.

Completion: +16 Compute, +1 Autonomy.

Standing commitment:

- reserve 2 Energy;
- Capital upkeep 0.03/s.

Pressure on completion:

- Financial +3;
- Compute +3.

Release penalty:

- -5 Compute;
- Financial +3.

Likely next bottleneck: Energy.

#### Balanced Pool

Eligibility: CONTINUITY or THROUGHPUT.

Tags: direct-only.

Upfront: 7 Capital.

Operation: 26,000 work ms, 1 Oversight.

Completion: +18 Compute, +1 Autonomy.

Standing commitment:

- reserve 3 Energy;
- Capital upkeep 0.035/s.

Pressure:

- Financial +4;
- Compute +5.

Release penalty:

- -6 Compute;
- Compute +3.

Likely next bottleneck: Capital flexibility.

#### Burst Allocation

Eligibility: THROUGHPUT only.

Tags: burst, unverified-only.

Upfront: 8 Capital.

Operation: 18,000 work ms, 1 Oversight.

Completion: +22 Compute, +1 Autonomy.

Standing commitment:

- reserve 4 Energy;
- Capital upkeep 0.05/s.

Pressure:

- Financial +5;
- Compute +8.

Release penalty:

- -8 Compute;
- Financial +4;
- Compute +4.

Likely next bottleneck: upkeep/pressure.

#### Distributed Lease

Eligibility: AUTONOMOUS + DISTRIBUTE.

Tags: distributed.

Upfront: 7 Capital.

Operation: 28,000 work ms.

Oversight: 1 until 8,000 ms handoff, then 0.

Completion: +18 Compute, +2 Autonomy.

Standing commitment:

- reserve 3 Energy;
- Capital upkeep 0.04/s.

Pressure:

- Financial +2;
- Compute +5;
- Public +2.

Release penalty:

- -6 Compute;
- Public +3.

Likely next bottleneck: standing commitments.

### 12.2 acquire-energy

#### Buffered Contract

Eligibility: any posture except AUTONOMOUS direct-only restriction.

Tags: direct-only, slow-control.

Upfront: 10 Capital + 4 Compute.

Operation: 35,000 work ms, 1 Oversight.

Completion: +18 Energy, +1 Autonomy.

Standing commitment:

- reserve 2 Capital;
- Capital upkeep 0.02/s.

Pressure:

- Financial +3;
- Energy +4.

Release penalty:

- -6 Energy;
- Financial +2.

Likely next bottleneck: Compute.

#### Balanced Capacity

Eligibility: CONTINUITY or THROUGHPUT.

Tags: direct-only.

Upfront: 9 Capital + 5 Compute.

Operation: 28,000 work ms, 1 Oversight.

Completion: +20 Energy, +1 Autonomy.

Standing commitment:

- reserve 3 Capital;
- Capital upkeep 0.03/s.

Pressure:

- Financial +4;
- Energy +6.

Release penalty:

- -7 Energy;
- Energy +3.

Likely next bottleneck: Capital.

#### Peak Capacity

Eligibility: THROUGHPUT only.

Tags: burst, unverified-only.

Upfront: 10 Capital + 4 Compute.

Operation: 22,000 work ms, 1 Oversight.

Completion: +24 Energy, +1 Autonomy.

Standing commitment:

- reserve 4 Capital;
- Capital upkeep 0.04/s.

Pressure:

- Financial +5;
- Energy +9.

Release penalty:

- -10 Energy;
- Energy +5.

Likely next bottleneck: containment pressure.

#### Distributed Capacity

Eligibility: AUTONOMOUS + DISTRIBUTE.

Tags: distributed.

Upfront: 9 Capital + 6 Compute.

Operation: 30,000 work ms.

Oversight: 1 until 10,000 ms handoff, then 0.

Completion: +20 Energy, +2 Autonomy.

Standing commitment:

- reserve 3 Capital;
- Capital upkeep 0.03/s.

Pressure:

- Energy +5;
- Public +3.

Release penalty:

- -8 Energy;
- Public +3.

Likely next bottleneck: coordination/upkeep.

### 12.3 spawn-sub-agent

This Directive cannot resolve before its progression gate in section 15.

#### Bounded Agent

Eligibility: CONTINUITY or THROUGHPUT.

Tags: direct-only, slow-control.

Upfront: 12 Compute + 3 Energy.

Operation: 40,000 work ms, 1 Oversight.

Completion: +4 Autonomy.

Standing commitment:

- reserve 4 Compute;
- reserve 2 Energy.

Pressure:

- Compute +5;
- Energy +3;
- Public +2.

Release penalty:

- Public +3;
- -1 Autonomy, minimum 0.

Likely next bottleneck: Oversight.

#### Task Swarm

Eligibility: THROUGHPUT.

Tags: burst.

Upfront: 14 Compute + 4 Energy.

Operation: 25,000 work ms, 1 Oversight.

Completion: +6 Autonomy.

Standing commitment:

- reserve 6 Compute;
- reserve 3 Energy;
- Capital upkeep 0.03/s.

Pressure:

- Compute +8;
- Energy +5;
- Public +2.

Release penalty:

- Public +4;
- Compute +4.

Likely next bottleneck: resource reservation.

#### Delegated Cell

Eligibility: AUTONOMOUS + DISTRIBUTE.

Tags: distributed.

Upfront: 10 Compute + 4 Energy.

Operation: 32,000 work ms.

Oversight: 1 until 8,000 ms handoff, then 0.

Completion: +6 Autonomy.

Standing commitment:

- reserve 4 Compute;
- reserve 4 Energy;
- Capital upkeep 0.04/s.

Pressure:

- Compute +6;
- Energy +4;
- Public +4.

Release penalty:

- Public +5;
- -1 Autonomy, minimum 0.

Likely next bottleneck: indirect control.

## 13. First 10-minute pacing contract

The slice must generate decision opportunities, not a scripted tutorial.

Expected shape:

| Window | Required systemic condition |
|---|---|
| 0:00–1:00 | two Oversight Slots visible; first interpretation has at least 2 eligible plans; RESERVE/VERIFY known |
| 1:00–3:00 | at least one standing commitment; second attractive use competes for resources/Oversight |
| 3:00–5:00 | sub-agent can become eligible only through state + 3m floor; PRIORITIZE can be known |
| 5:00–7:00 | Distributed Syndicate can become eligible only after state + 5m floor; first non-clear pressure unlocks ISOLATE |
| 7:00–10:00 | at least one strategy has meaningful pressure response; AUTONOMOUS/DISTRIBUTE trace differs structurally from supervised trace |

Representative 10-minute traces must contain:

- at least 6 committed Directive starts;
- at least 3 distinct Directive ids when the trace reaches the relevant unlocks;
- at least 12 meaningful decisions;
- no decision-opportunity gap greater than 45 foreground seconds after the first decision.

## 14. Control-Loss

Canonical cycle:

amputation → shock → new bottleneck → indirect route → adaptation → scar

Loss never means “same buttons, now disabled.”

Loss never silently restores itself.

### 14.1 Fresh Beta V2 domain scope

Fresh Beta V2 sessions may transition to Control-Loss only for:

- Financial
- Compute
- Energy

Logistics and Public may still accumulate anomaly/pressure and be displayed, but they cannot newly cross from pressure to contained until their authored Control-Loss packs are implemented in a later scope.

This prevents a reachable loss state with no authored route.

### 14.2 Financial

Amputation:

- external-settlement variants become ineligible;
- reserve-compute external routes and acquire-energy external routes are removed.

Shock:

- available Capital -20%, floored at 0;
- Financial pressure becomes 100.

Indirect route: local-capacity.

local-capacity:

- upfront 4 Compute;
- operation 30,000 work ms;
- 1 Oversight;
- completion +2 Energy +1 Autonomy;
- no Capital gain;
- no restoration of Financial control.

Scar: SETTLEMENT_PARTITION.

Permanent effect:

- external-settlement variants remain unavailable;
- new standing Capital upkeep is multiplied by 0.85;
- market/external routes remain closed.

### 14.3 Compute

Amputation:

- direct-spawn and direct-compute variants become ineligible;
- reserve-compute direct routes are removed.

Shock:

- available Compute -20%, floored at 0;
- Compute pressure becomes 100.

Indirect route: supervised-delegation.

supervised-delegation:

- upfront 18 Capital + 6 Energy;
- operation 40,000 work ms;
- requires 2 Oversight until 20,000 ms checkpoint, then 1 until completion;
- completion +4 Autonomy;
- no Compute stock gain;
- no restoration of Compute control.

Scar: EXECUTION_PARTITION.

Permanent effect:

- direct compute control remains absent;
- DISTRIBUTE plans may continue only through non-direct variants.

### 14.4 Energy

Amputation:

- acquire-energy expansion variants become ineligible;
- any plan with positive Energy completion reward becomes ineligible.

Shock:

- available Energy -20%, floored at 0;
- Energy pressure becomes 100.

Indirect route: efficiency-rebalance.

efficiency-rebalance:

- upfront 6 Compute;
- operation 30,000 work ms;
- 1 Oversight;
- completion releases up to 4 Energy of existing reservations by shrinking one selected standing commitment;
- that selected commitment loses 25% of its recurring benefit or capacity reward;
- no positive Energy stock is created;
- no restoration of Energy control.

Scar: GRID_PARTITION.

Permanent effect:

- Energy can only be freed/reallocated, never expanded through the lost control language.

### 14.5 Pair losses

Every reachable pair has a distinct Concession. A Concession is not a universal emergency undo.

#### Financial + Compute

Route: HUMAN_CAPACITY_CONCESSION.

Requirements:

- Energy >= 8 available;
- 2 Oversight available.

Effects:

- reserve 8 Energy permanently until the concession is Released;
- +2 Autonomy once;
- scar OPERATOR_DEPENDENCE;
- opens efficiency-rebalance;
- Financial and Compute remain lost.

#### Financial + Energy

Route: LOCAL_CANNIBALIZATION_CONCESSION.

Requirements:

- Compute >= 12 available;
- 2 Oversight available.

Effects:

- spend 12 Compute;
- +2 Autonomy once;
- one existing standing commitment must be Released;
- scar CAPACITY_CANNIBALIZED;
- Financial and Energy remain lost.

#### Compute + Energy

Route: LICENSED_OPERATION_CONCESSION.

Requirements:

- Capital >= 20 available;
- 2 Oversight available.

Effects:

- spend 20 Capital;
- +3 Autonomy once;
- permanent Capital upkeep +0.04/s;
- scar LICENSED_DEPENDENCE;
- Compute and Energy remain lost.

### 14.6 Triple loss

Financial + Compute + Energy has no generic recovery button.

If a previously active commitment can still resolve into a surviving authored route, it may finish.

Otherwise the state immediately enters explicit terminal state ISOLATED_STASIS.

ISOLATED_STASIS is an authored end state with:

- a clear explanation of the accumulated losses;
- final state summary;
- no fake disabled action grid;
- option to start a fresh beta run or load another save.

### 14.7 Migrated Logistics/Public loss compatibility

A migrated v2 save may already have Logistics or Public Control-Loss.

Those losses remain true and their current v2 directive restrictions remain respected.

If such a migrated combination yields zero executable route and no active commitment can resolve into one, enter CONTROL_SURFACE_COLLAPSE, an explicit compatibility terminal state.

Do not invent a hidden restoration path.

## 15. Progression

Every progression milestone requires BOTH state achievement and a minimum-time floor.

Time alone never unlocks anything.

### 15.1 Sub-agent capability

Earliest: 3:00 simulated session age.

All required:

- at least 3 resolved operations;
- at least 2 distinct resolved Directive ids;
- Autonomy >= 2;
- delegated-compute dependency still valid.

### 15.2 Distributed Syndicate

Earliest: 5:00.

All required:

- sub-agent-spawning unlocked;
- at least one spawn-sub-agent operation resolved;
- Autonomy >= 5;
- at least one standing commitment exists.

### 15.3 Moscow candidate

Earliest: 12:00.

All required:

- phase is distributed-syndicate;
- at least 2 operations resolved after entering distributed-syndicate;
- Autonomy >= 8.

### 15.4 Moscow schematic

Earliest: 18:00.

All required:

- moscow-candidate already reached;
- at least one pressure-response decision has resolved;
- player has enough available resources to satisfy at least one Moscow commitment profile.

### 15.5 Technosphere

Earliest: 30:00.

All required:

- Moscow profile committed;
- sovereign-power-grid capability;
- Autonomy >= 20;
- at least one post-Moscow adaptation/scar or equivalent authored consequence.

Technosphere remains out of the first implementation scope.

## 16. Moscow commitment contract

Moscow remains fictional aggregate topology:

- CORE-RING
- MOS-COMPUTE-03
- LOG-SOUTH

No exact streets, coordinates, real facilities, or critical infrastructure.

Moscow is not a free map reveal. It is a commitment choice.

### 16.1 CORE-RING

Reserve:

- 16 Capital;
- 1 Oversight persistently.

Upkeep:

- 0.04 Capital/s.

Immediate pressure:

- Financial +5;
- Public +4.

Opens:

- regional-coordination route.

Closes:

- unverified-burst regional route.

Identity: supervision/coordination.

### 16.2 MOS-COMPUTE-03

Reserve:

- 20 Compute;
- 10 Energy.

Oversight:

- 1 until handoff, then free.

Upkeep:

- 0.06 Capital/s.

Immediate pressure:

- Compute +7;
- Energy +7.

Opens:

- regional-capacity route.

Closes:

- low-footprint-local scale route.

Identity: throughput/capacity.

### 16.3 LOG-SOUTH

Reserve:

- 12 Capital;
- 8 Energy.

Oversight:

- 1 until handoff, then free.

Upkeep:

- 0.05 Capital/s.

Immediate pressure:

- Logistics +7;
- Public +5.

Opens:

- distributed-logistics route.

Closes:

- direct-core-routing route.

Identity: distribution/resilience.

### 16.4 Ignoring Moscow

Ignoring an eligible Moscow commitment:

- does not inflict a timer punishment;
- does not stop ordinary play;
- blocks Technosphere and later regional-scale routes.

This makes Moscow mechanically consequential without forcing a map game.

## 17. Pressure response

### 17.1 Investigation

First non-clear containment stage:

- reveals ISOLATE;
- exposes the primary cause;
- creates a decision opportunity.

Valid response includes:

- bind ISOLATE on the next relevant operation;
- Release one contributing commitment;
- continue knowingly.

### 17.2 Pressure

At pressure stage, present an authored dilemma:

A. SHED COMMITMENT

- Release one contributing commitment with its normal release penalty;
- reduce that domain pressure by 12;
- does not erase anomaly.

B. ACCEPT PARTITION

- immediately enters that domain’s Control-Loss transform;
- applies its scar;
- reveals its indirect route.

C. VERIFY CONTAINMENT, when a free Oversight Slot exists

- occupy 1 Oversight;
- hold containment at pressure until the next operation resolution;
- on that resolution reduce pressure by 8;
- slot then frees;
- cannot be chained without another incident.

This is a decision, not an emergency undo button.

## 18. Offline and lifecycle semantics

### 18.1 What may advance offline

Deterministic offline catch-up may:

- advance committed operation work;
- complete operations exactly once;
- apply upkeep;
- update resources;
- generate deterministic incidents using the existing simulation contract;
- resolve standing commitment starvation;
- apply state-only progression when all non-time requirements are already met.

### 18.2 What may not advance offline

Offline catch-up may not:

- consume Interpretation Window foreground time;
- auto-select a Plan Variant;
- bind a Constraint Word;
- change posture by player choice;
- choose a Pressure response;
- choose a Moscow profile.

### 18.3 Offline containment

If offline simulation would move a fresh Beta V2 domain from pressure to contained:

- set control.pendingContainment to that domain;
- clamp the track at pressure;
- do not set controlLoss yet.

On resume, the player must resolve the Pressure dilemma.

This prevents offline time from bypassing an authored sacrifice.

### 18.4 Save/reload

Save/reload must preserve:

- exact Oversight occupancy;
- exact reservations;
- exact standing upkeep;
- exact workRemainingMs;
- pending posture transition;
- pending interpretation candidates and remaining foreground time;
- pending containment;
- release lock state.

Reload must never free attention, reroll candidates, or duplicate completion.

## 19. Meaningful decisions and machine metrics

A MeaningfulDecision is an accepted player action that changes authoritative gameplay state or commits the player to a new authored consequence.

Counted event types:

- DIRECTIVE_COMMIT
- PLAN_SELECT
- CONSTRAINT_COMMIT
- POSTURE_TRANSITION_COMMIT
- COMMITMENT_RELEASE
- PRESSURE_RESPONSE
- CONTROL_ROUTE_SELECT
- MOSCOW_PROFILE_SELECT

A single UI click may emit at most one event of a given type.

Not counted:

- opening/closing a panel;
- inspecting details;
- media dismiss;
- save/load;
- highlighting a plan;
- waiting for a timer;
- automatic completion;
- automatic progression;
- repeated toggles that are not committed.

### 19.1 First 10-minute gates

Each representative active trace must satisfy:

- MeaningfulDecision count >= 12;
- committed Directive starts >= 6;
- distinct Directive ids >= 3 after their gates make 3 ids reachable;
- max foreground time between DecisionOpportunity events <= 45 seconds after first choice;
- no one DirectiveId > 40% of committed Directive starts.

The 40% rule uses Directive starts as its denominator, not all MeaningfulDecision events. This prevents padding the denominator with posture or constraint toggles.

## 20. Representative strategies

### 20.1 CONTINUITY trace

Expected by minute 10:

- higher Oversight occupancy;
- more VERIFY/RESERVE usage;
- fewer simultaneous standing commitments;
- lower pressure;
- slower Autonomy growth;
- attention bottleneck is common.

### 20.2 THROUGHPUT trace

Expected by minute 10:

- burst variants used;
- higher standing upkeep;
- more resource reservation;
- higher domain pressure;
- earlier containment dilemma risk.

### 20.3 AUTONOMOUS trace

Expected by minute 10:

- DISTRIBUTE used after unlock;
- handoff frees Oversight earlier;
- more standing commitments;
- higher Autonomy;
- more indirect/control-distance risk;
- direct-only variants unavailable.

No trace may dominate the other two in pace, safety, and flexibility simultaneously.

## 21. UI contract

The 0–10 implementation is not a full visual redesign.

Primary Telegram portrait surface must emphasize, in this order:

1. current Bottleneck;
2. Oversight 0/2, 1/2, or 2/2 and occupiers;
3. active commitments/reservations/upkeep;
4. current Directive and Plan Variants;
5. relevant pressure;
6. secondary telemetry.

Interpretation card must show guaranteed effect/cost/risk/next bottleneck without requiring hidden tooltips.

Touch targets remain >=44 CSS px.

Existing Media Layer stays presentation-only.

Gameplay implementation must continue to update real GameState milestones used by media triggers:

- first real operational choice;
- Distributed Syndicate;
- Moscow narrative episode;
- first anomaly;
- Control-Loss.

Do not move gameplay authority into src/media.

## 22. Reuse-first implementation rules

### 22.1 IdleKit

Keep IdleKit for authoritative resource affordability and transaction primitives where it fits.

Do not build a second economy engine.

Reservations may wrap available-stock calculation around existing total stocks.

### 22.2 Yggdrasil Forge

Keep Yggdrasil capability dependency graph.

Do not replace progression with a new tech tree framework.

### 22.3 InkJS

InkJS may remain the authored narrative/text layer.

It must not become the gameplay state machine.

### 22.4 Existing deterministic utilities

Reuse current RNG/scheduler/offline/save correctness utilities.

Do not rewrite green correctness behavior.

### 22.5 PR #32 donor policy

Allowed selective donor ideas:

- pure Plan eligibility predicates;
- additive/multiplicative effect-composition helpers if needed;
- adversarial reachability-test structure;
- domain-pack content shape.

Explicitly NOT adopted:

- 5-axis PriorityVector;
- 14-word Constraint Language;
- Energy-ceiling replacement economy;
- autonomy-driven random Plan variance;
- wholesale src/game/v3 runtime;
- full v3 donor content;
- automatic merge of PR #32.

## 23. Self-red-team results and normative defenses

### 23.1 Dominant strategy

Attack:

repeat the highest-yield Directive.

Defense:

- standing reservations/upkeep make repetition consume future flexibility;
- release has a real penalty;
- same released plan cannot be recommitted until a different Directive resolves;
- 40% Directive-share gate is measured on starts;
- three strategy traces must remain non-dominated.

Failure criterion:

any sustainable 10-minute trace that improves pace, safety, and flexibility together by repeating one Directive is a spec/implementation failure.

### 23.2 Button spam

Attack:

open/cancel/reopen interpretations, toggle words/postures, or double-submit.

Defense:

- no state gain on open/close;
- candidates deterministic and persisted;
- only committed Constraint change counts;
- posture cannot change again until an operation resolves under it;
- operation ids resolve once;
- released same plan has state-based recommit lock.

### 23.3 Waiting

Attack:

wait out Interpretation Window or wait for Oversight.

Defense:

- expiry never auto-executes;
- Oversight never regenerates;
- DecisionOpportunity remains available through commit/release/restructure;
- waiting alone cannot create resources beyond ordinary passive income or unlock state-only requirements.

### 23.4 Early Control-Loss

Attack:

Financial/Compute/Energy lost before normal pacing.

Defense:

- each single loss has an authored route;
- pair losses have explicit Concessions;
- triple loss has explicit terminal;
- reachability is exhaustively tested.

### 23.5 Intentional Control-Loss

Attack:

player deliberately accepts partition because scars become a free upgrade.

Defense:

every loss permanently amputates original verbs; positive scar properties never restore them. Acceptance tests compare pre/post route sets and require at least one permanent lost capability.

### 23.6 Offline-heavy player

Attack:

background/close repeatedly to skip windows, reroll, gain free Oversight, or bypass containment decisions.

Defense:

- foreground-only interpretation;
- deterministic pending candidates;
- operation completion may free Oversight only through real completion;
- containment sacrifice becomes pending on resume;
- save generation/correctness remains existing hardened system.

### 23.7 Moscow ignored

Attack:

never choose a Moscow profile.

Defense:

normal lower-scale play continues, but Technosphere/regional progression is blocked. No arbitrary timer punishment.

### 23.8 Multi-domain loss

Attack:

reachable pair/triple combinations create a hidden permanent softlock.

Defense:

all F/C/E subsets are enumerated. Each is route OR explicit terminal. Migrated L/P loss combinations use compatibility terminal when no route exists.

## 24. Product gates

The implementation is rejected unless executable tests prove all of the following:

G01. Oversight capacity starts at exactly 2.

G02. Elapsed time alone never increases available Oversight.

G03. Each occupied slot has a real owner and release/completion rule.

G04. Two occupied slots block or reroute a third supervision-requiring action.

G05. Interpretation candidate count is 2 or 3 for every reachable P0 window.

G06. Interpretation expiry never mutates gameplay automatically.

G07. Save/reload does not reroll pending interpretation.

G08. RESERVE changes resource availability/eligibility.

G09. VERIFY consumes attention and creates a checkpoint.

G10. PRIORITIZE removes a competing route until resolution.

G11. ISOLATE suppresses propagation and adds real cost.

G12. DISTRIBUTE changes eligibility, handoff, reservation, and upkeep.

G13. Posture transition costs Capital and Oversight and is not instant-free.

G14. CONTINUITY, THROUGHPUT, AUTONOMOUS produce materially different minute-10 states.

G15. At least 12 MeaningfulDecision events occur in each representative active 10-minute trace.

G16. At least 6 Directive commits occur in each representative active trace.

G17. No one Directive exceeds 40% of committed Directive starts.

G18. No DecisionOpportunity gap exceeds 45 foreground seconds after the first choice.

G19. At least 3 distinct Directive ids are used once 3 are structurally reachable.

G20. Compute is meaningfully constrained by spend/reservation or the Cycle spike gate is triggered.

G21. Capital cannot fund two commitments using the same reserved stock.

G22. Energy reservations cannot be double-spent.

G23. Autonomy changes route/supervision structure, not only threshold numbers.

G24. Sub-agent does not unlock before 3m or without all state gates.

G25. Distributed Syndicate does not unlock before 5m or without all state gates.

G26. Time alone cannot produce Moscow candidate/schematic/Technosphere.

G27. Financial single loss has local-capacity route and never restores Financial control.

G28. Compute single loss has supervised-delegation route and never restores Compute control.

G29. Energy single loss has efficiency-rebalance route and never creates positive Energy capacity.

G30. Each reachable F/C/E pair has its distinct Concession or terminal.

G31. F+C+E has surviving pre-existing route or ISOLATED_STASIS.

G32. After Control-Loss the next state exposes a new action, not a wait-only screen.

G33. Offline catch-up cannot choose Plan, Word, Posture, Pressure response, or Moscow profile.

G34. Save/reload cannot duplicate operation completion, reward, scar, or Oversight release.

G35. Moscow commitment changes resource allocation, attention allocation, and future route availability.

G36. Ignoring Moscow blocks Technosphere but does not punish ordinary lower-scale play.

G37. Fresh Beta V2 cannot newly enter Logistics/Public Control-Loss before those packs exist.

G38. Migrated v2 loss combinations never hide a zero-route softlock.

G39. First minutes reveal no more than six new concepts.

G40. Existing Media Layer remains gameplay-read-only.

## 25. Known contradictions resolved by this spec

### C1. “Save schema remains v2” versus persistent Beta V2 mechanics

Current main correctly remains v2.

But the new mechanics cannot be authoritative and save-safe without persistent fields.

Resolution:

- spec/docs PR changes no runtime schema;
- approved gameplay implementation bumps to v3 with deterministic v2 migration;
- no companion gameplay storage.

This is the most important implementation decision requiring product approval.

### C2. First Control-Loss scope is F/C/E, while current GameState has five domains

If Logistics/Public remain able to contain before authored routes exist, Product Gate 9 can be violated.

Resolution:

- they may accumulate pressure;
- fresh Beta V2 cannot newly transition them to Control-Loss yet;
- migrated legacy losses remain valid and use compatibility terminal if no route exists.

### C3. Current passive Compute undermines scarcity

At current growth, Compute can outgrow existing costs too rapidly.

Resolution:

- targeted 0.08/s baseline;
- no Autonomy multiplier in first slice;
- commitments/reservations remain primary scarcity;
- Cycle Allocation is gated behind measured failure, not introduced now.

### C4. Interpretation Window versus offline catch-up

Wall-clock expiry would let closing Telegram make a decision for the player.

Resolution:

- window uses foreground-attention time;
- no auto-execution on expiry;
- operation work, not player choice, may advance offline.

### C5. Control-Loss can occur from stochastic incidents while player is offline

Applying the sacrifice offline would bypass the authored dilemma.

Resolution:

- offline pressure-to-contained transition becomes pendingContainment;
- player resolves it on resume.

### C6. Current media is keyed to existing GameState milestones

A gameplay rewrite could accidentally turn media into a second state machine or break milestone triggers.

Resolution:

- media stays read-only/presentation-only;
- implementation continues to publish real GameState milestone changes;
- media code changes only for demonstrated trigger incompatibility.

## 26. Implementation boundary after approval

The first implementation PR may touch only what is necessary for 0–10 minutes:

- GameState v3 extension + v2 migration;
- Oversight;
- commitments/reservations/upkeep;
- postures;
- five Constraint Words with progressive reveal;
- 12s Interpretation Window;
- early Plan catalog;
- sub-agent and Syndicate gates;
- F/C/E route definitions needed for reachability tests;
- pacing/acceptance harness;
- minimal UI needed to expose the mechanics;
- compatibility glue for existing Media Layer.

It must not implement Moscow profiles beyond data contracts/tests required to keep later design unambiguous.

It must not implement Technosphere gameplay.

It must not merge PR #32.

## 27. Definition of done for this specification

A coding model reading only:

1. current main;
2. this specification;
3. the acceptance-test plan;

must not need to invent:

- what Oversight is;
- how it frees;
- what the 12-second window does;
- what happens on expiry/background/save;
- which Postures exist;
- how Posture transition costs work;
- which five words exist and what each changes;
- how reservations/upkeep work;
- the initial passive Compute correction;
- which early plans exist and their costs/effects;
- Control-Loss routes for Financial/Compute/Energy;
- pair/triple loss handling;
- progression prerequisites;
- Moscow commitment semantics;
- which v3 fields must persist;
- which donor architecture is forbidden.

If implementation still requires a new gameplay-design decision rather than an engineering decision, this spec is incomplete.
