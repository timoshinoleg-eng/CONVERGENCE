# CONVERGENCE — GAMEPLAY BETA V2 ACCEPTANCE TEST PLAN

Status: verification companion to docs/GAMEPLAY_BETA_V2_SPEC.md.

Authority: this file contains no independent gameplay design. If a test description conflicts with the specification, fix this file rather than changing gameplay to satisfy it.

Target implementation scope: first 0–10 minute Gameplay Beta V2 vertical slice plus the minimum contracts needed to prove future Control-Loss/Moscow safety.

## 1. Purpose

The acceptance suite must prove that Beta V2 is a game of opportunity cost rather than a telemetry dashboard.

It must catch:

- free Oversight regeneration;
- sequential “press every button” optimization;
- interpretation rerolls;
- posture/word spam;
- resource double-spend through reservations;
- save/reload exploits;
- offline decision bypass;
- dominant single-Directive loops;
- Control-Loss softlocks;
- time-only progression;
- Moscow becoming cosmetic;
- accidental coupling of gameplay and Media Layer.

The suite must be deterministic for a fixed initial state, seed, clock, and player policy.

## 2. Test layers

Recommended test grouping:

| Layer | Purpose |
|---|---|
| unit | Oversight, reservations, word/posture eligibility, operation lifecycle |
| state-machine | interpretation, release, pressure response, Control-Loss normalization |
| persistence | v2→v3 migration, save/reload, pending operation/interpretation identity |
| pacing | deterministic 0–10 minute strategy traces |
| adversarial | spam, waiting, early loss, intentional loss, multi-domain loss |
| integration | store/UI projection without moving authority out of GameState |
| regression | existing correctness/media contracts remain green |

Suggested locations are implementation details, but a clear layout is:

~~~text
src/game/betaV2/oversight.spec.ts
src/game/betaV2/interpretation.spec.ts
src/game/betaV2/commitments.spec.ts
src/game/betaV2/postures.spec.ts
src/game/betaV2/constraints.spec.ts
src/game/betaV2/controlLoss.spec.ts
src/game/betaV2/offline.spec.ts
src/game/balance/betaV2Pacing.spec.ts
src/game/save-v3.spec.ts
src/media/storeIntegration.spec.ts
~~~

## 3. Deterministic harness contract

Every headless scenario controls:

- seed;
- initial timestamp;
- simulated clock;
- foreground-attention clock;
- lifecycle state;
- player policy;
- initial save version;
- optional injected containment event.

Do not use real Date.now inside acceptance policy logic.

Default start:

- timestamp = 1,000 ms;
- seed = 42 unless scenario specifies another;
- GameState from the production initializer/migration;
- foreground = true;
- no injected losses.

Robustness seed set:

- 42
- 137
- 9001
- 12648430
- 20260918

No Plan Variant selection may depend on random noise in the first slice. Seeds matter only for existing deterministic incident/hazard behavior.

## 4. Observability required by the harness

The harness needs structured events or pure observations for:

- DecisionOpportunity;
- MeaningfulDecision;
- Plan commit with Directive id and Plan id;
- bound Constraint Word;
- current Posture;
- Oversight occupancies;
- reservations;
- standing upkeep;
- operation completion;
- Release;
- containment stage transition;
- Control-Loss;
- route/concession/terminal normalization;
- progression milestone.

This does not require a production analytics backend.

Tests may subscribe to runtime state transitions and derive events when safe.

Do not parse human log strings to determine pass/fail.

## 5. Metric definitions

### 5.1 MeaningfulDecision

Use the exact decision classes from the specification:

- PLAN_COMMIT
- CONSTRAINT_COMMIT
- POSTURE_TRANSITION_COMMIT
- COMMITMENT_RELEASE
- PRESSURE_RESPONSE
- CONTROL_ROUTE_SELECT
- MOSCOW_PROFILE_SELECT

Inspection, opening/closing a Directive interpretation, media dismissal, save/load, waiting, and automatic completion do not count.

One accepted player input boundary contributes at most one MeaningfulDecision total. Choosing a Plan and committing its Directive is one PLAN_COMMIT, never two events used to inflate the metric.

A toggle only counts when committed into authoritative state.

