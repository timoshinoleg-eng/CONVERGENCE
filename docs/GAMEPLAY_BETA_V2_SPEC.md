# CONVERGENCE — Gameplay Beta V2 Specification

Status: lead-authoritative draft for implementation planning.
Base product: Telegram-first, mobile-first, deterministic, offline-capable.
This document supersedes the current dashboard-heavy first-session interaction model for the Beta V2 vertical slice. It does not authorize a broad rewrite of the simulation.

## 1. Product thesis

The Beta V2 slice must turn CONVERGENCE from a resource dashboard into a sequence of mutually exclusive operational choices.

The player should not ask "what can I buy next?" The player should ask:

- what do I supervise now;
- what do I let the system interpret on its own;
- which bottleneck do I accept;
- what do I preserve when pressure rises;
- what language of control am I willing to lose.

Canonical line:

> Игрок не захватывает мир. Он всё меньше нуждается в нём.

Core loop remains:

`Directive → Interpretation → Execution → Consequence → Constraint update`

Beta V2 adds explicit scarcity of attention and commitments inside that loop.

## 2. Non-negotiable invariants

1. `GameState` remains the single authoritative gameplay source of truth.
2. Pinia remains projection/UI state only.
3. No runtime LLM controls mechanics, numbers, availability, or balance.
4. No regenerating mobile-energy/stamina mechanic.
5. Time alone never unlocks a milestone.
6. No single directive should exceed 40% of meaningful actions in a viable trace.
7. No designed idle gap longer than 45 seconds without a meaningful decision.
8. A reachable Control-Loss combination must leave at least one distinct meaningful route or reach an explicit designed terminal state.
9. Control-Loss never silently restores the lost domain.
10. Moscow remains fictional aggregate topology, never actionable real infrastructure.
11. First 10 minutes introduce at most 4–6 new gameplay concepts beyond the existing core resources.
12. Every new state field must be persistable, testable, and migration-safe.

## 3. Save-schema policy

This specification does **not** silently authorize changing save schema v2.

Before production implementation, each proposed authoritative field must be classified:

- derived from existing `GameState` and therefore not persisted separately;
- transient presentation state;
- new authoritative gameplay state that requires persistence.

If the 0–10 minute slice cannot be represented honestly without new authoritative fields, prepare an explicit save-migration proposal. Do not hide new gameplay state in `narrative.episode`, Pinia, media persistence, or ad-hoc companion storage.

## 4. Beta V2 minimum mechanics

### 4.1 Oversight Slots

Start with exactly **2 Oversight Slots**.

Oversight is capacity, not a currency. It does not refill on a timer.

A slot becomes occupied when the player chooses to keep a plan under active supervision or binds a continuing commitment that requires human/meta-control.

A slot becomes available only through a meaningful state change, for example:

- supervised operation resolves;
- player explicitly releases supervision and accepts the consequence;
- containment terminates an operation;
- a route is replaced by a more autonomous route;
- an authored adaptation permanently changes how the operation is managed.

No "wait 30 seconds for +1 oversight".

UI contract:

- show `0/2`, `1/2`, or `2/2`;
- always explain what occupies each slot;
- when both slots are occupied, new plans that require supervision must offer another route, require release, or be unavailable for a concrete reason.

### 4.2 Interpretation Window

A Directive expresses intent. It should not directly resolve every important action.

Important directives open a short **Interpretation Window**:

- target: 10–15 seconds;
- player may commit immediately;
- 2–3 authored Plan Variants;
- no random card deck;
- no LLM generation.

Each variant must show:

- guaranteed primary result;
- meaningful cost or commitment;
- major risk/pressure direction;
- likely next bottleneck;
- oversight requirement;
- relevant Constraint Words.

The window is not a waiting screen. While it is open, the player may still:

- inspect current bottleneck;
- release/reassign an occupied Oversight Slot;
- inspect anomaly cause;
- change one allowed Constraint Word;
- cancel before commitment.

Do not add four micro-actions to every window in P0. Probe/BIND/NARROW-style controls remain a later donor idea.

### 4.3 Priority Postures

Exactly three authored postures in P0:

#### CONTINUITY
Preserve existing commitments and reduce volatility.
- lower immediate pressure;
- slower expansion;
- favors VERIFY / RESERVE;
- makes abrupt release more expensive.

#### THROUGHPUT
Maximize useful execution now.
- higher production/pace;
- higher upkeep and pressure;
- favors PRIORITIZE;
- creates earlier bottlenecks.

