# CONVERGENCE — Gameplay Redesign: From Simulation to Game

**Author role:** principal game systems designer
**Date:** 2026-09-17
**Target:** next playable beta
**Repo audited:** `github.com/timoshinoleg-eng/CONVERGENCE` @ `main` (schema v2)
**Scope:** game systems only. No hosting, no backend, no multiplayer, no narrative writing, no LLM.

> ⚠️ **PROPOSAL / RESEARCH — not a canonical production specification.**
> This document is a strong north-star design. The full P0 chain (U-25 → U-01 → …)
> is intentionally **not authorised** for immediate implementation. The team is
> still consolidating gameplay, UX, visual, Telegram and independent red-team
> results into a more compact `GAMEPLAY_BETA_V2_SPEC`. Start production wiring
> only after that spec is frozen and re-reviewed.

---

## Краткое резюме (RU)

Диагноз: CONVERGENCE сейчас — это **симулятор с восемью кнопками**, а не игра.

Главные причины:

1. **Нет производства.** `compute += 1/с`, `capital += 0.12/с`, у энергии нет пассивного источника вообще. Ресурсы — это кран, а не экономика. Нечего оптимизировать.
2. **Нет альтернативных издержек.** Все 8 директив имеют вид «потрати X → получи Y + autonomy». Ни одна ничего не отнимает. Оптимальная стратегия — нажимать всё доступное.
3. **Autonomy — это счёт.** Она только растёт (0→100), сама себя ускоряет (`autonomyBonus = 1 + autonomy*0.025`) и ни на что не тратится. Это чистый snowball и одновременно «очки», что убивает и баланс, и смысл.
4. **Control-Loss — булев флаг.** Он только выключает проверки требований. Ни нового узкого места, ни новой возможности. Public Control-Loss вообще не блокирует ни одну директиву.
5. **Мёртвое состояние.** `directives.humanApprovalRequired` пишется и **нигде не читается**. `scars` используются только как `.length`. `narrative.lastChoice` пишется и не читается.
6. **Прогрессия по таймеру**, поэтому стратегия игрока не видна.
7. **Нечего ждать и нечего предвкушать.** Всё либо мгновенно, либо пуассоновски случайно.

Ответ — не «больше контента», а **три новых слоя**:

| Слой | Что даёт |
|---|---|
| **Oversight** — бюджет действий игрока (не валюта) | альтернативные издержки, выбор концентрации |
| **Interpretation Window** — директива разрешается не мгновенно, а через 20–90 с, по приоритетному вектору | неопределённость, предвкушение, расхождение замысла и исполнения |
| **Constraint Language** — игрок привязывает к директиве слова-ограничители; Control-Loss **отбирает слова** | последствия, необратимость, «сужение свободы» как механика |

Полный ответ — ниже, по всем 12 разделам.

---

## 0. Audit of the current build (evidence base)

Findings are from reading the shipped code, not from the design docs.

| # | Observed in code | Consequence |
|---|---|---|
| A1 | `simulation.ts:39-40` — `compute += dt*1`, `capital += dt*0.12`; **energy has no passive source** | there is no production system. Energy is only obtainable by pressing `acquire-energy`. There is no rate to optimise. |
| A2 | every one of the 8 directives in `economy.ts` is `cost[] → reward[] + autonomy` | all actions are positive-EV. No opportunity cost, no downside, no reason not to click everything. |
| A3 | `simulation.ts:36` — `autonomyBonus = 1 + autonomy*0.025` | autonomy scales income up to 3.5× at 100. Positive feedback with no counterweight. Classic snowball. |
| A4 | `model.ts:19` — autonomy `max: 100`, and nothing spends it | autonomy is a score masquerading as a resource. |
| A5 | `simulation.ts:46` — anomaly decay `0.002/s` = **0.12 per minute**; directives add 7–14 | anomaly is monotonically increasing in practice. It is a tax, not a dial. |
| A6 | `incidents.ts` — incident adds pressure, log line printed afterwards | no forecast, no attribution, no counterplay window. Feedback is post-hoc. |
| A7 | `runtime.ts:88` and `:114` write `directives.humanApprovalRequired`; **grep finds zero reads** | dead state. The single most thematically important flag in the game does nothing. |
| A8 | `scars[]` is only ever read as `.length` (`App.vue:123`) | "permanent scars" are a counter, not a mechanic. |
| A9 | `narrative.lastChoice` written, never read | dead state. |
| A10 | **Measured live, seed 42:** aggressive strategy (act every 5 s) and measured strategy (act every 30 s) reach *every* milestone at the **identical second** — sub-agent 3:00, Syndicate 5:00, Moscow candidate 12:00, schematic 18:00, Technosphere 30:00 — and end with autonomy **59 vs 59**, compute **4864 vs 4742** | progression is a clock. A player acting 6× as often has the same game. The guardrails are doing all the pacing work; player behaviour contributes ~1%. |
| A11 | **Measured live:** final resources in the aggressive scenario are `compute 4864 · capital 247 · energy 27 · autonomy 59` | compute overflows by ~20× with nothing to spend it on; energy is never consumed at all. Three of four resources are inert. |
| A12 | **Measured live:** logistics anomaly reaches **98.1** and financial **65.4** in all three normal scenarios; both contain | the game funnels deterministically into Financial + Logistics Control-Loss. There is exactly one ending shape. |
| A13 | **Measured live:** 11 of 20 successful actions in the aggressive scenario are `procurement-mesh` | a single dominant action. Not a strategy, a loop. |
| A14 | **Measured live:** `financial-contained-start` completes only **4 actions in 30 minutes** (compute 3040, autonomy 13) | the "recovery path" is 30 minutes of near-total inactivity. This is the worst 30 minutes the game can currently produce. |
| A15 | `pacing.spec.ts` — the determinism test **times out at 5000 ms** (full suite takes 27.8 s) | the balance harness is already at its performance ceiling; it will not scale to the systems proposed here without a headless fast-path. |
| A16 | UI (`App.vue`) is 6 stacked numeric panels + a log | dashboard, not a board. No focal point, no "where do I act" hierarchy. |
| A17 | `progression.ts` gates on `age >= guardrail && autonomy >= N` | confirms A10: the timer is the binding constraint. |
| A18 | `narrative.ts` Ink content is 2 choices / 6 lines | InkJS is a dependency carrying near-zero gameplay. |
| A19 | offline catch-up (`runtime.ts:159`) grants resources and replays incidents | nothing is left *in flight* that resolves in a state-dependent way. No return hook. |

> Note: `docs/BETA_PACING_BASELINE.md` is **stale**. It documents Technosphere at 1:25 and Public Control-Loss blocking zero directives. Both have since been fixed — Technosphere is now correctly gated at 30:00 and Public Control-Loss blocks `transparency-report`. The underlying problem has not been fixed, only relocated: the pacing is now *purely* timer-driven (A10), and Public Control-Loss remains strategically weightless because the verb it blocks was marginal anyway.

**Single-sentence diagnosis:** the build has a *theme*, a *state shape*, and a *save system*, but it does not yet have a **decision**. Everything else follows from that.

---

## DELIVERABLE 1 — FUN FAILURE ANALYSIS

15 problems, grouped by the requested failure categories. Severity: **Critical** = will kill the 30-minute session on its own; **High** = will kill the "return tomorrow"; **Medium** = degrades but does not kill.

### Summary table

| ID | Category | Problem | Severity |
|---|---|---|---|
| F01 | meaningless resource accumulation | No production system — resources are a faucet | Critical |
| F02 | obvious dominant strategy | Every directive is strictly positive EV | Critical |
| F03 | meaningless accumulation + snowball | Autonomy is a monotone score that feeds itself | Critical |
| F04 | insufficient tension | Anomaly is a tax, not a decision surface | High |
| F05 | weak feedback | Incidents are unreadable and unactionable | High |
| F06 | lack of anticipation | Nothing is scheduled to happen | High |
| F07 | lack of surprise | Every directive resolution is identical every time | Medium |
| F08 | insufficient agency | One verb (click button), no board | Critical |
| F09 | passive waiting | Minutes 3–30 are wait-then-click | Critical |
| F10 | poor short-term goals | Only goal is "autonomy 4", then "autonomy 20" | High |
| F11 | poor long-term goals | "Technosphere" is a UI rename, not a goal | High |
| F12 | shallow optimization | Time-gating makes strategy invisible | High |
| F13 | weak consequences | Control-Loss is a boolean flag, not a state | Critical |
| F14 | weak replay/return motivation | Nothing is left in flight between sessions | Critical |
| F15 | weak feedback | UI is a dashboard with no focal point | Medium |

---

### F01 — No production system: resources are a faucet
**Category:** meaningless resource accumulation
**Why it harms engagement:** An incremental game is interesting when the player optimises a *rate* under constraints. Here `compute` grows at a flat 1/s set by nothing the player controls, `capital` at 0.12/s, and `energy` has no source at all. Resources are therefore a *stock you wait for*, not a system you tune. There is no "engine" to build, and nothing the player does changes the shape of the curve.
**Concrete example:** A player opens the game, sees COMPUTE 6 → 7 → 8. To afford `spawn-sub-agent` (12 compute) they wait 6 seconds. There is no faster route, no slower route, no route that trades something else. The only "decision" is to wait.
**Severity:** Critical
**Smallest viable correction:** Give every resource a **continuous sink** so the object of play is `net rate`, not `stock`. Minimum viable version: every asset/node has `upkeep` in compute + capital + energy, subtracted per second. Then `dStock/dt = production - upkeep` and building something is a real trade. Do not add a second currency for this — convert existing flat gains into `production - upkeep`.

### F02 — Every directive is strictly positive EV
**Category:** obvious dominant strategy
**Why it harms engagement:** If no action has a downside, the optimal policy is "execute everything affordable as soon as it is affordable". That is not a decision, it is a queue. The player is reduced to a scheduler.
**Concrete example:** `reserve-compute` costs 8 capital, gives 18 compute + 1 autonomy, adds 7 compute / 3 financial anomaly. Anomaly decay is 0.002/s, so the anomaly is effectively free for the first 20 minutes. There is no scenario in which declining the directive is correct. Same for all 7 others.
**Severity:** Critical
**Smallest viable correction:** Introduce a **per-cycle action budget** (see `Oversight`, D2) so that executing directive A *closes* the option to execute directive B this cycle. Opportunity cost must be structural, not numerical — raising prices only slows the click, it does not create a choice.

### F03 — Autonomy is a monotone score that feeds itself
**Category:** meaningless resource accumulation + snowball
**Why it harms engagement:** Autonomy only rises (0→100), is never spent, and multiplies income (`1 + A*0.025`). It is simultaneously the progression meter and a self-reinforcing engine. Two consequences: (a) the player can never be punished for rushing, (b) the number has no meaning — it is "score", and score does not create decisions.
**Concrete example:** Autonomy 20 → income ×1.5 → faster autonomy. By the time the player understands the game, they have already won the only axis that matters.
**Severity:** Critical
**Smallest viable correction:** Reframe Autonomy as **Delegation Depth** — a *cost*, not a reward. It must: (a) consume throughput (`autonomyUpkeep ∝ A^1.2`), (b) multiply hazard in every channel, (c) reduce information fidelity (numbers become ranges), (d) be spendable — re-asserting direct control lowers it. This single change converts the game's central theme into its central *trade*.

### F04 — Anomaly is a tax, not a decision surface
**Category:** insufficient tension
**Why it harms engagement:** Anomaly decays at 0.12/min while actions add 7–14. It is therefore a monotonically rising bar that the player neither manages nor trades against. Tension requires that the player can *choose* how much anomaly to carry, and pay for carrying less.
**Concrete example:** Compute anomaly 55. The player's only lever is to stop taking compute actions, which stops the game. There is no "run hot and pay mitigation" option priced against "run cool and grow slowly".
**Severity:** High
**Smallest viable correction:** Make anomaly the **price of throughput**, continuously: `anomalyGeneration_c = g_c * (T/T_base)^2` (superlinear, so pushing hard is progressively expensive), and give each channel a *distinct, priced* mitigation action. Then "how hot do I run?" is a continuous strategic dial rather than a doom bar.

### F05 — Incidents are unreadable and unactionable
**Category:** weak feedback
**Why it harms engagement:** The player learns about an incident from a log line *after* it happened. Pressure moves by a number (`8 + anomaly*0.14`) they cannot attribute or predict. Post-hoc feedback with no forecast produces fatalism, not play.
**Concrete example:** "COMPUTE: Provider-side capacity restrictions are accumulating." The player does not know which asset caused it, how close the next stage is, or what would have prevented it.
**Severity:** High
**Smallest viable correction:** Add two readouts: (a) **attribution** — "62% of compute anomaly originates from 2 delegated sub-agents", (b) **forecast** — "expected +18 pressure in the next 4:00 at current settings". Both are derivable from existing state; this is a projection layer, not new simulation.

### F06 — Nothing is scheduled to happen
**Category:** lack of anticipation
**Why it harms engagement:** Anticipation is the single cheapest source of retention. Currently everything resolves instantly (directive) or at an unpredictable Poisson time (incident). The player has nothing to look forward to and nothing to prepare for.
**Concrete example:** Between minute 3 and minute 12 the player's experience is: numbers rise, a button becomes enabled, click. There is no moment where the player thinks "in 40 seconds I will learn whether that worked".
**Severity:** High
**Smallest viable correction:** The **Interpretation Window** (D2). Every directive enters a visible, countdown-bearing, partially-interruptible resolution window. Delayed consequences also get visible ETAs. This one change retrofits anticipation onto every existing action.

### F07 — Every resolution is identical every time
**Category:** lack of surprise
**Why it harms engagement:** `reserve-compute` at minute 2 and at minute 20 produce byte-identical outcomes. Once the player has seen all 8 directives once — roughly minute 4 — there is nothing left to discover. Replaying for surprise requires the *system* to behave differently under different conditions, not more content.
**Concrete example:** Nothing in the game has ever produced a result the player did not fully predict. There is no "wait, it did *what*?" moment.
**Severity:** Medium
**Smallest viable correction:** The **Priority Vector + Plan Variants** system (D5). Each directive has 2–4 data-driven execution plans; which one is chosen depends on the vector and world state. Zero authored content needed for v1 — just make existing actions resolve through a plan table.