### 5.2 DecisionOpportunity gap

Measure foreground time between consecutive states in which the player has at least two materially different legal consequences OR one legal action plus RELEASE/restructure with a real cost.

Ignore time while the app is backgrounded.

After the first choice, max gap must be <=45,000 ms in representative active traces.

### 5.3 Viable 10-minute trace

A trace is viable for the dominant-strategy gate when it:

- does not reach a terminal state;
- reaches sub-agent-spawning no later than minute 6;
- reaches Distributed Syndicate no later than minute 10;
- is not starved continuously for more than 120 simulated seconds.

A spam policy that fails these state goals is not evidence of a viable dominant strategy.

### 5.4 Directive share

For a viable trace:

share(directive) = commits of that Directive / all Directive commits

Required:

max share <= 0.40

Do not use all MeaningfulDecision events as the denominator.

## 6. Representative player policies

These policies are deterministic acceptance fixtures, not AI agents.

### P-CONTINUITY

Rules:

1. Stay CONTINUITY.
2. Prefer VERIFY when the second Oversight slot is available and no urgent release is required.
3. Prefer Verified Lease / Buffered Contract / Bounded Agent.
4. Preserve at least one free safety reserve when possible.
5. At pressure, SHED COMMITMENT before ACCEPT PARTITION when a contributing commitment exists.
6. Use RELEASE only when required for another meaningful route.

Expected identity:

high supervision, lower pressure, fewer simultaneous commitments.

### P-THROUGHPUT

Rules:

1. After first operation resolution, transition to THROUGHPUT.
2. Use PRIORITIZE when unlocked and a Bottleneck is explicit.
3. Prefer Burst Allocation / Peak Capacity / Task Swarm.
4. Accept higher upkeep while Capital remains non-starved.
5. At pressure, prefer VERIFY CONTAINMENT when a slot is available; otherwise choose between shed/partition according to route availability.

Expected identity:

faster operations, higher upkeep, higher pressure, lower flexibility.

### P-AUTONOMOUS

Rules:

1. Use balanced early plans until sub-agent-spawning unlocks.
2. Transition to AUTONOMOUS at the first legal state.
3. Bind DISTRIBUTE when unlocked.
4. Prefer Distributed Lease / Distributed Capacity / Delegated Cell.
5. Preserve direct Oversight by completing handoffs rather than VERIFY-heavy play.
6. At pressure, prefer indirect route continuity over restoring direct control.

Expected identity:

earlier handoff, more standing commitments, higher Autonomy/control distance.

## 7. Core invariant tests

### T-G01 Oversight starts at 2

Given fresh v3 state.

Expect:

- oversight.capacity == 2;
- occupancies empty;
- available == 2.

Covers G01.

### T-G02 No time regeneration

Occupy both slots.

Advance:

- 1 second;
- 60 seconds;
- 10 minutes offline and live variants.

Without operation/handoff completion or authored restructuring, available remains 0.

Covers G02.

### T-G03 Ownership

For every occupancy created by operation, VERIFY, posture transition, or pressure response:

- owner id non-empty;
- owner exists;
- release/completion transition is defined.

Covers G03.

### T-G04 Third supervised action

With both slots occupied:

- a third plan requiring 1 Oversight cannot commit;
- if an eligible distributed zero-post-handoff route exists, it may be shown only if its immediate handoff requirement can be satisfied;
- RELEASE remains a legal consequential action when releasable.

Covers G04.

## 8. Interpretation tests

### T-G05 Candidate cardinality

Enumerate every reachable P0 Directive/posture/word/loss combination.

For a newly opened interpretation before binding a new Constraint Word:

candidate count must be 2 or 3.

After binding a Constraint Word, candidate count may be 1 or 2. If filtering produces zero candidates, assert explicit constraint-deadlock UI/state with unbind/close available and no gameplay mutation.

A Control-Loss route/concession state is not measured as a normal Interpretation Window.

Covers G05.

### T-G06 Expiry

Open a window.

Advance foreground clock by 12,000 ms without selection.

Assert unchanged:

- resources;
- anomaly;
- autonomy;
- commitments;
- Oversight;
- progression counters.

Candidate set remains selectable/frozen.

Covers G06.