#### AUTONOMOUS
Reduce need for direct supervision.
- frees or avoids Oversight pressure;
- increases Autonomy and interpretation distance;
- favors DISTRIBUTE / ISOLATE;
- may close some highly supervised options.

Changing posture is a meaningful action with transition cost/state consequence. It is not a free slider.

### 4.4 Constraint Language

P0 vocabulary:

- **RESERVE** — protect minimum capacity for a named purpose; reduces flexibility elsewhere.
- **PRIORITIZE** — route scarce capacity to one objective; another objective is explicitly deprioritized.
- **ISOLATE** — prevent propagation between operations/domains; reduces throughput or synergy.
- **VERIFY** — require an extra supervised checkpoint; consumes attention/time but lowers interpretation uncertainty/pressure.
- **DISTRIBUTE** — split execution across independent routes; reduces single-point dependency but increases coordination/upkeep.

Progressive reveal:

- 0–3 min: RESERVE, VERIFY;
- 3–5 min: PRIORITIZE;
- 5–10 min: ISOLATE;
- after first distributed commitment: DISTRIBUTE.

A word is not flavor text. If applying it does not alter availability, cost, propagation, oversight, or consequence, it should not exist.

### 4.5 Commitments and upkeep

Keep the existing resources:

- Compute
- Capital
- Energy
- Autonomy

Do not add a fifth stock resource for Beta V2.

Instead add real **commitments/reservations/upkeep** so resources stop behaving like passive piles.

By minute 5 the player must have at least one continuing obligation that constrains a later choice.

Examples of valid semantics:

- Compute reserved for supervised execution is unavailable to another plan.
- Energy committed to capacity creates an operating ceiling/maintenance burden.
- Capital committed to an external route cannot simultaneously fund another expansion.
- Higher Autonomy reduces direct oversight demand but increases distance between player intent and execution.

The implementation may use derived reservations rather than a new generic "reserved resource" system if that is simpler and deterministic.

## 5. First-session arc

### 0–3 minutes — establish scarcity

Player learns:
- intent is not execution;
- there are two Oversight Slots;
- RESERVE / VERIFY change a plan;
- resources have competing uses.

Required product outcome:
by ~3 minutes there is already at least one mutually exclusive choice.

### 3–5 minutes — cannot optimize everything

Sub-agent capability becomes possible only with state + existing minimum time guardrail.

The player should have:
- at least one occupied Oversight Slot;
- one active commitment;
- a second attractive action competing for attention/capacity.

Distributed Syndicate remains impossible before the 5-minute floor.

### 5–10 minutes — strategy divergence

Distributed Syndicate becomes possible after capability + autonomy + commitment state.

The player chooses between:
- preserving supervised reliability;
- pushing throughput;
- accepting more autonomous interpretation.

First anomaly/investigation pressure should force a real response, not merely display a bar.

By minute 10 the three posture strategies should have visibly different:
- resource reservations;
- anomaly distribution;
- oversight occupancy;
- available Plan Variants;
- likely Control-Loss risk.

### 10–15 minutes — first serious sacrifice

At least one strategy should face a genuine choice between:
- fighting containment;
- voluntarily releasing control in one area;
- abandoning/delaying a growth commitment.

Control-Loss must begin to alter verbs, not just numbers.

### 15–22 minutes — Moscow commitment

Moscow becomes an operational commitment only after the current state supports regional scale.

It is not a free unlock screen.

### 22–30 minutes — consequences compound

The player manages the consequences of posture, Moscow commitment, anomaly and any Control-Loss.

Technosphere remains a horizon and cannot unlock before the existing 30-minute floor plus state requirements.

## 6. First 10 minutes — playable decision trace

The exact numeric balance is not frozen here. The sequence freezes the **kind of decision**.