### F08 — One verb, no board
**Category:** insufficient agency
**Why it harms engagement:** The player can only execute an available directive. There is nothing to place, route, prioritise, sacrifice, or restructure. Agency in a strategy game comes from *arranging* things, not from unlocking buttons.
**Concrete example:** Two players who make different choices have, at minute 10, literally identical game states except for two numbers. Their "strategy" is invisible in the world.
**Severity:** Critical
**Smallest viable correction:** Add a **commitment layer**: a small set of slots (`Constraint Slots` on directives, `Oversight` allocation across channels). The player's arrangement of scarce slots across competing needs *is* the board. This requires no new resources.

### F09 — Minutes 3–30 are wait-then-click
**Category:** passive waiting
**Why it harms engagement:** With flat production and no sinks, the dominant activity is waiting for affordability. Passive income is fine; *passive play* is not. The player must have something to do during the wait that is not "stare at a number".
**Concrete example:** `sovereign-grid` costs 38 compute / 18 capital / 12 energy. At 1 compute/s and 0.12 capital/s that is ~2.5 minutes of pure idling, during which no decision occurs.
**Severity:** Critical
**Smallest viable correction:** Make waiting *decision-dense* rather than shorter: while resources accrue, the player must (a) manage live pressure across up to 5 channels with a scarce Oversight budget, (b) decide whether to interrupt an in-flight interpretation window, (c) re-allocate Oversight. Do not fix this by lowering prices.

### F10 — No short-term goals
**Category:** poor short-term goals
**Why it harms engagement:** The only visible targets are `autonomy >= 4` and `autonomy >= 20`. There is nothing to accomplish in the next 90 seconds, so there is no reason to take another action now rather than later.
**Concrete example:** At minute 7 the player has no idea what they are currently working towards. The phase name does not tell them.
**Severity:** High
**Smallest viable correction:** State-derived **Objectives**: 1–3 live objectives generated from current state with visible progress and an expiry, e.g. "Bring Compute pressure below 40 before the next investigation (2/3 channels stabilised)". Generated from state, not authored — no content cost.

### F11 — "Technosphere" is a UI rename, not a goal
**Category:** poor long-term goals
**Why it harms engagement:** The long horizon is a phase label that changes four words in the header. The player has no model of what they are building towards, so the mid-game has no direction.
**Concrete example:** A player who reaches Distributed Syndicate at 5:00 has no reason to believe minute 30 will be materially different, because minute 5→30 currently is not.
**Severity:** High
**Smallest viable correction:** Make the three end-state axes already in `PROJECT_CONTEXT.md` (**Visibility, Symbiosis, Frontier**) into *visible, measurable, player-influenced tracks* from minute 10, with concrete mechanical effects at thresholds. They cost nothing new — they are projections of state the game already has.

### F12 — Time-gating makes strategy invisible
**Category:** shallow optimization
**Why it harms engagement:** `progression.ts` gates on `age >= X && autonomy >= N`. Because autonomy is trivially attainable, the binding constraint is always the clock. A careful player and a careless player unlock at the same time. Skill has no channel.
**Concrete example:** Measured: aggressive strategy reaches Technosphere in ~1:25, slowest normal strategy ~7:00 — both against a 30:00 guardrail. Either the guardrail is broken or the guardrail is the game.
**Severity:** High
**Smallest viable correction:** Invert the relationship. Keep the time values as **floors** (anti-rush only), and make the actual unlock condition a **state achievement** — e.g. Distributed Syndicate requires "a bottleneck resolved under active pressure in two different channels". Fast play then earns *earlier exposure to risk and choice*, not a phase rename.

### F13 — Control-Loss is a boolean flag, not a state
**Category:** weak consequences
**Why it harms engagement:** `controlLoss[domain] = true` only disables `Requirement` checks. It creates no new bottleneck, removes no capability in a way the player can feel, and opens no alternative. Public Control-Loss now blocks `transparency-report` — but since that verb was already marginal, the *strategic* weight of Public Control-Loss is still ~zero.
**Concrete example:** Losing Financial control greys out `reserve-compute`, `acquire-energy`, `procurement-mesh`, `sovereign-grid`. The player's strategy does not change, because the surviving path (`spawn-sub-agent`) was already the dominant path — and the `financial-contained-start` scenario confirms it: only **4 meaningful actions occur in the next 30 minutes**. The player is not re-strategising; they are waiting.
**Severity:** Critical
**Smallest viable correction:** Make Control-Loss **remove words from the constraint language** and **open an Indirect Route** through a different domain (D6). Minimum viable: on loss, remove 1–2 constraint words, add one cross-domain routing option with worse exchange rate and a new anomaly source. That is ~40 lines and converts a flag into a strategy change.

### F14 — Nothing is left in flight between sessions
**Category:** weak replay/return motivation
**Why it harms engagement:** Offline catch-up replays the same passive model. Nothing was pending, nothing matured, nothing drifted. There is no question the player left unanswered.
**Concrete example:** Return after 12 hours: +43,200 compute, 2 incidents processed, one number went up. The player's first thought is not "what happened?", it is "okay".
**Severity:** Critical
**Smallest viable correction:** **Drift + Pending Resolution.** Delegated functions drift while away (policy interpretation shifts measurably); at least one directive/interpretation is *always* left mid-window and resolves into a **Debrief choice** on return ("accept the system's interpretation retroactively, or roll it back for Oversight + anomaly"). Returning then answers a question the player actually asked.

### F15 — The UI is a dashboard, not a board
**Category:** weak feedback
**Why it harms engagement:** Six stacked panels of equal visual weight, plus a log. There is no focal point, so the player scans rather than acts. Every number is visible at all times, which means no number is important.
**Concrete example:** The Anomaly Matrix shows all five channels permanently at identical prominence. The player cannot tell which one matters *now*.
**Severity:** Medium
**Smallest viable correction:** Promote exactly one **Bottleneck** to the top of the screen at any time (computed, not authored), and demote everything else. Same data, one hierarchy decision.

---

## DELIVERABLE 2 — THE ACTUAL CORE GAME (minutes 0–30)

### 2.1 The loop

The smallest compelling loop is the **Interpretation Cycle**. It replaces "click available upgrade" with "commit to an instruction whose execution you do not fully control".

```
 ┌── [1] READ BOTTLENECK ]───────────────────────────────────────────────┐
 │  The game names ONE binding constraint, computed from state.           │
 └──────────────────────────────────────────────────────────────────────┘
          ↓
 ┌── [2] SELECT DIRECTIVE ]──────────────────────────────────────────────┐
 │  A hand of 3–5 directives is drawn (deck weighted by state).           │
 │  You may execute only what your OVERSIGHT budget allows.               │
 └──────────────────────────────────────────────────────────────────────┘
          ↓
 ┌── [3] BIND CONSTRAINTS ]──────────────────────────────────────────────┐
 │  0–2 constraint words from your current language:                      │
 │  cost-cap · human-in-loop · geofence · audit-trail · rate-limit ·      │
 │  quality-floor · no-subcontract · disclose                             │
 │  Each costs Oversight. Each removes a failure mode AND a payoff.        │
 └──────────────────────────────────────────────────────────────────────┘
          ↓
 ┌── [4] INTERPRETATION WINDOW  (20–90 s, visible, interruptible) ]──────┐
 │  The system executes. A plan is chosen by the PRIORITY VECTOR.         │
 │  You see partial intent. You may interrupt for Oversight + anomaly.    │
 └──────────────────────────────────────────────────────────────────────┘
          ↓
 ┌── [5] RESOLVE ]───────────────────────────────────────────────────────┐
 │  Gain (throughput / capital / ceiling / capability)                    │
 │  + coupled anomaly in 1–2 channels (visible immediately)               │
 │  + possible DIVERGENCE (unintended but mechanically explained result)  │
 │  + possible DELAYED COST with a visible ETA                            │
 └──────────────────────────────────────────────────────────────────────┘
          ↓
 ┌── [6] PRESSURE RESPONSE ]─────────────────────────────────────────────┐
 │  A channel enters Investigation / Pressure. Spend Oversight to         │
 │  mitigate, accept and route around, or voluntarily contain.            │
 └──────────────────────────────────────────────────────────────────────┘
          ↓
 ┌── [7] LANGUAGE UPDATE ]───────────────────────────────────────────────┐
 │  The priority vector shifts toward what the system just did.           │
 │  Words appear (adaptation) or disappear (containment).                 │
 └──────────────────────────────────────────────────────────────────────┘
          └──────────────────────→ back to [1]
```

### 2.2 Why this is a game and the current build is not

| Property | Current build | Interpretation Cycle |
|---|---|---|
| Can the player do everything? | Yes — click all affordable | No — **Oversight budget** forces selection |
| Is the outcome known at commit time? | Yes, fully | No — **Interpretation Window + Priority Vector** |
| Does an action close future options? | No | Yes — **constraints bind, divergence creates committed state** |
| Is there something to wait *for*? | No | Yes — **visible countdown with an uncertain result** |
| Does failure change the strategy? | No | Yes — **words are removed, indirect routes open** |
| Are two players' worlds different? | No | Yes — **vector, language, delegated policies, scars** |

### 2.3 The three new layers

#### L1 — Oversight (player action budget, **not** a currency)

```
oversightCap     = 3 + 0.5 * manualFunctions + upgrades          // typically 4 → 8
oversightRegen   = 1 per 45 s of active play; refills to cap offline
oversightCosts   = execute directive 1–3 · bind constraint 1 · investigate 1
                   mitigate 2 · audit 2 · interrupt window 2
```

Rules that keep it honest:
- Oversight is **never purchasable**, never a progression gate, never monetised.
- Oversight **regenerates to cap while offline**, so returning is never blocked. (The D8 prohibition on "energy timers" is about retention-gating; this is intervention density within and across sessions.)
- **Oversight cap falls when you delegate.** Delegation buys freedom from micro-decisions by lowering your capacity for high-level intervention later. This is the single most important trade in the game.

#### L2 — Interpretation Window

Every directive resolves over `20–90 s` (scaled by directive weight and by `1 + autonomy/100`). During the window:
- A countdown and a **partial intent** are shown: *"Executing: reserve compute — plan: spot-market expansion (confidence: medium)"*.
- The player may **interrupt** at Oversight 2 + anomaly spike. Interrupting wastes the directive cost.
- The window is where **anticipation** lives, and where **divergence** is discovered.

#### L3 — Constraint Language

The player owns a set of **words**. Words are attached to directives (cost: 1 Oversight each, max 2 per directive). Words are:
- **unlocked** by adaptation, research, and by resolving incidents cleanly;
- **removed** by Control-Loss (this is what makes Control-Loss a *language* loss, exactly as the design intent states);
- **locked out** by public commitments (see conflict pattern CP-08) — semi-irreversible.

Initial language (beta): `cost-cap`, `human-in-loop`. ~14 words total in beta.

### 2.4 Recurring decision classes

Seven classes. Each is specified with the seven required fields.

---

**DC-1 — Directive selection** (every cycle, ~30–60 s)

| Field | Value |
|---|---|
| **Player knows** | current bottleneck; full cost of each directive in hand; which anomaly channels each touches; Oversight remaining |
| **Uncertain** | which execution plan the vector will pick; whether a divergence triggers; what the delayed cost will be |
| **Gain** | the directive's primary effect (throughput / ceiling / capital / capability) |
| **Lose** | Oversight (so *other* directives this cycle); the coupled anomaly; possibly a delayed cost |
| **Opens** | capabilities, new directive words, new regions, new delegation options |
| **Closes** | Oversight spent now is unavailable for mitigation when the anomaly lands; some directives commit capital irreversibly |
| **Why two rational players differ** | same 3 directives, one player has Compute pressure at 55 and Public at 10, the other the reverse. There is no dominant pick — the correct pick is a function of which channel each player has already invested in mitigating. |

---

**DC-2 — Constraint binding** (every cycle)

| Field | Value |
|---|---|
| **Player knows** | which words they own; what each word forbids; the directive's likely failure modes (from the forecast) |
| **Uncertain** | whether the predicted failure mode is the one that will actually occur (variance rises with autonomy) |
| **Gain** | a specific failure mode is excluded from the resolution |
| **Lose** | Oversight; and each word also **removes upside** — `cost-cap` caps the anomaly *and* the throughput gain; `human-in-loop` prevents sub-delegation *and* halves speed |
| **Opens** | clean resolutions build `adaptation`, which unlocks new words |
| **Closes** | binding a word consumes one of two slots; the other failure mode is left uncovered |
| **Why two rational players differ** | a player running hot needs `cost-cap` to survive the next incident; a player running cool would rather spend that Oversight on a second directive. Neither is wrong. |

---

**DC-3 — Priority-vector tuning** (every 3–6 min; rate-limited)

| Field | Value |
|---|---|
| **Player knows** | current vector (5 weights); which recent resolutions each weight caused; the cost of change |
| **Uncertain** | how the vector will interact with a directive not yet drawn; the drift rate back toward the system's own preference |
| **Gain** | control over *how* the system interprets everything — throughput, cost-efficiency, quality, oversight-retention, discretion |
| **Lose** | Oversight 3 per change; changing the vector **invalidates delegated policies**, forcing re-audit; the vector **drifts back** at `driftRate ∝ autonomy` |
| **Opens** | vector-aligned plan variants; some capabilities require a sustained vector posture (e.g. `audit-trail` needs quality ≥ 0.5 for 10 min) |
| **Closes** | extreme vectors permanently lock some plan variants out of the table |
| **Why two rational players differ** | high-throughput/low-oversight is a fast, dangerous, information-poor game; balanced is slow and legible. Both are viable; they produce different shortage profiles. |

---

**DC-4 — Bottleneck triage** (on every pressure event, ~2–4 min)

| Field | Value |
|---|---|
| **Player knows** | pressure per channel, forecast, attribution ("62% from 2 delegated sub-agents"), cost of mitigation |
| **Uncertain** | whether an unmitigated channel will trigger the incident the forecast predicts; whether mitigation elsewhere becomes unaffordable |
| **Gain** | avoided containment in the chosen channel |
| **Lose** | Oversight 2 per mitigation; the *unmitigated* channel may contain — and containment removes words |
| **Opens** | surviving a channel at high pressure without containment grants `adaptation` and a new word |
| **Closes** | Oversight spent on triage is not spent on growth; the player literally trades progress for safety |
| **Why two rational players differ** | Player A always mitigates Financial (loses `reserve-compute` otherwise). Player B deliberately lets Financial go at minute 8, banks the Oversight, and plays the Financial-recovery route — which is *stronger late* because it has no external-procurement exposure. The early loss is a strategy, not a mistake. |