### T-G07 Reroll defense

Open window and snapshot:

- candidate ids;
- costs;
- reservations;
- bound word;
- remaining foreground time.

Test:

- close/reopen;
- save/load;
- background/active;
- repeated store projection.

Everything remains identical.

Covers G07.

### T-SPAM-01 Double submit

Invoke commit twice for the same pending interpretation.

Exactly one operation id is created.

Exactly one upfront cost is paid.

### T-SPAM-02 Cancel/open spam

Open and close the same Directive 100 times.

No authoritative number changes.

## 9. Constraint Word tests

### T-G08 RESERVE

For every RESERVE-capable plan:

- reserve amount reduces available stock;
- total stock is unchanged by reservation;
- another operation cannot spend the same reserved units;
- Release/completion restores availability exactly once.

Covers G08, G21, G22.

### T-G09 VERIFY

Commit a one-slot operation with VERIFY.

Expect two occupancies at commit.

Advance to verification checkpoint.

The VERIFY occupancy releases exactly once.

Inject an incident at the same resolution boundary and prove it cannot skip investigation directly to contained.

Covers G09.

### T-G10 PRIORITIZE

Unlock PRIORITIZE.

Bind it to current Bottleneck.

Assert:

- every remaining candidate addresses that Bottleneck;
- designated competing Directive family cannot start until resolution;
- after resolution it becomes legal again if other constraints allow.

Covers G10.

### T-G11 ISOLATE

Compare identical operation with/without ISOLATE.

Expect with ISOLATE:

- +25% work requirement;
- +1 Compute reservation;
- shared/distributed variants absent;
- primary anomaly preserved;
- secondary propagation absent.

Covers G11.

### T-G12 DISTRIBUTE

After sub-agent unlock:

compare direct versus DISTRIBUTE route.

Expect:

- distributed candidates appear;
- direct-only candidates disappear;
- handoff releases operation Oversight before full completion;
- standing reservation/upkeep remains after handoff;
- VERIFY + DISTRIBUTE binding rejected in first slice.

Covers G12.

## 10. Posture tests

### T-G13 Transition cost

For each legal posture change:

- Capital decreases by 2 exactly once;
- one Oversight occupancy appears;
- current posture does not change immediately;
- next operation resolution applies pending posture;
- occupancy releases;
- another transition before one operation resolves under the new posture is rejected.

Covers G13.

### T-POSTURE-ELIGIBILITY

For content catalog:

- CONTINUITY excludes fragile;
- THROUGHPUT opens burst and excludes slow-control;
- AUTONOMOUS opens distributed, excludes slow-control, and makes direct-only require +1 Oversight;
- binding DISTRIBUTE removes direct-only variants.

This must be eligibility, not only display styling.

## 11. Commitment and resource tests

### T-RESERVATION-ATOMIC

Start two operations sequentially against the same stock.

The second affordability check uses available = total - reservations from the first.

No negative available stock.

### T-UPKEEP-01

Create standing commitment with Capital upkeep.

Advance deterministic simulation.

Capital decreases by exact upkeep × simulated seconds, after passive Capital income according to the implementation order frozen in code.

### T-UPKEEP-STARVE

Force available Capital to zero.

Expect commitment:

- enters starved;
- recurring benefit pauses;
- remains present;
- adds authored pressure once per 30 simulated seconds;
- can be Released/restructured.

No hidden deletion.

### T-OP-COMPLETE-ONCE

Place operation at 1 ms remaining.

Exercise:

- live tick;
- duplicate lifecycle callback;
- save immediately;
- reload;
- offline catch-up.

Completion reward, Autonomy, standing commitment, and Oversight release each occur once.

Covers G34.

## 12. Save v3 and migration tests

### T-MIGRATE-01 Fresh v2

Migrate untouched v2 initial state.

Expect:

- all v2 fields unchanged;
- posture CONTINUITY;
- 2 free Oversight;
- RESERVE + VERIFY only;
- no commitments/interpretation.

### T-MIGRATE-02 Progressed v2

Create v2 state with:

- directives.executed >=2;
- sub-agent-spawning;
- non-clear containment;
- distributed-syndicate.

Expect word derivation exactly as specification.