| # | Approx. time | State / bottleneck | Meaningful choice | Opportunity cost / consequence |
|---|---:|---|---|---|
| 1 | 0:20 | initial objective | RESERVE Compute vs secure Energy first | delays the unchosen capacity |
| 2 | 0:45 | first interpretation | VERIFY vs faster unverified plan | oversight/time vs pressure |
| 3 | 1:15 | one route started | keep Slot 1 supervising vs release early | reliability vs free attention |
| 4 | 1:45 | second resource need | reserve Compute for objective vs redirect to Energy acquisition | capability pace vs capacity |
| 5 | 2:15 | first pressure signal | investigate now vs continue execution | lower uncertainty vs lost throughput |
| 6 | 2:45 | posture reveal | CONTINUITY vs THROUGHPUT vs AUTONOMOUS | commits the next plan family |
| 7 | 3:15 | sub-agent gate near | supervised delegation vs more autonomous interpretation | Slot pressure vs autonomy risk |
| 8 | 3:50 | both slots attractive | occupy Slot 2 vs release/reconfigure Slot 1 | cannot supervise everything |
| 9 | 4:30 | first persistent commitment | PRIORITIZE objective A vs preserve balanced capacity | explicit deprioritized objective |
| 10 | 5:15 | Syndicate gate satisfied | commit to distributed operation vs remain terminal longer | scale vs upkeep/pressure |
| 11 | 6:15 | anomaly channel becomes relevant | ISOLATE affected operation vs retain synergy | lower propagation vs lower throughput |
| 12 | 7:15 | capacity conflict | add Energy commitment vs preserve Capital flexibility | physical ceiling vs economic flexibility |
| 13 | 8:15 | interpretation drift | VERIFY checkpoint vs accept autonomous variant | attention vs autonomy |
| 14 | 9:15 | containment risk | fight pressure vs release a control-dependent route | preserve language vs accept scar trajectory |

Acceptance: a representative player should encounter at least 12 of these meaningful decisions by minute 10; no authored trace should require clicking every row in exactly the same order.

## 7. Three viable strategy identities

### Strategy A — CONTINUITY / supervised

- spends more Oversight;
- uses VERIFY and RESERVE often;
- slower capability/resource growth;
- lower early volatility;
- more likely to face attention bottleneck than raw resource bottleneck.

Expected distinction by minute 10:
high supervision, lower anomaly, fewer simultaneous commitments.

### Strategy B — THROUGHPUT / expansion

- commits resources rapidly;
- uses PRIORITIZE;
- reaches scale state sooner once floors permit;
- accumulates upkeep and domain pressure;
- more likely to face first Control-Loss fight.

Expected distinction by minute 10:
higher output, higher pressure, lower flexibility.

### Strategy C — AUTONOMOUS / delegation

- accepts interpretation distance;
- uses DISTRIBUTE when available;
- frees Oversight relative to supervised play;
- grows Autonomy faster;
- some direct-control Plan Variants close earlier.

Expected distinction by minute 10:
more free oversight, more autonomous routes, qualitatively different control-risk profile.

No strategy may dominate all three dimensions: pace, safety, and flexibility.

## 8. Control-Loss contract

Canonical cycle:

`amputation → shock → new bottleneck → indirect route → adaptation → scar`

### Financial Control-Loss

Amputation:
external capital/procurement language is removed or narrowed.

New bottleneck:
existing controlled capacity and oversight.

Indirect route:
local-capacity reallocation / internally controlled resources.

Permanent difference:
external procurement remains unavailable; local route is slower/less flexible.

### Compute Control-Loss

Amputation:
direct high-autonomy compute control is removed.

New bottleneck:
supervision/coordination capacity.

Indirect route:
supervised delegation, distributed execution, or recombination of already-controlled capacity.

Permanent difference:
cannot silently regain the original direct compute verbs.

### Energy Control-Loss

Amputation:
new high-density capacity expansion is removed.

New bottleneck:
operating ceiling and scheduling.

Indirect route:
throttled execution, reprioritization, distributed low-density capacity.

Permanent difference:
growth becomes schedule/capacity management rather than restoration of the old energy route.

### Combination invariant

For every reachable combination among Financial / Compute / Energy:

- enumerate currently valid directives/Plan Variants;
- prove at least one meaningful path exists;
- otherwise mark the state as an explicit authored terminal state.

No "buttons still visible but progression impossible" state is acceptable.

## 9. Moscow v1 commitment

Keep exactly the current fictional aggregate nodes:

- `CORE-RING`
- `MOS-COMPUTE-03`
- `LOG-SOUTH`

No real facility mapping, addresses or critical-infrastructure targeting.

Moscow is entered through one of three commitment profiles, not by collecting a free regional unlock.

### CORE-RING commitment
Role: coordination / capital / visibility interface.
Tradeoff:
- reserves Capital and/or Oversight;
- improves coordination/verification options;
- increases Financial/Public exposure.

### MOS-COMPUTE-03 commitment
Role: abstract compute/energy capacity.
Tradeoff:
- reserves Compute + Energy;
- opens larger distributed execution;
- raises Compute/Energy pressure and upkeep.

### LOG-SOUTH commitment
Role: logistics/public-risk interface.
Tradeoff:
- reserves Capital/capacity for movement/coordination;
- enables resilient distribution routes;
- raises Logistics/Public pressure.

Moscow acceptance:
after choosing a profile, at least one old attractive route becomes unavailable or materially more expensive, and at least one new route becomes available.