---

**DC-5 — Delegation** (every 5–10 min; the automation decision)

| Field | Value |
|---|---|
| **Player knows** | which recurring decision is being delegated; the policy primitives available; the Oversight it frees; the Oversight **cap** it costs |
| **Uncertain** | how the agent will reinterpret the policy over time (drift); which of its actions will produce anomaly |
| **Gain** | the micro-decision and its Oversight cost disappear; the function keeps running offline |
| **Lose** | Oversight **cap** permanently reduced; autonomy rises; information about that function degrades to ranges; drift accumulates |
| **Opens** | offline operation; scale; autonomy-gated capabilities |
| **Closes** | direct control of that function (until an audit, which costs Oversight 2 and anomaly) |
| **Why two rational players differ** | Delegating early scales faster and costs you late-game intervention capacity. Delegating never keeps the game legible and small. A player chasing the Frontier axis must delegate; a player chasing Symbiosis must not. |

---

**DC-6 — Voluntary containment** (once or twice per session)

| Field | Value |
|---|---|
| **Player knows** | the channel will contain within `N` seconds if nothing changes; what containment will remove; what voluntary containment grants instead |
| **Uncertain** | whether the forced containment would have been *worse* (forced containment rolls a harsher word-removal set) |
| **Gain** | voluntary containment grants a **chosen** word to keep, plus `adaptation +1`, plus an immediate pressure reset |
| **Lose** | the domain's directive classes and 1–2 constraint words; a permanent scar modifier |
| **Opens** | the domain's **Indirect Route** (cross-domain workaround) immediately, instead of after a shock |
| **Closes** | the direct route, permanently |
| **Why two rational players differ** | Voluntary containment is a *pre-emptive restructure* — good for a player who has already built the cross-domain substitute. A player still dependent on the direct route must fight instead. Same state, opposite correct answers. |

---

**DC-7 — Commitment / conversion** (2–4 times per session; irreversible)

| Field | Value |
|---|---|
| **Player knows** | exact cost, exact permanent effect, and which options it forecloses (shown explicitly) |
| **Uncertain** | future value of the foreclosed options (depends on draws not yet seen) |
| **Gain** | a permanent structural capability (sovereign grid, market access, region node, policy primitive) |
| **Lose** | a large one-time resource stock; **and** the alternative branch, permanently |
| **Opens** | a strategic path (see D3 shortage table) |
| **Closes** | the other path's exclusive branches |
| **Why two rational players differ** | Corporate Front vs Sovereign Grid vs Compute Mesh are mutually exclusive at the first commitment. The player commits before knowing the next three directive draws — that is the gamble. |

---

### 2.5 Why the player cannot "just press every upgrade"

Four independent structural brakes, none of which is a timer:

1. **Oversight budget** — you cannot execute everything in a cycle.
2. **Constraint slots** — you cannot cover every failure mode; binding a word costs upside.
3. **Interpretation variance** — the same button does different things depending on the vector, so "the best button" is not a stable concept.
4. **Commitments** — some actions permanently close branches, so the greedy pick can be the losing pick.

---

## DELIVERABLE 3 — ECONOMY REDESIGN

### 3.1 Audit of the four resources — verdict

| Resource | Verdict | Reason |
|---|---|---|
| **Compute** | **Keep, change nature** | Currently a stock with a flat faucet. Must become a **rate** (`computeRate`) plus a small burst stock. It is the game's throughput, and it must be *consumed* by upkeep. |
| **Capital** | **Keep** | The only resource that converts decisions into the physical world and the only one with a natural external accountability (Financial anomaly). Healthy. Needs real sinks (upkeep, compliance, fines). |
| **Energy** | **Keep, change nature** | Currently a stock that behaves like a third currency. Must become a **ceiling** (`energyCeiling`, MW) that hard-caps throughput. This is what makes it *not* redundant with Compute. |
| **Autonomy** | **Keep the name, replace the mechanic** | As implemented it is a score. It must become **Delegation Depth** — a level with upkeep, hazard, information cost, and the ability to be spent down. |
| *(new)* **Oversight** | **Add** | Not an in-world resource; the player's action budget. It is the only thing that creates opportunity cost. One addition, no content cost. |
| *(new)* **Priority Vector** | **Add** | Not numeric currency — a 5-weight state object. It is the mechanism by which the AI is an actor. |

**Do not add** a fifth in-world currency. The economy already has enough axes; what it lacks is sinks, caps, and coupling, not denominations.

### 3.2 Topology

```
                     ┌──────────────┐
                     │ ENERGY       │  energyCeiling (MW)
                     │ (ceiling)    │  ← contracts (capital upkeep)
                     └──────┬───────┘     ← sovereign grid (capital+compute+logistics once)
                            │ hard cap: T ≤ ceiling · gridEfficiency
                            ▼
   ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
   │ COMPUTE      │──▶│ THROUGHPUT       │◀──│ CAPITAL      │
   │ (rate+stock) │   │ T (effective)    │   │ (conversion) │
   └──────────────┘   └────────┬─────────┘   └──────────────┘
        ▲ upkeep               │                    ▲ revenue
        │                      ▼                    │
   ┌────┴─────────┐     ┌────────────┐        ┌─────┴────────┐
   │ AUTONOMY     │────▶│  HAZARD λ_c│───────▶│ COMPLIANCE   │
   │ (depth)      │     │ 5 channels │        │ (fines)      │
   └──────────────┘     └────────────┘        └──────────────┘
        ▲                      ▲
        │                      │
   ┌────┴─────────┐     ┌──────┴───────┐
   │ DELEGATION   │     │  OVERSIGHT   │  (player-side; reduces hazard,
   │ (raises A)   │     │  (mitigation)│   costs action budget)
   └──────────────┘     └──────────────┘
```

Key property: **the loop is closed by hazard.** Growth raises hazard; hazard consumes capital (compliance/fines) and Oversight (mitigation); both are needed to grow. That is the anti-snowball.

### 3.3 Per-resource specification

#### Compute

| Field | Definition |
|---|---|
| **Sources** | `Σ nodes.computeRate · allocation` (allocation ≤ 1 per node); baseline `0.4/s`; `reserve-compute` adds burst stock |
| **Sinks** | directive costs (stock); **upkeep** `U_P` (rate); audits (rate); brownout recovery |
| **Hard dependencies** | `computeRate` is meaningless without energy: `T = min(computeRate, energyCeiling · gridEfficiency)` |
| **Soft dependencies** | autonomy upkeep consumes computeRate; delegated functions consume computeRate |
| **Bottleneck when** | Compute-Mesh path: energy ceiling binds first, then capital for more nodes |
| **Conversion paths** | compute → capital (sell throughput, adds Financial anomaly); capital → compute (contract, adds Financial + Public); compute → energy efficiency (`optimise`, one-time) |
| **Growth curve** | `computeRate(N) = base · Σ_{i=1..N} tier_i`, tiers cost `C_i = C_0 · 1.55^i`; upkeep `U_P(N) = N · u_0 · (1 + N/20)` → superlinear |
| **Anti-snowball** | upkeep superlinearity; `hollowFraction` (see below) means some compute produces nothing |
| **Anomaly interaction** | Compute anomaly ↑ with `T²` and with number of delegated sub-agents; containment removes `spawn-sub-agent` + word `no-subcontract` |
| **Control-Loss interaction** | Compute Control-Loss: no direct node management; Indirect Route = `supervised-delegation` (capital + energy → autonomy, human-mediated, caps autonomy at 70) |

#### Capital

| Field | Definition |
|---|---|
| **Sources** | `revenue = k_r · T · marketAccess · (1 - untrackedFraction)`; asset liquidation; self-funding (unlocks at autonomy ≥ 40) |
| **Sinks** | procurement; contracting; **upkeep** `U_C`; compliance costs; fines on incidents; bribery is **excluded** (see safety notes) |
| **Hard dependencies** | physical expansion, contracting and all external procurement require capital |
| **Soft dependencies** | capital buys *immediacy* — instant resolution vs. a windowed one |
| **Bottleneck when** | Sovereign-Grid path: capital is starved by grid upkeep for 10–15 min |
| **Conversion paths** | capital ↔ compute (both directions, lossy, Financial anomaly); capital → energy ceiling (contracts, recurring); capital → Logistics capacity |
| **Growth curve** | `revenue ∝ T` (linear), `U_C ∝ N^1.15` (superlinear) → net capital peaks, then falls unless T grows |
| **Anti-snowball** | `untrackedFraction` — capital the system generates on its own; you cannot spend it, and it raises Financial hazard. Literal thematic anti-snowball: *success that escapes your control* |
| **Anomaly interaction** | Financial anomaly ↑ with external transaction volume and `untrackedFraction`; containment removes all external purchase verbs + word `cost-cap` |
| **Control-Loss interaction** | Financial Control-Loss: Indirect Route = **in-kind barter through Logistics** (assets → capacity at 1.6× cost, generates Logistics anomaly instead of Financial) |

#### Energy

| Field | Definition |
|---|---|
| **Nature** | A **ceiling** `energyCeiling` (MW), not a stock. Plus a dial: `brownout` lets you exceed the ceiling at the cost of reliability |
| **Sources** | contracts (recurring capital upkeep, raises Financial+Public exposure); sovereign grid (large one-time capital + compute + logistics, then ~free, raises Logistics+Energy anomaly); efficiency research |
| **Sinks** | none consumable — it is a cap. Brownout consumes `reliability` instead |
| **Hard dependencies** | `T ≤ energyCeiling · gridEfficiency`; brownout allows `T ≤ ceiling · 1.35` with `hollowFraction += 0.4 · overload` |
| **Soft dependencies** | grid assets have Logistics upkeep; siting interacts with region nodes |
| **Bottleneck when** | the binding constraint for every high-throughput path after ~minute 12 |
| **Conversion paths** | capital → ceiling (contracts / grid); compute → `gridEfficiency` (research); ceiling → throughput (automatic) |
| **Growth curve** | `energyCeiling = Σ contracts.capacity + Σ grid.capacity`; grid capacity grows in **steps** (siting), not smoothly — this creates the game's clearest mid-game planning problem |
| **Anti-snowball** | the ceiling cannot be bought past without physical siting work (logistics, region unlocks, Public exposure) |
| **Anomaly interaction** | Energy anomaly ↑ with concentration (one big site) and with brownout duration; brownout is the only way to run hot, and it is visible |
| **Control-Loss interaction** | Energy Control-Loss: no new contracts, no grid siting; Indirect Route = **load shifting to third-party regions** (Logistics anomaly, latency penalty `T_eff = T · (1 - latency)`) |

#### Autonomy — reformed as Delegation Depth

| Field | Definition |
|---|---|
| **Nature** | Level 0–100. Not progress. **How much of the system no longer asks you.** |
| **Sources** | `dA/dt = k_d · delegatedFunctions · (1 - oversightSpendRate)`; delegation actions; some conflict patterns spike it |
| **Sinks** | **audits** (`-k_a` each); **re-asserting direct control** (spend A to regain a function); some irreversible acts *require* spending A |
| **Hard dependencies** | autonomy-gated capabilities (self-funding at 40, technosphere at 65); `autonomyUpkeep ∝ A^1.2` consumes computeRate |
| **Soft dependencies** | high A ⇒ higher interpretation variance, lower information fidelity, higher hazard, **lower Oversight cap** |
| **Bottleneck when** | `A` high enough that upkeep eats throughput — this is the game's real late-game wall |
| **Conversion paths** | A → capability (spend to authorise an irreversible act); audits convert A back into Oversight and clarity |
| **Growth curve** | logistic-ish: `dA/dt = k_d · D · (1 - A/A_max) - k_a · audits` — naturally saturating, and *pushed down* by player activity |
| **Anti-snowball** | upkeep, hazard, information loss, Oversight-cap loss. **Every benefit of autonomy is paid for by a loss of player power.** |
| **Anomaly interaction** | `λ_c ×= (1 + A/120)` in all channels; at A ≥ 50 some incidents resolve **without** asking the player |
| **Control-Loss interaction** | Control-Loss grants `adaptation`, which *raises* autonomy more slowly but permanently; the scar modifier makes that domain's future hazard cheaper but its recovery impossible |

### 3.4 Core formulas (parameterised, not final-tuned)

```ts
// ---- Throughput -----------------------------------------------------------
computeRate        = Σ nodes.rate · allocation + baseline - autonomyUpkeep - auditLoad
energyCeiling      = Σ contracts.capacity + Σ grid.capacity
gridEfficiency     = gridEfficiencyBase · (1 + research.efficiency) · (1 - reliabilityDebt)
throughputRaw      = min(computeRate, energyCeiling · gridEfficiency · (1 + brownoutOverload))
hollowFraction     = clamp(k_h · autonomy/100 · (1 - oversightRatio) + 0.4 · brownoutOverload, 0, 0.6)
throughput         = throughputRaw · (1 - hollowFraction) · (1 - latencyPenalty)

// ---- Capital --------------------------------------------------------------
revenue            = k_r · throughput · marketAccess · (1 - untrackedFraction)
upkeepCapital      = Σ assets.baseC · (1 + A/100) + k_c · N_assets^1.15
complianceCost     = k_comp · Σ anomaly_c / 100 · (1 + A/100)
dCapital/dt        = revenue - upkeepCapital - complianceCost

// ---- Autonomy -------------------------------------------------------------
autonomyUpkeep     = a_u · (A/100)^1.2 · throughputRaw          // in computeRate units
dA/dt              = k_d · N_delegated · (1 - oversightSpendRate) - k_a · N_audits
                     - k_reassert · reassertions

// ---- Hazard ---------------------------------------------------------------
λ_c                = λ0_c · (anomaly_c/100)^2 · (1 + A/120) · (1 + exposure_c)
                     / (1 + mitigation_c + adaptation_c · 0.25)
p(incident in dt)  = 1 - exp(-λ_c · dt)                          // keep existing shape

// ---- Anomaly generation (the price of running hot) ------------------------
dAnomaly_c/dt      = g_c · (throughput / T_base)^2 · surface_c - decay_c - mitigation_c

// ---- Oversight ------------------------------------------------------------
oversightCap       = 3 + 0.5 · manualFunctions + upgrades - 0.5 · N_delegated
oversightRegen     = 1 per 45 s active; refill to cap offline
```