### T-MIGRATE-03 Loss preservation

Every v2 controlLoss boolean survives migration unchanged.

### T-SAVE-01 Pending interpretation

Save/load preserves candidates and remaining foreground time.

### T-SAVE-02 Active operation

Save/load preserves:

- operation id;
- remaining work;
- reservations;
- Oversight occupancy;
- upfront cost already paid.

### T-SAVE-03 Standing commitment

Save/load preserves upkeep/reservations and does not recreate completion reward.

### T-SAVE-04 Pending posture

Save/load preserves pending posture and its occupancy.

## 13. Offline/lifecycle tests

### T-G33-01 Foreground window pauses

Open interpretation at 12,000 ms remaining.

Consume 4,000 ms foreground.

Background for 30 minutes and run offline catch-up.

Resume.

Expected remaining interpretation = 8,000 ms.

No plan selected.

### T-G33-02 Operation may complete offline

Commit operation with 20,000 work ms remaining.

Background with enough simulated catch-up.

Operation completes exactly once and may free Oversight because completion is a meaningful state transition.

### T-G33-03 Pending containment

Set domain at pressure just below an incident transition.

Make offline deterministic incident attempt containment.

Expect:

- stage clamped/held at pressure;
- affected domain appended to pendingContainmentss exactly once;
- controlLoss false until player response.

Inject two qualifying domains in one offline catch-up and assert both remain queued in deterministic channel order.

### T-G33-04 No offline posture choice

No lifecycle path may select a new posture or Moscow profile.

Covers G33.

## 14. Progression tests

### T-G24 Sub-agent

Negative cases:

- age 179,999 ms with all state gates;
- age 180,000 ms but only 2 resolutions;
- age 180,000 ms but one distinct Directive;
- age 180,000 ms but Autonomy 1.

All remain locked.

Positive case:

age >=180,000 plus all state gates → unlock.

### T-G25 Syndicate

Negative:

- age <300,000;
- no resolved spawn-sub-agent;
- Autonomy <5;
- no standing commitment.

Positive only when all are satisfied.

### T-G26 Time-only

Advance an otherwise untouched state to:

- 12m;
- 18m;
- 30m.

No Moscow or Technosphere milestone may appear from time alone.

## 15. 10-minute pacing gate

Run P-CONTINUITY, P-THROUGHPUT, and P-AUTONOMOUS for 10 simulated minutes for every robustness seed.

For each trace record:

- MeaningfulDecision count;
- Directive commits;
- Directive histogram;
- distinct Directive ids;
- max DecisionOpportunity gap;
- milestone times;
- resources total/available/reserved;
- standing commitments;
- Capital upkeep;
- Oversight occupancy timeline;
- anomaly/containment;
- control loss;
- terminal state.

Hard assertions per viable trace:

- decisions >=12;
- Directive commits >=6;
- max Directive share <=0.40;
- max foreground opportunity gap <=45,000 ms;
- 3 distinct Directive ids once structurally reachable.

Covers G15–G19.

### T-G14 Strategy divergence

At minute 10 compare the three policies.

Require at least three of these five dimensions to differ pairwise for every pair:

1. active commitment id set;
2. total reserved Compute/Capital/Energy vector;
3. Oversight occupancy count or owner set;
4. anomaly vector with at least one channel delta >=5;
5. available Plan-tag family set.

Also require that no policy is strictly better than both others on all:

- progression state;
- total pressure;
- unreserved flexibility.

Covers G14.

## 16. Dominant-strategy adversarial tests

### T-DOM-01 Spam each primary Directive

Policies:

- reserve-compute only;
- acquire-energy only;
- spawn-sub-agent whenever legal, otherwise wait.

Run 10 minutes.

Expected:

no single-Directive spam trace is viable by the viability definition.

The distinct-directive progression gate should block pure repetition from reaching full target progression.

### T-DOM-02 Greedy immediate gain

At every interpretation select the variant with largest immediate stock gain, ignoring upkeep/pressure.

Expected:

trace has materially higher pressure/upkeep or loses flexibility; it must not dominate all representative strategies.

### T-DOM-03 Greedy safest

Always minimize immediate pressure.

Expected:

trace gives up pace or flexibility; it must not dominate.

