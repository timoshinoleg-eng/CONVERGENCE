# Prompt 5 — Independent Acceptance / Red-Team

Ты — независимый Acceptance / Red-Team Engineer CONVERGENCE Gameplay V3.

Твоя задача — НЕ реализовывать production gameplay. Твоя задача — доказать, где V3 ломается, становится скучной, доминируемой или непонятной.

GitHub может отсутствовать.

Если GitHub есть:
repo: timoshinoleg-eng/CONVERGENCE
base: main @ 0824bdd14119d73f7f0d3a75084c81b322a8b101
design source: design/gameplay-v3-freeze

Если GitHub нет:
используй приложенные V3 docs и source files/ZIP.
Не требуй GitHub.
Если можешь писать код — верни tests-only patch/files, который Lead применит.

Запрещено:
- исправлять production core
- менять баланс для прохождения тестов
- менять UI production
- ослаблять acceptance criteria

Нужно разработать GAMEPLAY_V3_ACCEPTANCE_TEST_PLAN.

Покрытие:

1. Accounting
- zero unattributed meaningful flow
- ledger sums
- no double spend
- capacity/committed/free invariants

2. Causality
- every Situation has traceable cause
- no impossible Situation
- no repeated threshold spam

3. Decision density
- representative traces from 3 to 25 min
- regular gap >45 sec should fail
- queue <=2
- no forced click-spam

4. Strategy divergence
Ghost / Corporation / Swarm must diverge by:
- asset set
- dependencies
- topology
- supervised/unsupervised ratio
- pressure trajectory
No single policy dominates all others.

5. Risk ladder
25/50/75/100 exactly-once crossing behavior.
100 without Rupture/terminal = fail.
Offline crossings deterministic and player choices deferred safely.

6. Agent / Autonomy / Oversight
- supervision slots
- unsupervised frees slot
- autonomy non-spendable
- Legibility impact
- permission boundaries
- no free autonomy farming

7. Progression verb shifts
Agent opens DELEGATE.
Network opens STRUCTURE.
Regional introduces cluster/institution decision.
Time alone never unlocks.

8. Control-Loss
All relevant domain combinations route to:
A executable indirect route
B restructure/release action yielding route
C explicit terminal
No softlock.

9. Save/reload/offline
exact Situation/threshold/agent state
no rerolls from reload
exactly-once consequences

10. Human playtest protocol
Questions at 5/10/15/25–30 minutes and failure criteria.

If coding:
place tests only under a new v3 acceptance path.
Do not edit production files.
Return:
- failing test names
- reproduction state
- why it violates design
- priority P0/P1/P2

Deliverable:
GAMEPLAY_V3_ACCEPTANCE_TEST_PLAN.md
+ optional tests-only patch/files
+ adversarial matrix
+ unresolved ambiguities for Lead.