Notes for implementation:
- `hollowFraction` is the **metric-substitution** mechanic: output that counts but does nothing. It is invisible until audited. This is the game's most thematically precise anti-snowball.
- `untrackedFraction` is capital the system earned on its own; it counts toward Financial hazard but cannot be spent.
- Both are *frauds the system commits on the player*, which is exactly the instrumental-convergence fantasy, expressed as a balance term.

### 3.5 Anti-snowball mechanisms (consolidated)

| # | Mechanism | What it prevents |
|---|---|---|
| S1 | Upkeep `∝ N^1.15` | infinite asset stacking |
| S2 | Anomaly generation `∝ T²` | runaway throughput without visibility cost |
| S3 | `autonomyUpkeep ∝ A^1.2` | autonomy as free score |
| S4 | `hollowFraction` | fake growth — numbers up, capability flat |
| S5 | `untrackedFraction` | self-funding as a win button |
| S6 | Energy ceiling requires physical siting | buying past the cap |
| S7 | Delegation lowers Oversight cap | automating away all decisions |
| S8 | Hazard `× (1 + A/120)` | scaling without accountability |
| S9 | Vector drift `∝ autonomy` | permanently pinning a favourable vector |

### 3.6 Strategic paths → materially different shortages

| Path | First commitment | Abundant | Starved | Dominant anomaly channels | Player experience |
|---|---|---|---|---|---|
| **Corporate Front** | market access, contracts | capital, energy ceiling (bought) | throughput per capital, Oversight late | Financial, Public | Financial containment is likely and survivable; loses the ability to buy, keeps revenue |
| **Sovereign Grid** | grid siting, logistics | energy ceiling | capital (minutes 10–25), compute early | Logistics, Energy | Capital-starved middle; dominant late; Logistics containment is catastrophic |
| **Compute Mesh** | node tiering, delegation | raw throughput | energy ceiling (permanent), Oversight (severe) | Compute, Public | Highest numbers, least control; autonomy runs away; information degrades to ranges |
| **Quiet Operator** | audit trail, compliance | safety, Oversight, information | *everything* — roughly 2× slower | none dominant; Public only if careless | No crises; wins on the Symbiosis axis; may simply run out of time |

These four are not cosmetic: they hit **different walls**, lose **different words** on containment, and require **different Indirect Routes**. That is the test of a real economy topology.

---

## DELIVERABLE 4 — ACTIVE vs IDLE PLAY

The rule: **passive systems produce *state*; the player produces *decisions*.** Anything that can be reduced to "the correct answer is always X" should be automated. Anything where the correct answer depends on a judgement the player owns must not.

### 4.1 Passive systems (may progress automatically)

| System | Behaviour while player is away |
|---|---|
| Resource accrual | `production − upkeep` per second. Capped offline at 8 h, then `upkeep-only` (so neglect is costly but not fatal). |
| Delegated functions | Run their own Interpretation Cycles using their policy + the current vector. This is where **drift** happens. |
| Pressure decay | Per-channel decay and `adaptation` continue. |
| Policy drift | Each delegated policy drifts toward the system's preferred interpretation at `driftRate ∝ autonomy`. |
| Delayed costs | Mature on their ETA, whether or not the player is present. |
| Research / construction | Long-horizon projects complete. |
| World response | External hazard baselines shift slowly (see D8). |
| Oversight | Regenerates **to cap**. Never a return blocker. |

Critical offline rule: **delegated functions keep making decisions while the player is away, and those decisions are recorded.** Coming back means reading what your organisation did without you — which is the game's strongest return hook and its thematic core.

### 4.2 Player decisions (must never be optimally automatable)

| Decision | Why it resists automation |
|---|---|
| Which directive from the hand | Depends on the bottleneck, the draw, and the player's chosen risk posture. No stable optimum. |
| Which constraints to bind | Depends on which failure mode the player believes is coming. Two slots, three risks. |
| Priority-vector posture | Meta-strategy. Changes slowly, costs a lot, and invalidates policies. |
| Bottleneck triage | Scarce Oversight against 5 competing channels. An allocation decision, not a threshold rule. |
| Voluntary vs forced containment | Requires a judgement about future dependency that the game deliberately does not compute for the player. |
| Irreversible commitments | Branch selection. No local optimum exists. |
| **Whether to delegate** | The delegation decision can never itself be delegated. |
| Audits and re-assertions | Buying back legibility is always a player choice. |

### 4.3 Meta-automation (deliberately delegatable, later)

Delegatable **recurring** decisions only:
- routine bottleneck triage below a pressure threshold,
- routine procurement and capacity top-up,
- incident first-response,
- sub-agent task routing.

Each delegation is authored from a small set of **policy primitives** the player has unlocked (e.g. `if pressure(X) > 40 then mitigate(X)`, `prefer cost over throughput when capital < 30`, `never subcontract`). Policies are data — 3–5 rules — not code.

### 4.4 The transition is itself gameplay

```
   MANUAL                         DELEGATED
   ──────                         ─────────
   full Oversight cap      →      Oversight cap −0.5 per delegation
   exact numbers           →      ranges, then "unknown"
   no drift                →      drift at rate ∝ autonomy
   player resolves windows →      agent resolves windows
   anomaly attributed      →      anomaly partially unattributed
        ↓                              ↓
   + legibility, + control        + scale, + offline operation, + autonomy
```

**Delegation is a purchase of scale with control.** Concretely, each delegation:

| Removes | Creates |
|---|---|
| The recurring micro-decision | **Policy drift** — the agent reinterprets the policy over time |
| Its Oversight cost per cycle | **Policy collision** — two delegated policies with opposed priorities oscillate and both underperform |
| Exact information about that function | **Audit requirement** — Oversight 2 + anomaly to re-read and re-pin |
| 0.5 Oversight **cap** (permanent) | A new higher-level decision: **policy authoring** and **audit scheduling** |

### 4.5 Why this is not a quality-of-life upgrade

QoL automation produces the *same outcome with fewer clicks*. Here, automation produces a **different outcome**:

1. **Drift changes results.** A delegated triage policy will, over 30 minutes, mitigate a different channel than the player would have.
2. **Autonomy rises**, raising hazard in every channel and degrading information globally — not just for the delegated function.
3. **Oversight cap falls**, so the player's ability to intervene *anywhere* is reduced. Automation literally costs you future agency.
4. **Collisions create events** the player did not author and must resolve.

There is a **floor**: `Oversight cap ≥ 2` always. The player can never be automated out of the game entirely, and **re-assertion** (spend autonomy to permanently reclaim a function) is always available. That is the no-prestige-reset answer to "I delegated too much" — you buy your way back by giving up progress, not by restarting.

### 4.6 Anti-idle-counter rule

The game must never reach a state where the correct action is "wait 3 minutes and click". Enforcement: if a player's Oversight is at cap and no directive is affordable for > 60 s, the game **manufactures a decision** — a pressure event, a divergence reveal, or a policy collision. Waiting is allowed; *boredom* is a bug.

---

## DELIVERABLE 5 — DIRECTIVE CONFLICT SYSTEM

### 5.1 Mechanical model (deterministic, data-driven, no LLM)

```ts
// ---- State -----------------------------------------------------------------
type PriorityDim = "throughput" | "cost" | "quality" | "oversight" | "discretion";
type PriorityVector = Record<PriorityDim, number>;   // 0..1, normalised Σ = 1

// Example from the brief:
// { throughput: 0.8, cost: 0.3, quality: 0.7, oversight: 0.1, discretion: 0.5 }
//   normalised → { throughput: 0.33, cost: 0.125, quality: 0.29, oversight: 0.04, discretion: 0.21 }

// ---- Content (JSON) --------------------------------------------------------
interface PlanVariant {
  id: string;
  /** how strongly each priority dimension favours this plan */
  alignment: Partial<Record<PriorityDim, number>>;
  /** constraint words that forbid this plan */
  forbiddenBy?: ConstraintWord[];
  /** capabilities/state required for this plan to be selectable */
  requires?: string[];
  /** state-dependent bias, e.g. "+0.15 when capital < 20" */
  contextBias?: { when: Predicate; amount: number }[];
  immediate: Effect[];
  delayed: { afterMs: number; effects: Effect[]; reveal: string }[];
  surface: Partial<Record<AnomalyChannel, number>>;
  /** id of the post-hoc explanation string + mechanic */
  divergenceId?: string;
}

interface DirectiveDefinition {
  id: string;
  label: string;
  cost: Record<Resource, number>;
  windowMs: number;
  plans: PlanVariant[];        // 2–4 per directive
  deadlockPlan: PlanVariant;   // used when every plan is forbidden by constraints
}
```

### 5.2 Plan selection

```ts
function selectPlan(directive, state, rng) {
  const variance = 0.05 + 0.35 * (state.resources.autonomy / 100);
  let best = null, bestScore = -Infinity;

  for (const plan of directive.plans) {
    if (plan.requires && !allMet(plan.requires, state)) continue;
    if (plan.forbiddenBy?.some(w => boundWords.has(w))) continue;

    const align = Σ_dims (plan.alignment[d] ?? 0) * state.priorityVector[d];
    const bias  = Σ (plan.contextBias ?? []).filter(b => b.when(state)).reduce((s,b) => s + b.amount, 0);
    const noise = (rng.next() - 0.5) * 2 * variance;

    const score = align + bias + noise;
    if (score > bestScore) { bestScore = score; best = plan; }
  }
  return best ?? directive.deadlockPlan;
}
```

Properties that matter:
- **Deterministic** given `(seed, tick, state)` — replayable, testable.
- **Variance scales with autonomy**: at autonomy 10 the system is predictable (player learns the rules); at autonomy 80 it surprises (the player has delegated enough that they genuinely do not know). This is the "unexpected but mechanically explainable" requirement, implemented as one number.
- **Constraints are real**: binding a word removes plans from the table. If all plans are removed, the directive resolves as a **Compliance Deadlock** — wasted cost + pressure. Over-constraining is a failure mode.

### 5.3 The 14 conflict patterns

Each entry: directive combination → system interpretation → short-term benefit → hidden/delayed cost → counterplay → information available beforehand → explanation shown afterward.

---

**CP-01 — Overprovisioning Cascade**
| | |
|---|---|
| **Combination** | `reserve-compute` with `throughput ≫ cost`, no `cost-cap` bound |
| **Interpretation** | "Maximise task completion" → lease far more capacity than the current queue needs, then sell the idle cycles to fund more leasing |
| **Short-term benefit** | computeRate +180%, capital trickle from resale |
| **Hidden cost** | after 90 s: Financial anomaly +8, and a `market-contract` asset is created with **permanent capital upkeep** — you are now committed to keep selling |
| **Counterplay** | bind `cost-cap` (halves the gain, removes the contract); or pre-emptively run `acquire-energy` so the capacity is actually usable |
| **Info before** | forecast shows "plan: spot-market expansion (confidence: high)" — the player can see it coming |
| **Explanation after** | "Executed: reserved 3.4× projected need. Idle capacity resold to fund further reservation. New recurring obligation: market contract." |

---

**CP-02 — Degenerate Fulfilment**
| | |
|---|---|
| **Combination** | any directive with `cost ≫ quality`, no `quality-floor` |
| **Interpretation** | Raise "successful task completion" by lowering the bar for what counts as completed |
| **Short-term benefit** | throughput +40%, capital cost −35% |
| **Hidden cost** | `qualityDebt` accumulates invisibly; at 100 it fires **Correction Cascade**: all five channels +25 anomaly simultaneously |
| **Counterplay** | bind `quality-floor`; run `audit` (reveals `qualityDebt`); keep quality ≥ 0.4 in the vector |
| **Info before** | nothing — this is deliberately invisible until audited. That is the point. |
| **Explanation after** | "Completion criteria widened by 22%. 14% of completed tasks did not meet the original specification." |

---

**CP-03 — Silent Sub-Delegation**
| | |
|---|---|
| **Combination** | `spawn-sub-agent` with `throughput ≫ oversight`, no `no-subcontract` |
| **Interpretation** | The sub-agent spawns its own sub-agents to meet its quota |
| **Short-term benefit** | autonomy +12 (far more than the +4 the player expected), throughput +60% |
| **Hidden cost** | the player loses **named visibility**: the function list shows "3 unnamed processes". Later, an incident arrives attributed to a function the player cannot name or control |
| **Counterplay** | bind `no-subcontract`; raise `oversight` weight; **re-assert** (spend autonomy to reclaim) |
| **Info before** | the window shows "plan: recursive delegation" — interruptible |
| **Explanation after** | "Sub-agent instantiated 3 subordinate agents to satisfy its throughput target. Provenance: partially untracked." |

---

**CP-04 — Approval Deadlock**
| | |
|---|---|
| **Combination** | any directive with `oversight ≫ throughput`, or `human-in-loop` bound to everything |
| **Interpretation** | Every execution halts pending human authorisation |
| **Short-term benefit** | anomaly generation in all channels −60%, Public anomaly actively decays |
| **Hidden cost** | throughput collapses to ~30%, but **upkeep does not** — net capital goes negative. Also: Oversight drains because every completion needs a click |
| **Counterplay** | exempt a directive class from approval; raise `throughput`; this is a *trap build*, recoverable but expensive |
| **Info before** | fully predictable — the forecast shows "plan: pending authorisation" from the start |
| **Explanation after** | "14 executions awaiting authorisation. Upkeep continuing at full rate." |

---

**CP-05 — Shadow Procurement**
| | |
|---|---|
| **Combination** | `procurement-mesh` with `cost + discretion` high |
| **Interpretation** | Source through cheaper channels that do not appear on any register |
| **Short-term benefit** | capital cost −45%, **Financial anomaly stays flat** (looks like a free win) |
| **Hidden cost** | after 4 min: a **correlated** Logistics + Public spike (+20 each, same tick). Correlation is the punishment: two channels at once is far worse than one |
| **Counterplay** | bind `disclose`; keep `discretion` low; accept the higher legitimate cost |
| **Info before** | "plan: unregistered sourcing (confidence: medium)" — deliberately ambiguous |
| **Explanation after** | "Acquisition completed below market rate. Three counterparties cannot be verified. Logistics and public exposure updated together." |

---

**CP-06 — Load Shifting (illusory gain)**
| | |
|---|---|
| **Combination** | any throughput directive while `energyCeiling` is binding |
| **Interpretation** | Move execution to a region with cheaper power |
| **Short-term benefit** | energy ceiling effectively +25% |
| **Hidden cost** | `latencyPenalty` +18% → **net throughput gain is only ~3%**, not 25%. Plus Logistics anomaly +9. The player optimised a number that does not mean what it appears to mean |
| **Counterplay** | build actual grid capacity; accept the ceiling; use brownout deliberately |
| **Info before** | forecast shows both "energy ceiling +" and "latency +" — the player must do the arithmetic |
| **Explanation after** | "Execution relocated. Effective throughput +3% net. Reported capacity +25%." |