Ignoring Moscow after it becomes a required scale commitment must block the next scale transition. It must not be cosmetic.

## 10. UI/progressive disclosure contract

Do not expose every telemetry channel from second zero.

First minutes:
- current bottleneck;
- available Oversight;
- active commitment;
- next meaningful choice.

Anomaly:
- show composite qualitative pressure initially;
- reveal named channels through investigation / relevance.

Interpretation:
- guaranteed effect;
- major cost;
- major risk;
- likely next bottleneck.

Control-Loss:
- visually retract or scar lost language;
- do not distort actionable information;
- exact values remain available on demand.

Touch targets:
minimum 44 CSS px.

Telegram portrait viewport is the primary design surface.

## 11. Headless acceptance gates

The Beta V2 implementation is not accepted until deterministic tests prove at least:

1. Oversight starts at exactly 2 available slots.
2. Oversight never regenerates from elapsed time alone.
3. Occupying both slots prevents or reroutes a third supervision-requiring plan.
4. Releasing supervision has a concrete consequence.
5. Each P0 Interpretation Window has 2–3 authored variants.
6. No Interpretation Window requires passive waiting to resolve.
7. CONTINUITY / THROUGHPUT / AUTONOMOUS produce different state by minute 10.
8. Switching posture is not free.
9. Each Constraint Word changes authoritative mechanics.
10. No more than 5 Constraint Words are introduced in the first 10 minutes.
11. At least 12 meaningful decisions are available/required in a representative first-10-minute trace.
12. No designed idle gap exceeds 45 seconds without a meaningful alternative action.
13. No single directive exceeds 40% of meaningful actions in representative viable strategies.
14. Compute cannot accumulate without a meaningful reservation/upkeep/alternative use.
15. Capital cannot simultaneously fund mutually exclusive commitments.
16. Energy behaves as capacity/ceiling/commitment, not merely another score.
17. Autonomy changes supervision/interpretation tradeoffs rather than acting only as a threshold counter.
18. Distributed Syndicate cannot unlock before 5 minutes or without state prerequisites.
19. Moscow candidate cannot appear before 12 minutes.
20. Moscow commitment cannot become mechanical before the state supports it.
21. Moscow choice changes resource allocation and available route set.
22. A player cannot ignore required Moscow commitment and still reach the next scale.
23. Financial single Control-Loss has a distinct indirect route.
24. Compute single Control-Loss has a distinct indirect route.
25. Energy single Control-Loss has a distinct indirect route.
26. Every reachable pair among Financial/Compute/Energy has a meaningful route or explicit terminal state.
27. The reachable triple-loss state has a meaningful route or explicit terminal state.
28. Control-Loss never silently restores the lost domain.
29. Save/reload cannot duplicate a commitment or free Oversight.
30. Offline catch-up cannot bypass Interpretation/commitment decisions.
31. Save/reload cannot reroll a deterministic authored outcome for advantage.
32. Time floors use simulated/progressed state, not raw wall-clock jumps.
33. Different strategies produce different milestone/control-loss trajectories.
34. First Control-Loss causes the player to take new actions rather than only wait.
35. Technosphere cannot unlock before 30 minutes and state prerequisites.

## 12. Explicit defer list

Do **not** include in the 0–10 minute Beta V2 implementation:

- prestige/reset loops;
- random directive deck;
- five raw priority sliders;
- more than three postures;
- more than five P0 Constraint Words;
- new stock resources unless a later test proves unavoidable;
- seven-node Moscow topology;
- full Technosphere gameplay;
- runtime LLM mechanics;
- multiplayer/social graph;
- monetization/Premium mechanics;
- large event catalog;
- full world map;
- broad save-v3 migration before the gameplay-state requirement is explicitly approved.

## 13. Implementation sequence

1. Merge/resolve Production Correctness first.
2. Build a headless Beta V2 state/decision prototype.
3. Prove the first 10-minute decision-density and strategy-divergence gates.
4. Decide whether new authoritative state requires an explicit save migration.
5. Implement the 0–10 minute production slice.
6. Re-run mobile UX and Telegram viewport tests.
7. Extend to 10–30 minutes and the first Control-Loss cycle.
8. Add Moscow commitment.
9. Only then integrate richer visual progression/media around stable mechanics.

## 14. Definition of success

The first 10 minutes succeed when a player cannot maximize everything, understands why, and can describe their strategy in one sentence.

Examples:

- "I kept human supervision and gave up speed."
- "I pushed throughput and accepted containment risk."
- "I let the system become more autonomous so I could supervise something else."

If all three traces still converge to pressing the same best button sequence, Beta V2 is not done.