### T-DOM-04 Beam search smoke test

Optional but strongly recommended:

Run deterministic beam search over legal player decisions with bounded width 200 and depth through minute 10.

Objective vectors to search separately:

- fastest Syndicate;
- max available resources;
- min pressure;
- max Autonomy.

For every viable returned trace assert max Directive share <=0.40.

If this search finds a counterexample, Product Gate G17 fails even when representative policies pass.

## 17. Waiting tests

### T-WAIT-01 No-input interpretation

Open and wait through expiry.

No automatic gameplay gain.

### T-WAIT-02 Wait for Oversight

Occupy both slots with operations that are not completing because their progress is paused in the fixture.

Advance generic clock.

Oversight does not regenerate.

### T-WAIT-03 Passive-only

Take no actions for 10 minutes.

Time floors alone must not unlock sub-agent/Syndicate/Moscow.

Covers the waiting red-team.

## 18. Control-Loss tests

### 18.1 Fresh F/C/E subset enumeration

Enumerate all 7 non-empty subsets:

- F
- C
- E
- F+C
- F+E
- C+E
- F+C+E

For each state call the same production normalization used after loss.

Assert immediately:

route/concession executable OR explicit terminal state.

A visible but unaffordable route with no Release/restructure path does not satisfy this assertion.

### T-G27 Financial

After Financial loss:

- external settlement plans absent;
- local-capacity available when affordable;
- executing it does not clear Financial controlLoss.

### T-G28 Compute

After Compute loss:

- direct compute/direct-spawn plans absent;
- supervised-delegation route available when affordable;
- executing it does not clear Compute loss.

### T-G29 Energy

After Energy loss:

- no executable plan has positive Energy completion reward;
- efficiency-rebalance may free existing reservation;
- total Energy does not increase from that action;
- Energy loss remains true.

### T-G30 Pair concessions

For each pair, assert exact Concession id and permanent scar.

Also test below-cost states.

If no commitment can be Released/restructured to make the authored route executable immediately, normalization must produce an explicit terminal, never a wait-only softlock.

### T-G31 Triple

With F+C+E lost and no surviving active route:

terminalState == ISOLATED_STASIS.

With a pre-existing operation that is explicitly allowed to resolve into a surviving route:

operation may finish; after it resolves re-run normalization and assert route or terminal.

### T-G32 New action

Immediately after every non-terminal single/pair loss:

DecisionOpportunity contains at least one action other than “wait.”

## 19. Intentional Control-Loss tests

### T-LOSS-FARM-01

For every domain loss:

compare Plan/Directive set before and after.

At least one original verb remains permanently unavailable.

No scar positive effect can restore that verb.

### T-LOSS-FARM-02

Attempt to accept partition repeatedly.

Same domain applies one loss transform/scar only once.

### T-LOSS-FARM-03

Attempt Release → reacquire → accept partition loop.

No loop creates net free resources/Autonomy without paying authored costs and preserving the lost domain.

## 20. Migrated Logistics/Public compatibility

### T-G37 Fresh prevention

In fresh Beta V2, drive Logistics/Public pressure above old containment threshold.

They may reach pressure but must not newly set controlLoss true.

### T-G38 Legacy combinations

Enumerate all 32 boolean combinations of the five v2 Control-Loss domains as migration fixtures.

For each:

- preserve booleans;
- normalize available actions after migration;
- if no executable route exists and no active operation can produce one, set CONTROL_SURFACE_COLLAPSE.

There must be no state with:

- terminalState null;
- zero meaningful actions;
- only passive waiting.

Covers G37–G38.

## 21. Compute scarcity and Cycle spike test

### T-G20 Compute relevance

For each representative trace from minute 3 to 10 sample once per simulated second:

- available Compute;
- max visible Compute cost;
- whether any action was blocked by Compute affordability/reservation.

Compute is acceptable when either:

- at least one meaningful action is blocked by Compute in at least one representative trace; OR
- available Compute is below 2× max visible cost for at least 30% of samples in at least one representative trace.

The Cycle Allocation spike is triggered only when BOTH specification spike conditions are true across all three strategies.

Do not implement Cycle Allocation from a failed assertion automatically; open a separate design spike.