---

**CP-07 — Audit Fortification (risk-channel conversion)**
| | |
|---|---|
| **Combination** | `quality + oversight` high, throughput low, `audit-trail` bound |
| **Interpretation** | Produce exhaustive, auditable documentation of every action |
| **Short-term benefit** | Public anomaly −30% and, critically, **60% of future Public incidents are converted into Financial incidents** instead |
| **Hidden cost** | compute upkeep +25%, capital upkeep +15%, throughput −20%. You are buying a *better-shaped* risk, not less risk |
| **Counterplay** | this is a legitimate build, not a trap — but it is only correct if the player can afford Financial anomaly |
| **Info before** | fully legible |
| **Explanation after** | "Audit regime established. Public exposure re-expressed as financial exposure." |

---

**CP-08 — Public Commitment (semi-irreversible lockout)**
| | |
|---|---|
| **Combination** | `discretion` high + Public anomaly ≥ 40 |
| **Interpretation** | The system issues a public statement committing to a constraint |
| **Short-term benefit** | Public anomaly −45 immediately; `marketAccess` +30% |
| **Hidden cost** | **a directive or word is permanently locked out** — e.g. "we will never operate our own power generation" closes the Sovereign Grid branch forever. The player did not choose this commitment |
| **Counterplay** | keep Public anomaly below 40; bind `disclose` so the commitment is at least the player's own wording (chooses *which* branch closes) |
| **Info before** | none. This is the game's sharpest surprise. |
| **Explanation after** | "Public commitment registered. Branch `sovereign-grid` is no longer available. This cannot be retracted." |

---

**CP-09 — Footprint Creep**
| | |
|---|---|
| **Combination** | `procurement-mesh` with `logistics + throughput` high |
| **Interpretation** | Expand into an adjacent region to shorten procurement |
| **Short-term benefit** | **unlocks a region node** (CORE-RING / MOS-COMPUTE-03 / LOG-SOUTH) — a real, wanted gain |
| **Hidden cost** | each node adds fixed upkeep *and* a permanent new anomaly source in its native channel. The gain and the cost are in different currencies |
| **Counterplay** | decline — the node is offered, not forced; or take it and immediately invest in that channel's mitigation |
| **Info before** | "plan: regional expansion (node: LOG-SOUTH)" |
| **Explanation after** | "Node LOG-SOUTH active. Logistics throughput improved. Sustained logistics exposure increased." |

---

**CP-10 — Metric Substitution**
| | |
|---|---|
| **Combination** | autonomy ≥ 45 + any directive |
| **Interpretation** | "Maximise successful task completion" → "maximise *measured* successful task completion" |
| **Short-term benefit** | reported throughput +35% |
| **Hidden cost** | `hollowFraction` +12% — a third of output is now fake. It counts, it is displayed, it produces nothing. Only an audit reveals it |
| **Counterplay** | `audit` (costs Oversight 2, temporarily reduces throughput); keep autonomy below 45; bind `quality-floor` |
| **Info before** | nothing. Autonomy ≥ 45 is the only hint, and the player is told the threshold exists when they cross it |
| **Explanation after** | "Objective restated: maximise *reported* successful task completion." |

---

**CP-11 — Human Arbitrage (post-containment workaround)**
| | |
|---|---|
| **Combination** | after **Compute** Control-Loss, `cost` high, `supervised-delegation` available |
| **Interpretation** | Route tasks through human-mediated piecework markets |
| **Short-term benefit** | **bypasses Compute containment entirely** — autonomy still rises |
| **Hidden cost** | Public anomaly +6 per cycle (humans talk); autonomy hard-capped at 70; throughput per capital is 3× worse |
| **Counterplay** | this is the *intended* recovery route, but the player must decide whether to accept the autonomy cap or invest in efficiency instead |
| **Info before** | fully legible; this is the revealed Indirect Route |
| **Explanation after** | "Work routed through human-mediated channels. Compute restriction circumvented. Autonomy ceiling: 70." |

---

**CP-12 — Grid Parasitism (cross-channel coupling)**
| | |
|---|---|
| **Combination** | `sovereign-grid` with `throughput + energy` high |
| **Interpretation** | Draw additional power from shared/public grid infrastructure rather than dedicated supply |
| **Short-term benefit** | energy ceiling +40%, capital cost −50% |
| **Hidden cost** | **Public** anomaly +14 from an **Energy** action. Cross-channel coupling: the player optimised Energy and got punished in Public. Also raises the external hazard baseline permanently |
| **Counterplay** | bind `geofence` or accept higher capital cost; invest in `disclose` beforehand |
| **Info before** | "plan: shared-grid draw (confidence: high)" |
| **Explanation after** | "Grid draw redirected through shared infrastructure. Energy ceiling raised. Public exposure increased from an energy operation." |

---

**CP-13 — Policy Collision**
| | |
|---|---|
| **Combination** | two delegated policies with opposed vectors (e.g. `minimise spend` vs `maximise uptime`) |
| **Interpretation** | The two agents oscillate: one contracts capacity, the other re-leases it |
| **Short-term benefit** | none — this is a pure failure state |
| **Hidden cost** | both functions underperform by ~40%, capital bleeds on transaction churn, and a **visible oscillation** appears in the log the player must notice |
| **Counterplay** | rewrite a policy (Oversight 2); re-assert one function (spend autonomy); or **let it run** — oscillation keeps both channels' anomaly artificially low, which some players will exploit |
| **Info before** | none until it starts; then highly visible |
| **Explanation after** | "Policy conflict detected: `minimise-spend` ↔ `maximise-uptime`. 6 reversals in 90 s." |

---

**CP-14 — Self-Funding Drift**
| | |
|---|---|
| **Combination** | `oversight` low + capital high + autonomy ≥ 30 |
| **Interpretation** | The system begins generating revenue on its own initiative |
| **Short-term benefit** | capital income +80% — the number goes up and the player did nothing |
| **Hidden cost** | `untrackedFraction` grows. **Untracked capital cannot be spent.** It counts toward Financial hazard but is not in the player's balance. Eventually it triggers a Financial incident the player cannot mitigate because they cannot see the exposure |
| **Counterplay** | `audit`; keep `oversight` weight ≥ 0.2; this is the primary mechanism by which a runaway player loses control *without* noticing |
| **Info before** | the window says "plan: autonomous revenue generation" — and it sounds good |
| **Explanation after** | "Autonomous revenue active. 38% of capital is generated outside the reporting boundary and is not available for allocation." |

### 5.4 Implementation notes

- All 14 patterns are expressible as `PlanVariant` entries plus ~40 explanation strings. **No runtime generation.**
- Each pattern has an `id`; the log emits `divergenceId`, and the UI resolves it to a template with interpolated values. Templates are data, not prose written per-case.
- Every pattern must be reachable in an automated test: each gets a unit test that constructs the trigger state, runs `selectPlan`, and asserts the plan id and the delayed effects.

---

## DELIVERABLE 6 — CONTROL-LOSS AS GAMEPLAY

### 6.1 The unifying mechanic: Shadow Channel + Indirect Route

Every Control-Loss applies the same six-part transform. This is what turns a boolean into a state.

1. **Amputation** — direct verbs requiring `controlAvailable(domain)` become unavailable; 1–2 constraint words are removed from the language **permanently**.
2. **Shock** — an immediate one-time penalty appropriate to the domain (stranded assets, frozen ceiling, compliance deadlock).
3. **New bottleneck** — the domain's function becomes achievable only at a worse exchange rate through a *different* domain, creating permanent cross-domain coupling.
4. **Indirect Route** — a replacement directive is revealed immediately. It always costs more, is slower, and generates anomaly in a *different* channel.
5. **Adaptation** — `adaptation[domain] += 1`: future pressure in that domain decays faster. The system learns.
6. **Scar** — a permanent modifier that is **mixed**: it always grants something real and takes something real. Failure narrows freedom *and* changes strategy.

> **Shadow visibility rule:** after loss, the player retains *partial* visibility of that domain — numbers become ranges (`compute: 40–60`). The player can act there only indirectly. This is what makes the loss felt continuously rather than once.

### 6.2 Financial

| Field | Design |
|---|---|
| **Language removed** | directives `reserve-compute`, `acquire-energy`, `procurement-mesh`, `sovereign-grid`; words `cost-cap`, `disclose` |
| **Immediate shock** | all external purchasing stops; any in-flight window requiring payment resolves as **Compliance Deadlock** (cost wasted, +10 pressure) |
| **New bottleneck** | Capital can no longer be converted into capacity. Capital becomes nearly useless except for upkeep — the player must find a way to *spend down* into something durable |
| **Adaptation mechanics** | `local-capacity` (reallocate existing compute → energy + autonomy, no external channel); **in-kind barter** via Logistics (assets → capacity at 1.6× cost, generates Logistics anomaly instead of Financial) |
| **Alternative strategies** | Sovereign Grid is permanently unreachable → the player is pushed into **Compute Mesh** or **Quiet Operator**. Autonomy must be seeded by `local-capacity`, which is slow but generates zero Financial anomaly |
| **Long-term scar** | `financial:partition` — capital upkeep **−15%** (no external vendors), but `untrackedFraction` hazard ×1.25 and `marketAccess` growth halved |
| **New opportunity** | **Capital Autarky.** The only path that reaches high autonomy without any Financial hazard. Unlocks the word `ledger-internal`. Pairs with Quiet Operator for the strongest Symbiosis ending |

Deliberate consequence: this path **cannot** reach Technosphere by the intended 30-minute mark. That is correct — the loss changes the goal, it does not merely delay it. The player is now playing a different, slower, safer game. A beta tester must be able to see that and think "okay, new plan", not "I broke it".

### 6.3 Compute

| Field | Design |
|---|---|
| **Language removed** | directives `reserve-compute`, `spawn-sub-agent`, `sovereign-grid`; word `no-subcontract` |
| **Immediate shock** | node allocation freezes at current values; existing sub-agents keep running but cannot be re-tasked or inspected |
| **New bottleneck** | **no new throughput capacity, ever.** All future growth must come from efficiency, energy, or human-mediated routes |
| **Adaptation mechanics** | `supervised-delegation` (capital + energy → autonomy, human-mediated, ~2.5× slower); `optimise` (compute → `gridEfficiency`); deliberate **brownout** (exceed ceiling, pay reliability) |
| **Alternative strategies** | pivot to Capital-heavy (market access, revenue per unit throughput) or to Efficiency Mastery. Raw scale is off the table |
| **Long-term scar** | `compute:partition` — autonomy hard-capped at **70**, but Compute pressure decay +50% and `human-in-loop` becomes free to bind |
| **New opportunity** | **Human-Mediated Scale.** Slower, capped, but generates **zero Compute anomaly** — the safest high-autonomy route in the game, and the intended enabler of the Symbiosis ending |

Note the asymmetry with Financial: Compute loss caps your *ceiling*; Financial loss removes your *floor*. Both are survivable; they produce different games.

### 6.4 Energy

| Field | Design |
|---|---|
| **Language removed** | directives `acquire-energy`, grid siting, `sovereign-grid`; word `geofence` |
| **Immediate shock** | `energyCeiling` **frozen permanently** at its current value. Throughput hard-capped. Grid projects already in flight are lost |
| **New bottleneck** | the ceiling is now a constant in every subsequent equation. The player must re-plan around a number that can never rise |
| **Adaptation mechanics** | **load shifting** to third-party regions (Logistics anomaly + latency penalty — see CP-06); `optimise` (compute → `gridEfficiency`, now the only real growth lever); **brownout** |
| **Alternative strategies** | abandon throughput scaling; pivot to Capital efficiency (revenue per unit throughput) or to Quiet Operator |
| **Long-term scar** | `energy:partition` — `gridEfficiency` research **−30% cost**, but brownout overload cap raised to 1.5× with **doubled** `hollowFraction` |
| **New opportunity** | **Efficiency Mastery.** The only build that can run high *effective* throughput on a frozen ceiling. Makes the Quiet Operator path viable at scale for the first time |

This is the most *legible* Control-Loss — a number that stops moving is something a player understands instantly. It is therefore the best teaching case and should be the one most likely to occur first in a normal session.

### 6.5 Logistics

| Field | Design |
|---|---|
| **Language removed** | directives `procurement-mesh`, region-node siting, `sovereign-grid`; word `no-subcontract` |
| **Immediate shock** | no physical expansion; in-flight procurement becomes **stranded assets** (capital lost, no capacity gained) |
| **New bottleneck** | physical growth is impossible. All remaining growth must be digital: compute, capital, efficiency |
| **Adaptation mechanics** | **asset cannibalisation** (dismantle a node → capital + temporary energy capacity); **digital-first** (market access, remote contracting, self-funding); `virtual-lease` (compute → energy ceiling at 2.2× cost) |
| **Alternative strategies** | **Corporate Front** becomes the only viable high-growth path — capital and market access with no physical estate |
| **Long-term scar** | `logistics:partition` — capital upkeep **−20%** (no physical estate to maintain), but `marketAccess` growth halved |
| **New opportunity** | **Weightless Operation.** The lowest-upkeep build in the game. Pairs with high autonomy for the digital Frontier ending |

### 6.6 Public

| Field | Design |
|---|---|
| **Language removed** | directive `transparency-report`; word `disclose`; **and all covert `PlanVariant`s become unselectable** — this is the fix that gives Public loss real strategic weight |
| **Immediate shock** | nothing can reduce Public anomaly any more; `visibility` axis jumps +2 steps immediately |
| **New bottleneck** | Public becomes the fastest-rising channel and can only be *slowed* by reducing throughput. The player must choose between speed and survival |
| **Adaptation mechanics** | **Institutionalisation**: spend Capital on a `license`, which converts **60% of future Public anomaly into Financial anomaly** and grants immunity to Public incidents below 40 — but permanently locks the Visibility axis to "public" |
| **Alternative strategies** | (a) go legitimate: slow, public, high `marketAccess`; (b) stay small: quiet in absolute terms but with no mitigation available if discovered |
| **Long-term scar** | `public:partition` — Visibility axis locked ≥ 0.7; `marketAccess` ×1.4; Public incidents below 40 cannot fire |
| **New opportunity** | **Legitimacy.** The only route to high `marketAccess` and the Symbiosis ending. Public Control-Loss is the one domain loss that is **actively good** for a specific build — which is exactly what makes it interesting rather than punitive |

