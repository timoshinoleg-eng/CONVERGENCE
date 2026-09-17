# CONVERGENCE Beta Pacing Baseline

Measured on 2026-09-17 from the production game core using `ConvergenceRuntime`, schema version 2, seed 42.

This document is diagnostic. It does **not** freeze the current balance. The first-session target windows are provisional until the Telegram-first / Moscow game-design handoff is reviewed.

## Why this exists

The beta needs a repeatable way to detect two classes of regression:

1. progression becomes too fast / too slow compared with the intended first-session reveal;
2. Control-Loss leaves visible actions available but silently destroys the progression path.

Run locally with:

```bash
npm run test:pacing
```

The suite is deterministic and emits a JSON-serializable report from the same runtime paths used by the game.

## Current provisional target windows

These are intentionally broad and are used only as diagnostics until the product-design pass is accepted.

| Milestone | Provisional window |
| --- | ---: |
| First meaningful directive | 0:15–2:00 |
| Sub-agent capability | 2:00–6:00 |
| Distributed Syndicate | 4:00–12:00 |
| Technosphere | 20:00–30:00 |

## Measured 30-minute scenarios

| Scenario | First directive | Sub-agent capability | Distributed Syndicate | Sovereign Grid | Technosphere | First containment |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Aggressive autonomy, action check every 5s | 0:05 | 0:05 | 0:10 | 1:15 | **1:25** | 11:19 |
| Measured growth, action check every 30s | 0:30 | 0:30 | 1:00 | 2:00 | **3:30** | 12:18 |
| Infrastructure-first, action check every 60s | 1:00 | 2:00 | 3:00 | 5:00 | **7:00** | 23:04 |
| Compute contained at start, action check every 10s | 0:10 | — | — | — | — | 0:00 |

### Primary pacing finding

The current mechanics expose the late-game phase much too early relative to the existing design intent.

Even the slowest representative normal strategy reaches `technosphere` in about **7 minutes**. The fastest tested strategy reaches it in **85 seconds**.

Do not fix this by multiplying every price or timer. The Telegram-first design pass should determine which reveals are gated by:

- state / capability prerequisites;
- authored dilemmas;
- regional reveal;
- explicit decisions;
- resource accumulation;
- pacing guardrails.

After that handoff, this harness should be updated with accepted milestone windows and then used as a real CI balance gate.

## Control-Loss coverage

The harness uses an abundant-resource state to measure which current directives become unavailable when each control domain is contained.

| Lost domain | Current blocked directives |
| --- | --- |
| Financial | `reserve-compute`, `acquire-energy`, `procurement-mesh` |
| Compute | `reserve-compute`, `spawn-sub-agent`, `sovereign-grid` |
| Energy | `acquire-energy`, `spawn-sub-agent`, `sovereign-grid` |
| Logistics | `procurement-mesh`, `sovereign-grid` |
| Public | **none** |

### Finding: Public Control-Loss is currently a semantic no-op

The design says Public containment should remove or alter part of the player's directive language. No current directive checks the Public control domain, so the state change presently has no mechanical effect on directive availability.

Do not add arbitrary Public requirements just to satisfy the table. The Telegram-first content/directive design should define which actions are genuinely public-facing or covert, then the requirements can be attached to those directives.

## Containment stress finding

When Compute control is removed before sub-agent capability exists, the test player can still execute meaningful-looking actions (`acquire-energy`) and accumulate resources/autonomy, but after 30 simulated minutes remains in `client-terminal`:

- sub-agent capability: never unlocked;
- Distributed Syndicate: never reached;
- Sovereign Grid: never reached;
- Technosphere: never reached.

This is a **progression lock under that stress condition**, not a total action lock.

In the current natural flow it is unlikely before the first compute-producing directive because Compute anomaly begins at zero and `reserve-compute` itself unlocks the capability. Still, the condition is now covered by regression tests because authored events or future content may impose containment earlier.

## Other observed behavior

Long-running repeated `procurement-mesh` usage pushes Logistics anomaly near saturation and eventually produces Financial + Logistics Control-Loss in all three normal test strategies. This may be desirable systemic pressure, but it should be reviewed after the first-session content is finalized rather than tuned in isolation.

## CI policy for now

The test suite currently enforces:

- deterministic replay;
- representative normal strategies can still reach the existing late phase;
- provisional pacing violations are detected rather than hidden;
- the Compute-containment progression lock remains visible;
- Control-Loss directive coverage remains explicit;
- the report remains machine-serializable.

It deliberately does **not** fail CI simply because the current phase timings miss the provisional product target. That becomes a hard gate only after the Telegram-first first-session specification is accepted.

## Next balance step

After the external Telegram-first/Moscow design handoff:

1. replace provisional milestone windows with accepted ones;
2. add the actual first-session directive/event sequence to the headless scenarios;
3. rebalance the smallest set of costs/prerequisites/gates needed;
4. convert the accepted milestone checks from diagnostic assertions into CI failures;
5. retain Control-Loss escape-path tests so content updates cannot create silent softlocks.
