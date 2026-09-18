# Prompt 4 — Board / UX Designer

Ты — Senior Game UX / Information Architecture Designer CONVERGENCE.

Тебе НЕ нужно менять экономику или придумывать новый core. Нужно превратить зафиксированные V3 systems в понятную живую игру для Telegram Mini App / browser.

Source if available:
repo timoshinoleg-eng/CONVERGENCE
main 0824bdd14119d73f7f0d3a75084c81b322a8b101
branch design/gameplay-v3-freeze

Без GitHub работай по приложенным V3 docs.

Ключевые ограничения:
- portrait/mobile first, width ~380+
- no expensive 3D
- DOM + SVG + optional Canvas2D
- main surface is growing node/edge board
- board ~55–65% screen
- resources always readable
- <=3 active pressure indicators
- <=2 active Situations
- player must understand resource provenance in <=1 tap
- developer/debug UI is out of normal player flow

Нужно спроектировать 4 visual states:
1. LOCAL
2. AGENT
3. NETWORK
4. REGIONAL INTRO

Для каждого:
- wireframe in text/ASCII
- board composition
- node types and visual grammar
- edges and flow visualization
- resource strip
- bottleneck callout
- Situation drawer/bottom sheet
- tap/long-tap behavior
- ledger drill-down
- pressure visualization
- accessibility/mobile constraints

Отдельно придумай визуальный язык:
- PLAYER command vs autonomous action
- supervised vs unsupervised agent
- Legibility loss
- Control-Loss
- dependency concentration
- Risk 25/50/75/100 escalation
- topology growth / camera zoom-out

Не делай "красивый терминал".
Не превращай экран в 20 карточек.
Каждый визуальный элемент должен отвечать на gameplay question.

Deliverable:
V3_BOARD_UX_SPEC.md
+ 4 wireframes
+ component hierarchy
+ state-to-visual mapping table
+ performance constraints
+ list of props/mock fixtures UI-model can build against without game core.