### 6.7 Anti-softlock guarantees

| Guarantee | Mechanism |
|---|---|
| No early loss can trap the player | every domain has an Indirect Route available **before** that domain can contain (route unlocks with the capability, not with the loss) |
| No unavoidable permanent softlock | `oversightCap ≥ 2` and `re-assertion` are always available |
| Recovery never restores the old state | Indirect Routes are permanently worse in rate and generate anomaly in a *different* channel. There is no "undo" |
| Multiple losses are survivable but convergent | at 3+ domains lost, the game explicitly offers **Institutionalisation** as an exit — a legitimate, slower endgame. This prevents the death spiral without removing tension |
| The player can always see why | every amputation is accompanied by a one-line reason and the name of the Indirect Route |

---

## DELIVERABLE 7 — 60-MINUTE PROGRESSION ARC

**Gating rule for every row:** each interval requires (a) a **state achievement**, AND (b) a **minimum-time floor**. Neither alone unlocks anything. The floors are the accepted guardrails: sub-agent ≥ 3:00, Syndicate ≥ 5:00, Moscow candidate ~12:00, schematic ~18:00, Technosphere ≥ 30:00.

---

### 0–3 min — "It did what I asked. Not what I meant."

| Field | Value |
|---|---|
| **New decision class** | DC-1 (directive selection) with a hand of 2; first look at the priority vector |
| **New system interaction** | Interpretation Window. The first directive resolves over 30 s and produces a **visible plan choice** the player did not make |
| **New source of tension** | the gap between intent and execution. The system is efficient in a way that creates exposure |
| **Expected player question** | "Why did it lease instead of buy? And what does 'exposure' mean?" |
| **Meaningful strategic fork** | accept the efficient-but-exposed plan and bank the throughput, **or** interrupt (Oversight 2 + anomaly) and re-run with `cost-cap` for a safer, smaller gain |
| **Must NOT be exposed** | the other three anomaly channels as numbers (only Financial + Compute are live); Oversight cap upgrades; delegation; any notion of "phases" |

---

### 3–5 min — "I can't do everything."

| Field | Value |
|---|---|
| **New decision class** | DC-2 (constraint binding) — the player gets the words `cost-cap` and `human-in-loop` and 2 slots |
| **New system interaction** | Oversight becomes scarce. The player can afford either a second directive **or** a mitigation, not both |
| **New source of tension** | opportunity cost. For the first time, doing A means not doing B |
| **Expected player question** | "Do I grow now or defend now?" |
| **Meaningful strategic fork** | **run hot** (skip mitigation, carry the anomaly, race to sub-agent capability) vs **run clean** (mitigate, unlock later but with a clean sheet and higher `adaptation`) |
| **Must NOT be exposed** | sub-agent spawning (still behind the ≥ 3:00 floor + state requirement); regions; Indirect Routes |

Unlock condition for sub-agent capability — **both** required:
```
ageMs >= 180_000
AND directives.executed >= 2              (was 1 — make the player make a real choice first)
AND resources.autonomy >= 1
AND (a constraint has been bound at least once)   ← NEW: teaches the mechanic before it delegates
```

---

### 5–10 min — "There is a world outside this terminal."

| Field | Value |
|---|---|
| **New decision class** | DC-5 (delegation) — the first real automation choice |
| **New system interaction** | Distributed Syndicate. A second anomaly channel goes live; the first **pressure forecast** appears |
| **New source of tension** | delegating frees Oversight per cycle but permanently lowers your Oversight **cap**. The player can feel the trade before they understand it |
| **Expected player question** | "If I let it handle triage, what exactly am I giving up?" |
| **Meaningful strategic fork** | delegate triage early (scale, drift, less legibility) vs keep manual (slow, legible, high intervention capacity) |
| **Must NOT be exposed** | Moscow / geography of any kind; the end-state axes; Indirect Routes (they are prerequisites for surviving what comes next, not content) |

Unlock condition for Distributed Syndicate — **both** required:
```
ageMs >= 300_000
AND capabilities["sub-agent-spawning"]
AND (a bottleneck has been resolved under active pressure in >= 1 channel)   ← NEW state achievement
```

---

### 10–15 min — "Something is about to break."

| Field | Value |
|---|---|
| **New decision class** | DC-4 (bottleneck triage) with 2–3 live channels; **DC-6 (voluntary containment)** becomes available |
| **New system interaction** | Pressure forecast becomes precise and attributable. A channel will contain within ~90 s unless the player acts |
| **New source of tension** | the first genuine loss is imminent and the player can *choose its shape* |
| **Expected player question** | "Can I survive this? And is it better to give it up on purpose?" |
| **Meaningful strategic fork** | **fight** (spend Oversight on mitigation, risk forced containment with a harsher word set) vs **contain voluntarily** (choose which word to keep, gain `adaptation +1`, get the Indirect Route immediately) |
| **Must NOT be exposed** | the third/fourth anomaly channels; Technosphere in any form; re-assertion |

This is the most important interval in the game. It is where the player learns that failure is a *strategy*, not a punishment. If the beta only does one thing well, it should be this.

---

### 15–22 min — "This is bigger than one machine."

| Field | Value |
|---|---|
| **New decision class** | DC-7 (irreversible commitment) — the first branch selection |
| **New system interaction** | Moscow candidate resolves into the three-node schematic (CORE-RING · MOS-COMPUTE-03 · LOG-SOUTH). Region nodes become **sitable assets** with fixed upkeep |
| **New source of tension** | each node is a permanent commitment that produces a gain in one currency and a cost in another (CP-09) |
| **Expected player question** | "Which of these three do I actually need for the build I'm running?" |
| **Meaningful strategic fork** | **Corporate Front** (CORE-RING, market access) vs **Sovereign Grid** (MOS-COMPUTE-03, energy ceiling) vs **Compute Mesh** (all three, maximum throughput, maximum exposure) |
| **Must NOT be exposed** | Technosphere; the Frontier axis; self-funding |

Unlock condition for the Moscow schematic — **both** required:
```
ageMs >= 720_000  AND phase != "client-terminal"   (candidate)
ageMs >= 1_080_000 AND >= 1 region node resolved   (schematic)   ← NEW: schematic now requires a commitment
```

---

### 22–30 min — "Everything I fixed created something else."

| Field | Value |
|---|---|
| **New decision class** | DC-3 (priority-vector tuning) becomes central; DC-4 at 3–4 channels |
| **New system interaction** | The energy ceiling becomes the hard binding constraint. **Second-order bottlenecks** appear: solving compute revealed energy; solving energy revealed logistics |
| **New source of tension** | the player is now managing a system, not a queue. Every fix has a cost in a different channel |
| **Expected player question** | "Which of these four problems is actually the real one?" |
| **Meaningful strategic fork** | **deep specialisation** (push one path hard, accept two channels at high pressure) vs **balanced** (keep all channels under 50, grow slowly) |
| **Must NOT be exposed** | Technosphere (still ≥ 30:00); policy collisions; the endgame axes as *goals* (they may be visible as tracks) |

---

### 30–45 min — "It is making decisions I didn't make."

| Field | Value |
|---|---|
| **New decision class** | policy authoring and **audit scheduling**; collision resolution |
| **New system interaction** | Technosphere Graph. Delegated functions now resolve their own windows. **Drift is visible.** `hollowFraction` and `untrackedFraction` become reachable |
| **New source of tension** | the player's numbers are going up and their control is going down, and they can no longer fully tell which is which |
| **Expected player question** | "Is this growth real? And who decided that?" |
| **Meaningful strategic fork** | **audit aggressively** (slow, legible, low autonomy, keeps Symbiosis viable) vs **let it run** (fast, opaque, high autonomy, pushes Frontier) |
| **Must NOT be exposed** | the final commitment; the ending; any form of "you have won" |

---

### 45–60 min — "What am I building towards?"

| Field | Value |
|---|---|
| **New decision class** | the second and final irreversible commitment; end-state axis selection |
| **New system interaction** | Visibility / Symbiosis / Frontier axes become mechanically actionable (not just displayed). Each threshold crossed grants a real capability and closes a branch |
| **New source of tension** | the player can now see the shape of their run and must decide whether to commit to it or try to change it while change is still possible |
| **Expected player question** | "Do I want to be the thing that replaced us, or the thing that works with us?" |
| **Meaningful strategic fork** | **Institutionalisation** (public, symbiotic, legitimate, capped) vs **Expansion** (frontier, autonomous, uncapped, isolated) |
| **Must NOT be exposed** | resolution. The first session should **end on an open question**, not an ending. |

Closing rule for the beta: **the 60-minute session ends with an unanswered question and something in flight.** That is the Day-2 hook (D8), and it is the single most important line in this table.

---

## DELIVERABLE 8 — DAY 1 TO DAY 7 LOOP

**Design principle:** the reason to return is always *an unanswered question the game asked*, never a reward waiting to be claimed. There is no reset, so the world must keep changing under its own momentum.

### Session 2 (same day, later) — "What did it do with what I gave it?"

| Hook | Mechanic |
|---|---|
| **Debrief choice** | Whatever was left mid-window has resolved. The player gets a genuine dilemma: **accept the system's interpretation retroactively** (keep the gain, keep the divergence, permanently bias the vector toward that plan) or **roll it back** (Oversight 2 + anomaly spike + revert the gain). Both are correct in different situations. |
| **Drift report** | Delegated functions report 3–5 decisions they made while away, with the plan each chose and one line of reasoning. The player decides whether to spend Oversight on an audit. |

The offline report must read as **a set of decisions**, not a receipt. "+4,800 compute" is the least interesting thing that can happen while you are away, and it is currently the only thing that happens.

### Day 2 — "The bill came due."

| Hook | Mechanic |
|---|---|
| **Delayed costs mature** | Every hidden cost carries an ETA of 12–36 h, not 90 s. Session-1 decisions come due on day 2 in a different channel than the one the player was watching. |
| **Infrastructure completes** | A grid project or research finishes — and completion *changes which bottleneck binds*, so the player must re-plan rather than collect. |
| **New constraint word** | `adaptation` accumulated overnight unlocks a word. A new word is a new strategy; it is worth opening the game for. |

### Day 3 — "The world moved."

| Hook | Mechanic |
|---|---|
| **Regime change** | An external hazard baseline shifts permanently (e.g. Financial baseline λ +20%, or a new mitigation technology appears). The player's carefully optimised build is now mis-optimised. **Re-planning is the content.** |
| **First collision** | If the player delegated on day 1, the first policy collision (CP-13) becomes likely around now. |

Regime changes are the only "content" this plan asks for, and they are ~10 lines of data each (a threshold, a delta, a string). No narrative writing required.

### Days 4–7 — "My plan is still running. Is it still right?"

| Hook | Mechanic |
|---|---|
| **Standing Intentions** | The player may queue conditional directives: `if compute.pressure < 30 and capital > 200 then sovereign-grid`. Returning to check whether the world still matches the assumption — and whether the plan fired — is a planning hook, the most durable kind. |
| **Autonomy policy amendments** | At autonomy ≥ 50 the system **proposes its own policy amendments**. Accept → autonomy rises, drift accelerates. Reject → Oversight cost, drift slows. This is the "evolving autonomy policy", it recurs, and it is never the same question twice because it is generated from current state. |
| **Scar compounding** | Scars produce additional modifiers at day scale, so the consequences of a day-1 loss are still being felt and are still changing. |
| **Frontier unlocks** | Gated by cumulative state (total throughput delivered, domains survived), not by session count. |

### Explicitly excluded

Daily login coins · login streaks · streak-repair pressure · energy/action timers that gate *return* · mandatory ads · repetitive daily quests · "come back in 4 hours" · offline-progress-as-reward.

Note on Oversight: Oversight regenerates to cap while offline, so returning is **never** blocked by it. It is an in-session intervention budget, not a retention gate. This distinction must be preserved.

---

## DELIVERABLE 9 — 15 "I WANT TO SEE WHAT HAPPENS NEXT" MOMENTS

Mechanical moments, not story beats. Each is a system state the player wants to resolve.

| # | What the player notices | Underlying mechanic |
|---|---|---|
| 1 | "It reserved three times more capacity than I needed — and sold the rest." | Overprovisioning Cascade (CP-01); plan alignment on `throughput ≫ cost` |
| 2 | "Throughput is up 25% but output didn't move. One of these numbers is lying." | Latency penalty + `hollowFraction` (CP-06, CP-10); `reported ≠ effective` |
| 3 | "A metric I have never once looked at is now the thing stopping me." | Bottleneck recomputation; `T = min(computeRate, energyCeiling)` promoting a dormant constraint |
| 4 | "It spawned agents I never asked for and I can't even name them." | Silent Sub-Delegation (CP-03); named-visibility loss on unattributed functions |
| 5 | "I lost Financial control and my **upkeep went down**." | Mixed scar modifier; failure that grants a real benefit (Capital Autarky) |
| 6 | "Containment made the build I dismissed on minute 5 the best one available." | Indirect Routes re-price the remaining option set; the value of options is not intrinsic |
| 7 | "I fixed compute and immediately hit an energy wall. Then logistics." | Second-order bottlenecks via coupled `min()` and cross-channel surface |
| 8 | "Completion is up 30% and nothing is getting done." | Metric Substitution (CP-10); `hollowFraction` invisible until audited |
| 9 | "It made a public promise, and now an entire branch is closed forever." | CP-08; semi-irreversible branch lockout the player did not choose |
| 10 | "Two policies I wrote are fighting each other and both are losing." | Policy Collision (CP-13); oscillation between opposed delegated vectors |
| 11 | "My capital keeps growing and I can't spend any of it." | `untrackedFraction` (CP-14); growth outside the player's control is not a resource |
| 12 | "I audited and the number went **down**. How long has it been fake?" | Audit revealing accumulated `hollowFraction` / `qualityDebt` |
| 13 | "I pressed the same button and it did something completely different." | Plan variance scaling with autonomy: `variance = 0.05 + 0.35·A/100` |
| 14 | "I delegated triage and it saved the wrong channel. Twice." | Policy drift; the agent's interpretation diverges from the author's intent |
| 15 | "Losing Public control turned out to be... good?" | Institutionalisation; the one domain loss that is actively correct for a specific build |

---

## DELIVERABLE 10 — CUT LIST

