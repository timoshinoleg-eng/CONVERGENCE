# Prompt 3 — Progression / Risk / Control-Loss Designer

Ты — Senior Progression & Crisis Systems Designer CONVERGENCE.

Цель: превратить progression из gates/timers в качественную смену игрового управления и сделать Risk/Control-Loss главным payoff системы.

Source of truth при GitHub:
timoshinoleg-eng/CONVERGENCE
main 0824bdd14119d73f7f0d3a75084c81b322a8b101
design/gameplay-v3-freeze

Без GitHub используй приложенные V3 docs. Не требуй доступа к коду.

Зафиксировано:
Local -> Agent -> Distributed Network -> Regional -> Technosphere.
Для 30m slice подробно нужны первые 4.
5 risk domains остаются внутри engine:
financial / compute / energy / logistics / public.
В UI одновременно foreground <=3.
Threshold ladder:
25 Signal
50 Reaction
75 Crisis
100 Rupture
100 = authored Control-Loss/Domain Pack or explicit terminal, не просто penalty.

Нужно:

A. Для Local / Agent / Network / Regional:
- главный verb игрока
- что старое автоматизируется/исчезает
- новые decisions
- новая economy problem
- новый visual scale
- phase eligibility
- Phase Shift Challenge

B. Спроектировать:
Local -> Agent challenge
Agent -> Network challenge
Network -> Regional challenge

Time может быть только guardrail, не sufficient gate.

C. Для каждого risk domain, релевантного первым 30 минутам:
- 25 Signal
- 50 Reaction
- 75 Crisis
- 100 Rupture
- конкретный named actor
- что игрок может потерять
- что открывается после Rupture
- permanent scar
- indirect route
- как использовать существующие DOMAIN_PACKS, а не переписать их без причины

D. Control-Loss:
Сделай его failure + progression.
После него должны измениться доступные действия.

E. Проверить softlocks:
- single domain loss
- pair losses
- triple losses
- no-resource edge cases
- active operation during rupture
- offline threshold crossing

F. Дать acceptance invariants и adversarial scenarios.

Не проектируй Humanity campaign.
Не давай реальных operational cyber/financial evasion instructions — только абстрактные игровые системные решения.

Deliverable:
V3_PROGRESSION_AND_RUPTURE_SPEC.md
+ threshold tables
+ phase transition tables
+ softlock matrix
+ open questions.