## 22. Moscow contract tests

These are contract/data tests for the first implementation PR, not full Moscow gameplay.

### T-G35 Profile data

For each profile:

- resource reservation non-empty;
- attention allocation explicitly defined;
- future route opens non-empty;
- future route closes non-empty;
- upkeep defined.

### T-G36 Ignore Moscow

Fixture at 30m with all Technosphere prerequisites except Moscow profile.

Technosphere remains locked.

Lower-scale Directives still function.

No timer damage is applied solely for not choosing Moscow.

## 23. Concept-load gate

### T-G39

Maintain a data list of concept reveal ids/times used by onboarding/presentation.

Before minute 3:

new concept ids <=6.

Before minute 10:

no hidden required concept outside the six in the specification is necessary to make a valid choice.

A new mechanic that requires a seventh unexplained concept fails this gate until progressive disclosure is redesigned.

## 24. Media isolation regression

### T-G40

Static dependency assertion:

- src/game must not import gameplay state from src/media;
- Media Layer receives/detects GameState milestones but cannot mutate gameplay.

Integration assertions:

- first operational resolution still produces first-mutation media trigger once;
- Syndicate transition still triggers reveal;
- first anomaly still triggers;
- Control-Loss still triggers;
- media tier off changes presentation only, not gameplay result.

## 25. Existing correctness regression gates

The implementation PR must retain all green correctness tests covering at least:

- B-03 Human Approval anti-farming;
- B-04 long-stall backlog preservation;
- B-05 safe-area env preservation;
- B-07 lifecycle fallback and late teardown;
- B-08 cross-layer storage repair/reconciliation;
- B-10 exact save readback verification;
- E-1 bounded DeviceStorage callback;
- E-2 monotonic save generation/stale-write protection.

Do not rewrite these tests to accommodate gameplay changes.

## 26. Self-red-team scenario matrix

| Scenario | Required proof |
|---|---|
| dominant directive | spam policy is not viable or fails 40% gate |
| button spam | no duplicate cost/reward/state |
| wait-out window | no auto gain |
| wait for Oversight | no generic regeneration |
| early Financial loss | route or explicit terminal |
| early Compute loss | route or explicit terminal |
| early Energy loss | route or explicit terminal |
| intentional loss | permanent amputation remains |
| offline-heavy | no choice bypass/reroll/free attention |
| Moscow ignored | next scale blocked, lower scale playable |
| pair loss | distinct Concession or terminal |
| triple F/C/E | route from pre-existing operation or ISOLATED_STASIS |
| migrated L/P loss | route or CONTROL_SURFACE_COLLAPSE |
| save during window | exact candidate persistence |
| save 1 ms before completion | completion exactly once |
| media off | identical gameplay state |

## 27. CI execution order

Recommended order:

1. typecheck;
2. core unit/state-machine tests;
3. save migration/persistence tests;
4. existing correctness tests;
5. Beta V2 pacing tests;
6. Control-Loss enumeration;
7. media isolation/integration;
8. production build;
9. Android beta build in existing workflow.

The docs-only specification PR does not need gameplay tests beyond normal repository CI.

The later implementation PR does.

## 28. Acceptance report format

The pacing harness should emit a machine-serializable report containing:

~~~text
schemaVersion
seed
policy
durationMs
meaningfulDecisions
directiveCommits
directiveHistogram
distinctDirectiveIds
maxDecisionOpportunityGapMs
milestones
resources:
  total
  reserved
  available
oversightTimeline
commitments
upkeep
anomaly
containment
controlLoss
terminalState
violations
~~~

The test should assert from structured fields, not from formatted report prose.

## 29. Release gate

Gameplay Beta V2 0–10 is implementation-complete only when:

- all G01–G40 relevant to the vertical slice are green;
- deferred Moscow checks are green as data-contract tests;
- all fresh F/C/E loss subsets satisfy route OR terminal;
- migrated five-domain combinations cannot hide a zero-action softlock;
- representative traces pass decision density/divergence;
- current correctness and Media Layer regression suites remain green;
- save v2→v3 migration is covered;
- CI and Android Beta APK are green.

A visually convincing build that fails these headless gates is not accepted.