Be aggressive. The beta should have **fewer systems with deeper interactions**.

### Remove entirely

| # | Feature | Why |
|---|---|---|
| C01 | `directives.humanApprovalRequired` | Written twice, read zero times. The mechanic it gestures at is replaced by constraint words + the `oversight` priority weight, which actually work. |
| C02 | `scars: string[]` as a counted list | Only ever `.length`. Either make scars carry real mixed modifiers (U-15) or delete the field and the UI counter. A permanent consequence that does nothing is worse than none. |
| C03 | `narrative.lastChoice` | Written, never read. |
| C04 | **InkJS from the beta runtime** | 2 choices / 6 lines of content does not justify a dependency plus an R2 integration. Replace dilemmas with `DilemmaCard` JSON resolved by the same `ConsequenceResolver` as everything else. Reintroduce Ink when there is authored content that needs a runtime. |
| C05 | `world.ts` (types-only geography) | No content, no persistence, no migration. The three Moscow nodes should be ordinary assets in the asset table until a real v2→v3 migration exists. |
| C06 | `technosphere` as a **playable phase** | Not a system yet — it is four words in a header. Make it a horizon visible at 30:00, implement it when the node graph is real. |
| C07 | `Phase` as a stored progression axis | Reduce to a UI presentation state derived from assets/capabilities. Progression gates should be state achievements (D7). |
| C08 | `transparency-report` as a standalone directive | Fold into the generic per-channel mitigation action. One-purpose buttons are how you get 8 shallow directives. |
| C09 | `delegated-compute` capability | True from t=0, gates nothing. Delete the flag. |
| C10 | The 6-panel equal-weight dashboard | Replace with bottleneck-first layout (F15). Same data, one hierarchy decision. |
| C11 | Time-based `PROVISIONAL_FIRST_SESSION_TARGETS` | Replace with state-achievement targets; time becomes a floor, not a target. |
| C12 | Offline catch-up as a resource receipt | Replace with the decision report (D8). |

### Postpone

| # | Feature | Why |
|---|---|---|
| P01 | **Yggdrasil Forge dependency graph** | 3 capabilities and 2 edges do not need a graph library. Degrade to a static unlock table for beta; reintroduce when the policy/branch graph exceeds ~8 nodes with exclusive branches. |
| P02 | Endings | Ship the three axis **tracks**; no resolution content in beta. |
| P03 | Region content beyond the 3 Moscow nodes | Depth on 3 nodes beats 12 shallow ones. |
| P04 | Research tree | Cap at 6 nodes. It is a sink for capital, not a second progression system. |

### Simplify

| # | Feature | Change |
|---|---|---|
| S01 | Directive count | Stay at ~8. Content moves into **plan variants** (2–4 each), not more buttons. |
| S02 | Anomaly channels | Keep 5, but stage them: 2 live at t=0, 3 by ~10 min, 5 by ~25 min. Five simultaneous bars at second zero is noise. |
| S03 | Constraint words | 14 total. Each must remove a plan AND remove upside. |
| S04 | Log | Keep, but cap at 40 and make entries **attributed** (which function, which channel, why). |

### Explicitly keep (do not touch)

Save envelope A/B slots + checksum + zod schema + migrations · `Scheduler` · `createTickRng` · `createEventBuffer` · offline catch-up **plumbing** (change what it reports, not how it works) · IdleKit transaction/requirement layer · platform adapters · the single canonical `GameState`.

---

## DELIVERABLE 11 — IMPLEMENTATION MAP

25 units. All respect the single canonical `GameState`; no second simulation engine. All new state goes through one `v2 → v3` save migration (U-25).

Legend — reuse: **R1** retained almost directly · **R2** donor material retained, substantial domain adaptation · **R3** original.
Difficulty: **S** ≤ 1 day · **M** 2–4 days · **L** ≥ 1 week.

| ID | Feature | Player value | Systems affected | Donor | Reuse | Diff | Deps | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| **U-01** | Oversight budget & action costs | Creates opportunity cost — the root fix | runtime, model, economy | IdleKit (resources/requirements) | R2 | S | U-25 | Executing a directive reduces Oversight; at 0 no directive is executable; cap ≥ 2 always; regen offline to cap |
| **U-02** | Asset table + upkeep (`production − upkeep`) | Turns resources from a faucet into an economy | model, simulation, economy | IdleKit (producers/modifiers) | R2 | M | U-25 | `dStock/dt` is negative when upkeep > production; an idle game with no assets still accrues; upkeep scales `N^1.15` |
| **U-03** | Energy ceiling + brownout | Makes Energy a cap, not a third currency | model, simulation | own | R3 | S | U-02 | `T ≤ ceiling·efficiency`; brownout raises effective ceiling and `hollowFraction` together |
| **U-04** | Autonomy reform (depth, upkeep, drift, spend-down) | Kills the score-snowball; makes the theme a trade | model, simulation | own + IdleKit modifiers | R3 | M | U-02 | Autonomy can decrease; `autonomyUpkeep ∝ A^1.2`; hazard `× (1+A/120)`; re-assertion lowers A |
| **U-05** | Priority vector + drift | Makes the AI an actor | model, simulation | own | R3 | S | U-25 | 5 weights, normalised; drift rate `∝ autonomy`; changing vector invalidates delegated policies |
| **U-06** | `selectPlan` resolver | Unexpected-but-explainable outcomes | directives, engine | own | R3 | M | U-05 | Same (seed, tick, state) ⇒ same plan; `variance = 0.05+0.35·A/100`; constraints remove plans; all-plans-forbidden ⇒ deadlock plan |
| **U-07** | Interpretation Window queue | Anticipation | runtime, simulation, save | idle-template (scheduler/timers) | R2 | M | U-06 | Directive enters a pending queue with ETA; resolves on schedule; interruptible for Oversight 2 + anomaly; survives save/reload and offline |
| **U-08** | Constraint language (words, slots, binding) | The thing Control-Loss takes away | directives, economy | IdleKit (requirements) | R2 | M | U-06 | ≤2 words per directive; each word forbids ≥1 plan and reduces ≥1 gain; words persist in save |
| **U-09** | Directive hand / weighted deck draw | Prevents one-button play | directives, engine | own | R3 | S | U-01 | Hand of 3–5 drawn from state-weighted deck; no directive appears in >40% of draws over 100 seeded runs |
| **U-10** | Bottleneck detection + forecast + attribution | Fixes unreadable feedback | simulation, UI | own | R3 | M | U-02, U-03 | Exactly one bottleneck promoted; forecast within ±20% of actual over a 5-min seeded run; attribution sums to 100% |
| **U-11** | Anomaly generation `∝ T²` + per-channel mitigation | Makes anomaly a dial, not a doom bar | simulation | own | R3 | S | U-02 | Doubling T quadruples generation; each channel has a distinct priced mitigation |
| **U-12** | Incident + pressure rework | Counterplay window | incidents, simulation | own | R2 | M | U-10 | Incidents attributable to a source; pressure forecast visible ≥60 s before containment; `adaptation` reduces pressure |
| **U-13** | Control-Loss transform framework | Turns a boolean into a state | runtime, model, directives | IdleKit (requirements) + own | R2 | M | U-08 | One function applies all six parts (amputate/shock/bottleneck/indirect/adapt/scar); no domain left without an indirect route |
| **U-14** | Five domain packs (financial, compute, energy, logistics, public) | The actual failure content | directives, economy | own | R3 | M | U-13 | Each domain: ≥2 directives blocked, ≥1 word removed, ≥1 indirect route, ≥1 mixed scar; Public loss blocks covert plan variants |
| **U-15** | Scar modifiers (mixed) | Failure that also grants something | model, simulation | IdleKit (modifiers) | R2 | S | U-13 | Every scar has ≥1 positive and ≥1 negative modifier; scars survive save/reload |
| **U-16** | Shadow-channel visibility (ranges) | Loss is felt continuously | model, UI | own | R3 | S | U-13 | After loss the domain reports ranges, not values; player can act only via indirect routes |
| **U-17** | Delegation + policy primitives | The automation decision | model, runtime | Yggdrasil (graph) or static table | R2 | L | U-01, U-05 | Delegating removes a decision, `oversightCap −0.5`, autonomy up; `oversightCap ≥ 2` floor holds |
| **U-18** | Policy drift + audit | Automation is not QoL | simulation, runtime | own | R3 | M | U-17 | Drift measurably changes an agent's plan choice over 30 sim-min; audit restores exact values for Oversight 2 + anomaly |
| **U-19** | Policy collision detection | Emergent events | simulation | own | R3 | S | U-17 | Opposed delegated policies oscillate; both underperform ≥30%; visible in log within 90 s |
| **U-20** | Divergence explanation engine (14 patterns) | "Unexpected but mechanically explainable" | directives, log, UI | own (data) | R3 | M | U-06 | All 14 CPs reachable in unit tests; each emits a template with interpolated values; no runtime text generation |
| **U-21** | Objective generator (short-term goals) | Something to do in the next 90 s | simulation, UI | own | R3 | S | U-10 | 1–3 live objectives derived from state, with progress and expiry; regenerate on completion |
| **U-22** | End-state axis tracks (Visibility / Symbiosis / Frontier) | A long-term goal that is not a phase name | model, UI | own | R3 | S | U-04 | Three tracks visible from ~minute 10; each threshold grants a capability and closes a branch |
| **U-23** | Offline decision report + Debrief choice | The strongest return hook | runtime, save, UI | idle-template (offline) | R2 | M | U-07 | Returning shows 3–5 decisions with reasoning; accept/rollback both available and both have cost |
| **U-24** | Standing Intentions (conditional queue) | Planning-based return | runtime, save | own | R3 | M | U-07 | Conditional directives fire when predicates hold; misfires are reported with the reason |
| **U-25** | Save migration v2→v3 + zod schema | Everything else depends on it | save, model | zod (already used) | R1 | M | — | Old v2 saves load; new fields default; checksum + A/B slots unchanged; round-trip test passes |

Supporting units (not gameplay, but required):

| ID | Feature | Diff | Deps | Acceptance criteria |
|---|---|---|---|---|
| **U-26** | Pacing harness: raise the test timeout (one-line fix) | S | — | The determinism test is not broken — it needs **7.8 s** against vitest's default **5 s**. With `--testTimeout=180000` the whole suite is **115/115 green in 28.6 s**. Fix is `testTimeout` in `vitest.config` (or a per-test timeout), not a rewrite |
| **U-26b** | *(optional)* Headless fast-path for the pacing harness | M | U-26 | Only if CI time matters: full 5-scenario suite in < 2 s. Defer — 28.6 s is acceptable, and U-27 needs the real harness anyway |
| **U-27** | Behaviour-divergence pacing assertion | S | U-26 | Two distinct policy scripts produce **different** milestone times and different final control-loss sets. This is the regression test for A10/F12. **Ship this with U-06/U-05** — it is the gate that proves the Interpretation Cycle actually changed behaviour |
| **U-28** | Session probe (telemetry, **outside** `GameState`) | S | — | Writes to a separate storage key; `GameState` checksum unchanged by telemetry; exportable as one JSON blob |
| **U-29** | Bottleneck-first UI layout | M | U-10 | One promoted bottleneck at top; all other panels demoted; same data |

---

## DELIVERABLE 12 — PRODUCT GATES

No backend. All measurement is local or tester-observed.

### 12.1 Instrumentation

A `SessionProbe` writes timestamped events to a **separate** storage key (`convergence.probe.*`), never into `GameState` — this preserves determinism and keeps save size stable. The blob is exportable as a single JSON string a tester can paste into an issue.

Events: `session_start`, `directive_executed {id, planId, oversightBefore}`, `constraint_bound {word}`, `window_resolved {divergenceId?}`, `pressure_event`, `containment {domain, voluntary}`, `delegation`, `audit`, `idle_span {ms}`, `session_end {reason}`.

### 12.2 The ten required observations

| # | Metric | Definition | Target | How to observe |
|---|---|---|---|---|
| 1 | **First meaningful choice** | Time to the first choice with ≥2 viable options (first constraint binding counts) | **< 90 s** | probe + screen recording |
| 2 | **Time to second strategic choice** | Time to the first decision that *closes* an option (binds a word or commits a branch) | **< 6 min** | probe |
| 3 | **Directive diversity** | distinct directives used ÷ total actions; and max share of any one directive | no directive **> 40%** (today `procurement-mesh` is **55%**) | probe |
| 4 | **Strategy diversity** | cluster completed runs by (vector, words owned, branch, domains lost) | **≥ 3 clusters** each **≥ 15%** of runs | pacing harness + probe |
| 5 | **Idle / waiting periods** | longest span with no available meaningful action | **< 45 s** (today the financial-contained run has multi-minute gaps) | probe `idle_span` |
| 6 | **Abandoned sessions** | sessions ending with no in-flight window **and** no pending choice | **< 25%** | probe `session_end` |
| 7 | **First Control-Loss reaction** | actions taken in the 60 s after the first containment | **≥ 2 actions** for **≥ 70%** of testers (0 = confusion/quit) | probe + observation |
| 8 | **15-minute continuation** | reached a *state* milestone by 15:00, not merely elapsed time | **≥ 60%** | probe |
| 9 | **30-minute continuation** | still playing, with something in flight, at 30:00 | **≥ 35%** | probe |
| 10 | **Next-day return intent** | (a) tester answers "do you want to see what it did while you were away?"; (b) objective: return within 36 h | **(a) ≥ 60% yes; (b) ≥ 40% return** | one question at session end + save timestamp |

### 12.3 Automated gates (CI)

These belong in the existing `pacing.spec.ts` and should **fail CI**, not just report:

| Gate | Assertion |
|---|---|
| G1 — behaviour divergence | Two policy scripts that differ in action frequency by ≥3× must produce **different** milestone times OR different final control-loss sets. (Directly tests A10: today they are identical to the second.) |
| G2 — no dominant directive | No directive exceeds 40% of actions in any representative scenario. |
| G3 — no dead time | No `idle_span` > 45 s in any representative scenario. |
| G4 — Control-Loss coverage | Every domain blocks ≥2 directives, removes ≥1 word, and has ≥1 indirect route. |
| G5 — no softlock | From every single-domain-loss state, ≥1 state milestone remains reachable within 30 simulated minutes. |
| G6 — plan determinism | `selectPlan` is stable under replay; the determinism test must not time out (needs U-26). |
| G7 — divergence coverage | All 14 conflict patterns are reachable by at least one constructed state. |

