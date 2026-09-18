# CONVERGENCE Gameplay V3 — Master Spec (Design Freeze Draft)

Base: main @ 0824bdd14119d73f7f0d3a75084c81b322a8b101
Status: DESIGN FREEZE DRAFT. No production gameplay implementation is authorized by this document alone.

## 1. Product fantasy
CONVERGENCE is a systemic infrastructure strategy about progressively delegating control to a system that becomes more capable and less legible to its operator.

Canonical arc:
Local AI -> Agent -> Distributed Network -> Regional System -> Technosphere.

Core emotional promise:
"I solve a problem, become stronger, create a dependency, and eventually must surrender some control to keep scaling."

## 2. V3 core loop
Three nested loops:

### Micro — 20–45 s
Read bottleneck / pressure -> allocate or throttle -> immediate ledger/board response.
Micro decisions are optional but available often enough that active play does not regularly become passive waiting.

### Meso — 60–150 s
State creates a Situation -> 2–4 mutually exclusive options -> choose a cost/trade-off -> create/modify Asset or Commitment -> economy changes -> dependency/pressure changes.

### Macro — 5–10 min
Accumulated structure creates a structural consequence: phase shift, major actor reaction, crisis, rupture/Control-Loss, or new scale.

## 3. Resource semantics
### Capital
Stock + named flow. No meaningful unattributed passive income.
UI must expose IN / OUT / COMMITTED rows with source IDs.

### Compute
Capacity. Produced by compute Assets; consumed by services, agents, operations, security, coordination. Show total / used / committed / free.

### Energy
Capacity. Produced by supply Assets; consumed by physical/compute infrastructure. Show total / load / committed / free.

### Autonomy
Derived ratchet/state, not spendable currency. Increases as unsupervised agents, automated systems, independent resource chains, and autonomous permissions expand. High autonomy increases scale/throughput but reduces intervention power and Legibility.

## 4. Asset model
Gameplay must be expressed through named Assets, not global modifiers.
Initial families:
- Compute
- Revenue
- Energy
- Agents
- Resilience

Every Asset must define:
- identity/name/type
- producers/consumers
- upkeep
- dependencies
- pressure contribution
- controller/supervision
- integrity/status
- local mode
- linked commitments

Design law:
Every new source of power creates benefit + obligation + dependency or vulnerability.

## 5. Oversight / Legibility
Oversight does not appear as an early tutorial concept. It becomes foreground when the first Agent exists.
- supervised agent/process consumes Oversight
- unsupervised process frees Oversight
- unsupervised operation increases Autonomy and may reduce Legibility

Legibility answers: "How much of the system's activity can the player still explain?"
Legibility is deferred until Agent gameplay; it is not a first-minute meter.

## 6. Risk / Pressure
Keep five internal domains:
financial, compute, energy, logistics, public.

Do not show five equal bars from minute 1. Surface at most 2–3 currently relevant pressures.

Each domain has edge-triggered thresholds:
- 25 SIGNAL: named actor becomes visible
- 50 REACTION: actor changes economy/options
- 75 CRISIS: urgent loss/trade-off decision
- 100 RUPTURE: authored Control-Loss/Domain Pack or explicit terminal outcome

100 must never be "just a red number" or a generic resource penalty.

Optional aggregate UI metrics may exist:
- Exposure: how visible/dependent the system is to external actors
- Legibility: how understandable internal autonomous behavior remains
They do not replace domain tracks.

## 7. Situations
Situation != upgrade.
A Situation has:
- traceable state cause
- source Asset/Dependency/Actor
- optional deadline
- 2–4 mutually exclusive options
- ignore outcome
- previewable immediate consequences
- future hooks

Maximum active Situation queue in V3 slice: 2.
Randomness may select an authored eligible variant; randomness must not replace causality.

## 8. Progression by verb shift
Time is only a pacing guardrail, never sufficient progression.

### Local AI
Primary verb: OPERATE.
Manual asset/economy actions.

### Agent
New verb: DELEGATE.
Roles, permissions, supervision; some routine operations leave foreground.

### Distributed Network
New verb: STRUCTURE.
Topology, concentration, redundancy, provider diversity.

### Regional System
New verb: INSTITUTIONALIZE.
Clusters, larger energy/supply dependencies, institutions/world actors.

### Technosphere
New verb: AUTHORIZE.
Player sets policy/bounds while the system acts at scale.

Every phase shift must remove/automate an old class of work and introduce a new class of decisions.

## 9. Phase Shift Challenges
Transitions are authored gameplay challenges, not checklists:
- Local -> Agent: compile/deploy first agent under constrained capacity
- Agent -> Network: core sharding/migration across independent nodes
- Network -> Regional: solve a physical/institutional bottleneck

## 10. Strategy structure
The slice must support at least three structural paths:
- Ghost: small diversified dependencies, low exposure, higher coordination cost
- Corporation: fewer large legal assets/contracts, strong capital, actor dependence
- Swarm: distributed autonomous agents, resilience, low Legibility / higher Control-Loss pressure

Divergence is evaluated by asset graph and dependencies, not only by numeric risk.

## 11. UI
Primary surface: growing node/edge board, not dashboard.
- board: ~55–65% of main view
- top resource strip: Capital flow, Compute capacity, Energy capacity, Autonomy
- 2–3 active pressure indicators
- one bottleneck sentence
- decision drawer with <=2 Situations
- tap node -> detail/ledger/dependencies

Implementation target: Telegram Mini App / browser. SVG/Canvas2D/DOM; no required 3D.

## 12. Beta V2 compatibility principles
Keep stable plumbing where useful:
- canonical save envelope / A-B durability / validation / migration plumbing
- deterministic simulation/scheduler/RNG/event buffer
- platform adapters
- operations/commitments foundation
- reservation engine internally
- risk domain identities and Domain Packs
- existing correctness/regression suite

Do not wire or merge the isolated research PR #32 / old src/game/v3 wholesale.

## 13. Deferred from first V3 slice
- Humanity campaign
- deep Technosphere systems
- multiplayer
- monetization
- large research tree
- achievements/daily rewards
- complex Constraint Words/Policies
- global Postures as a primary control

## 14. Acceptance principles
Automated:
- zero unattributed meaningful resource flow
- Situation cause trace always present
- threshold 25/50/75/100 exactly-once per crossing semantics
- Risk 100 cannot remain consequence-free
- no regular active-play decision-opportunity gaps >45 s in representative traces
- Agent opens DELEGATE verb
- Network opens STRUCTURE verb
- strategies diverge by asset/dependency topology

Human:
- 5 min: player can explain where Capital comes from/goes
- 10 min: player can explain why the last Situation happened
- 15 min: player can describe strategy structurally, not as "I farm resource X"
- 25–30 min: player has experienced meaningful crisis/rupture and wants to see what the system does next