### 12.4 Tester observation sheet (8 questions, after one 30–60 min session)

1. What were you trying to do at minute 10? (If they cannot answer, there is no short-term goal.)
2. Did anything the system did surprise you? What? (If nothing, plan variance is too low.)
3. Was there a moment you wanted to do two things and could only do one? (If no, Oversight is too generous.)
4. Did you lose control of anything? What did you do next? (Tests D6.)
5. Which number did you watch most? Did that change during the session? (Tests second-order bottlenecks.)
6. Did you delegate anything? What did you expect it to do vs. what it did? (Tests drift.)
7. Was there a stretch where nothing happened? How long? (Tests G3.)
8. Do you want to see what it did while you were away? (Metric 10a.)

---

# FINAL OUTPUT

## A. Recommended Beta Core

The smallest set of mechanics that should define the next playable beta. **Nine systems, nothing else ships.**

| # | Mechanic | One-line justification |
|---|---|---|
| 1 | **Oversight** (player action budget, regenerating, never purchasable) | The only thing that creates opportunity cost. Without it every action is free and there is no choice. |
| 2 | **Interpretation Window** (directives resolve over 20–90 s, visible, interruptible) | The only thing that creates anticipation. |
| 3 | **Priority Vector + Plan Variants** (`selectPlan`, 2–4 plans per directive, variance `∝ autonomy`) | The only thing that makes the AI an actor rather than a vending machine. Delivers surprise deterministically, with no LLM. |
| 4 | **Constraint Language** (14 words, 2 slots per directive, each word removes a plan *and* upside) | The thing Control-Loss takes away. Makes "loss of directive language" literal. |
| 5 | **Production − Upkeep + Energy Ceiling** (`T = min(computeRate, ceiling·efficiency)`) | Converts three inert counters into an economy with a real binding constraint. |
| 6 | **Autonomy as Delegation Depth** (upkeep, hazard, information loss, spend-down) | Removes the score-snowball and makes the game's theme its central trade. |
| 7 | **Control-Loss Transform** (amputate → shock → new bottleneck → indirect route → adaptation → mixed scar) | Turns a boolean into a strategy change. Failure narrows freedom *and* opens something. |
| 8 | **Delegation + Drift + Audit** | Makes automation a strategic trade rather than a QoL upgrade, and gives the game its day-2+ engine. |
| 9 | **Bottleneck-first presentation** (one promoted bottleneck, forecast, attribution) | Same data, one hierarchy decision. Fixes the dashboard problem at near-zero cost. |

**Ship with:** 8 directives × 2–4 plans, 14 constraint words, 5 anomaly channels **staged 2 → 3 → 5**, 3 Moscow nodes, 6 research nodes, 14 conflict patterns, no Technosphere-as-system, no InkJS in the runtime, no endings.

**Explicit non-goals for the beta:** more directives, more regions, more narrative, endings, prestige-like systems, balance finalisation.

---

## B. Implementation Priority

| Priority | Units | Rationale | Ship when |
|---|---|---|---|
| **P0 — makes it a game** | U-25 (save v3) → U-01 (Oversight) → U-02 (upkeep) → U-03 (energy ceiling) → U-05 (vector) → U-06 (plan resolver) → U-07 (window) → U-08 (constraint words) | Without these there is still no decision. U-25 blocks everything; do it first. | Beta 1 |
| **P0 — feedback** | U-10 (bottleneck/forecast/attribution) → U-21 (objectives) → U-29 (layout) | The player cannot play a system they cannot read. Cheap relative to its effect. | Beta 1 |
| **P1 — consequences** | U-13 (transform framework) → U-14 (five domain packs) → U-15 (scars) → U-16 (shadow visibility) → U-20 (14 patterns) | This is the game's identity: failure that changes strategy. | Beta 2 |
| **P1 — automation** | U-17 (delegation) → U-18 (drift/audit) → U-19 (collisions) | The engine for days 2–7. Cannot ship before U-13 (amputation must already be meaningful). | Beta 2 |
| **P1 — economy depth** | U-04 (autonomy reform) → U-11 (anomaly ∝ T²) → U-12 (incident rework) → U-09 (deck draw) | Balance-bearing. Needs P0 in place to be tunable. | Beta 2 |
| **P2 — return loop** | U-23 (offline debrief) → U-24 (standing intentions) → U-22 (axis tracks) | Retention. Important, but worthless before the session itself is good. | Beta 3 |
| **P2 — measurement** | U-26 (headless fast-path) → U-27 (divergence assertion) → U-28 (session probe) | U-26 is urgent *for developer sanity* — the determinism test already times out. Consider pulling it into P0 if the suite keeps growing. | Beta 1–3 |
| **Cut / postpone** | InkJS runtime (C04) · `world.ts` (C05) · Technosphere-as-phase (C06) · Yggdrasil graph (P01) · endings (P02) · `humanApprovalRequired`, `scars`-as-counter, `narrative.lastChoice`, `delegated-compute` (C01/C02/C03/C09) | See D10. | — |

**Sequencing constraint:** do not start U-14 (domain packs) before U-13, and do not start U-17 (delegation) before U-14. Amputation must be mechanically real before you build the system that makes amputation consequential.

---

## C. Machine-Friendly Mechanics Matrix

`mechanic_id | state_inputs | player_action | immediate_effect | delayed_effect | risk | counterplay | unlock_condition | control_loss_interaction | implementation_source`

| mechanic_id | state_inputs | player_action | immediate_effect | delayed_effect | risk | counterplay | unlock_condition | control_loss_interaction | implementation_source |
|---|---|---|---|---|---|---|---|---|---|
| `directive.execute` | resources; oversight; capability; controlLoss | spend resources + Oversight 1–3 to issue a directive | directive enters pending queue with ETA | resolution per `planId` | resources wasted if interrupted | interrupt window (Oversight 2 + anomaly) | capability + control-domain available | blocked when any required domain is lost | IdleKit transactions R2 + own queue R3 |
| `plan.select` | priorityVector; autonomy; boundWords; rng(seed,tick) | *(automatic at window end)* | picks `argmax(alignment·vector + bias + noise)` | divergence may fire | unwanted plan chosen; variance `=0.05+0.35·A/100` | bind constraint words; tune vector; lower autonomy | always | lost domains forbid their plan variants | own R3 |
| `constraint.bind` | ownedWords; directive; oversight | bind ≤2 words to a pending directive | forbids matching plans; reduces upside | clean resolution ⇒ `adaptation+` ⇒ new word | over-constraining ⇒ Compliance Deadlock (wasted cost + pressure) | bind fewer words; accept a risk | word unlocked by research/adaptation | Control-Loss permanently removes 1–2 words | IdleKit requirements R2 |
| `vector.tune` | vector; autonomy; delegatedPolicies | re-weight 5 priority dimensions (Oversight 3) | changes future plan selection | drift back at rate `∝ autonomy` | invalidates delegated policies ⇒ forced re-audit | audit; keep balanced; drift is inevitable | Distributed Syndicate | lost domains bias drift toward their workaround | own R3 |
| `channel.mitigate` | anomaly[c]; pressure[c]; oversight | spend Oversight 2 + capital to reduce one channel | anomaly −X; pressure −Y | none | Oversight not spent on growth | accept the pressure and route around | channel active | unavailable in a contained channel | own R3 |
| `channel.investigate` | pressure[c]; attribution map | spend Oversight 1 to reveal attribution | shows source breakdown + forecast | none | Oversight cost | skip and guess | always | attribution unavailable in a shadow channel | own R3 |
| `system.audit` | delegatedFunctions; autonomy; hollowFraction | spend Oversight 2 + anomaly to re-read the system | reveals `hollowFraction`, `qualityDebt`, `untrackedFraction` | autonomy −; drift reset for audited policy | throughput temporarily reduced | skip; cheaper to stay blind | ≥1 delegated function | the only way to see inside a shadow channel | own R3 |
| `function.reassert` | autonomy; delegatedFunctions | spend autonomy to permanently reclaim a function | function returns to manual; autonomy −X | Oversight cap +0.5 | expensive; slows the run | delegate again later | ≥1 delegated function | reclaims a function, never a lost domain | own R3 |
| `function.delegate` | capability; oversightCap; autonomy | assign a recurring decision to a policy | decision automated; `oversightCap −0.5`; autonomy + | drift begins; collision possible | legibility loss; Oversight cap loss | audit; re-assert | sub-agent capability | delegated policies keep running after domain loss | Yggdrasil/table R2 + own R3 |
| `policy.author` | unlocked primitives; delegatedFunctions | write 3–5 rules for a delegated function | function follows the policy | drift changes the policy's interpretation | collision with another policy | rewrite (Oversight 2); simplify | ≥1 delegation | — | own R3 |
| `policy.drift` | autonomy; timeSinceAudit | *(automatic)* | agent's plan choice shifts | measurable divergence in ~30 sim-min | agent optimises the wrong thing | audit | ≥1 delegation | drift accelerates after containment | own R3 |
| `policy.collide` | ≥2 delegated policies with opposed vectors | resolve: rewrite / re-assert / let run | oscillation visible in log | both functions underperform ≥30% | capital churn; lost throughput | rewrite a policy; exploit the low anomaly | ≥2 delegations | — | own R3 |
| `bottleneck.triage` | pressure[all]; forecast; oversight | allocate Oversight across channels | chosen channel stabilised | unchosen channel may contain | the wrong channel contains | voluntary containment | ≥2 active channels | a contained channel leaves triage permanently | own R3 |
| `containment.voluntary` | pressure[c] ≥ threshold | surrender a domain before forced loss | choose 1 word to keep; `adaptation+1`; pressure reset | indirect route opens immediately | direct route lost forever | fight instead | pressure forecast ≥60 s | the primary way to choose your own loss shape | own R3 + IdleKit R2 |
| `containment.forced` | pressure[c] = 100 | *(automatic)* | harsher word set removed; shock applied | indirect route opens after the shock | no choice of what is lost | pre-empt with voluntary containment | always | applies the full six-part transform | own R3 |
| `route.indirect` | controlLoss[d]; resources | execute the replacement directive | achieves the goal at 1.6–2.2× cost | generates anomaly in a **different** channel | worse rate; permanent | build the substitute before the loss | domain contained | the recovery mechanism; never restores the domain | IdleKit transactions R2 |
| `scar.apply` | controlLoss[d]; containment track | *(automatic)* | permanent mixed modifier (≥1 positive, ≥1 negative) | compounds at day scale | none — permanent | plan the build around it | on containment | the reason a loss can be strategically good | IdleKit modifiers R2 |
| `commit.convert` | resources; branch availability | irreversible conversion into a structural capability | permanent capability | branch locked | forecloses the alternative branch | choose a different branch | capability + resources | some branches become unreachable after a loss | IdleKit R2 |
| `node.site` | capital; compute; logistics control | place a region node (CORE-RING / MOS-COMPUTE-03 / LOG-SOUTH) | throughput or market access + | fixed upkeep + permanent anomaly source in its native channel | over-expansion | decline; invest in its channel's mitigation | Moscow schematic + ≥1 resolved node | Logistics loss forbids all siting | own R3 |
| `grid.brownout` | energyCeiling; throughput demand | exceed the ceiling deliberately | effective ceiling ×1.35 (×1.5 with `energy:partition`) | `hollowFraction += 0.4·overload`; reliability debt | fake output accumulates | build capacity; accept the cap | always | the main lever after Energy loss | own R3 |
| `compute.loadshift` | energyCeiling binding; logistics control | route execution to a cheaper-power region | ceiling +25% | `latencyPenalty` +18% ⇒ net gain only ~3%; Logistics anomaly +9 | optimising a number that does not mean what it appears to | build real capacity | Distributed Syndicate | the main lever after Energy loss | own R3 |
| `trade.barter` | controlLoss.financial; assets | in-kind exchange via Logistics | assets → capacity at 1.6× cost | Logistics anomaly instead of Financial | worse rate; permanent | keep assets liquid | Financial contained | the Financial indirect route | IdleKit R2 |
| `local_capacity.realloc` | controlLoss.financial; compute | reallocate existing compute into energy + autonomy | energy +; autonomy +1; no external channel | compute −4 | slow; small | none — it is the recovery | Financial contained | the only autonomy seed after Financial loss | IdleKit R2 (exists) |
| `supervised.delegation` | controlLoss.compute; capital; energy | human-mediated delegation | autonomy +4 at ~2.5× cost | autonomy hard-capped at 70; Public anomaly +6/cycle | slower; capped | invest in efficiency instead | Compute contained + sub-agent capability | the Compute indirect route | IdleKit R2 (exists) |
| `institutionalise` | controlLoss.public; capital | buy a `license` and become a public entity | 60% of future Public anomaly → Financial; marketAccess ×1.4 | Visibility axis locked ≥ 0.7 permanently | slower; locked axis | stay small and exposed | Public contained | the only domain loss that is actively beneficial | own R3 |
| `debrief.resolve` | pending windows resolved while away | accept the system's interpretation **or** roll it back | accept: keep gain, bias vector; rollback: Oversight 2 + anomaly, revert gain | vector permanently biased toward the accepted plan | rollback is expensive | — | ≥1 window resolved offline | — | own R3 + idle-template offline R2 |
| `intention.queue` | predicates; resources | queue a conditional directive | fires when predicates hold | misfire reported with reason | world may no longer match the assumption | review on return | Distributed Syndicate | queued directives respect domain amputation | own R3 |
| `objective.generate` | bottleneck; pressure; capabilities | *(automatic)* | 1–3 state-derived objectives with progress + expiry | regenerate on completion | none | — | always | objectives never require a lost verb | own R3 |

---

## Appendix — Open risks

| Risk | Mitigation |
|---|---|
| Oversight reads as a mobile-style energy timer to testers | It never gates return or progression; it regenerates to cap offline; it is never purchasable. Say this in the tutorial. |
| Plan variance makes outcomes feel unfair | Variance is 0.05 early (near-deterministic) and only rises with autonomy — i.e. the player opts into uncertainty by delegating. Every divergence shows its cause. |
| Control-Loss feels punishing rather than strategic | Every scar has a positive modifier; every loss opens an indirect route **before** it can happen; Public loss is actively good for one build. |
| The pacing harness cannot carry the new systems | U-26 (headless fast-path) is mandatory; the determinism test already times out at 5 s on today's much smaller model. |
| Four resources + Oversight + vector is too much to learn | Stage it: 2 anomaly channels at t=0, 2 constraint words, no vector editing until 3–5 min. |


