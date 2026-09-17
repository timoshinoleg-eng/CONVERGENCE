# CONVERGENCE — Telegram Mini App Architecture

Date: 2026-09-17
Branch: `feat/telegram-readiness`
Companion document: `docs/TELEGRAM_READINESS_AUDIT.md`

This document describes the platform boundary that lets the same canonical `GameState` core run as a
Telegram Mini App, a standalone browser app and a Capacitor Android app.

---

## 1. Guiding constraints

1. `GameState` remains the single source of truth.
2. The Telegram adapter is **not** a game-state manager.
3. Pinia remains a UI projection.
4. There is exactly one lifecycle model — no second state machine, no XState.
5. No save-schema change and no migration.
6. No backend, no bot, no database, no monetization, no runtime LLM.
7. No new runtime dependency.
8. The standalone APK keeps its current behaviour.

---

## 2. Runtime detection

Detection runs once, at `createPlatformAdapter()`. Order matters, because a Telegram WebView is also a
browser and an APK WebView can also be a browser:

```text
window.Telegram.WebApp present and structurally valid ?  ->  telegram
Capacitor.isNativePlatform()                            ?  ->  capacitor
otherwise                                                  ->  browser
```

`window.Telegram.WebApp` is validated structurally (`asTelegramWebApp`): the object must expose at
least one real runtime marker (`ready`, `expand`, `initData`, or `version`). An empty or
partially-initialised namespace is rejected, so a page that merely defines `window.Telegram = {}`
never gets treated as a Mini App.

The resolved platform is published as `document.documentElement.dataset.cvPlatform`, which makes it
directly verifiable in a smoke test, and it is rendered in the persistence panel next to the build ID.

---

## 3. Lifecycle model

One enum, three phases:

```text
active  <->  background  ->  dispose
```

| Phase | Meaning | Store reaction |
|---|---|---|
| `active` | scheduler running, UI interactive | `resumeFromBackground()` — one bounded catch-up, restart scheduler |
| `background` | scheduler stopped, save flushed | `pauseForBackground()` — stop scheduler, save now |
| `dispose` | terminal, host is tearing the page down | `stop()` — stop scheduler, final save |

**Event source per platform**

| Platform | Source | Note |
|---|---|---|
| Telegram | `visibilitychange` + `pagehide` | Telegram has no official background event |
| Browser | `visibilitychange` + `pagehide` | New behaviour: the web build now pauses like the APK |
| Capacitor | `appStateChange` | Identical to PR #9; DOM visibility only as a plugin-absent fallback |

**De-duplication.** `createLifecycleController` emits only real transitions. Repeating the current
phase is a no-op, and `dispose` is terminal. This is what makes the following scenario safe:

```text
user opens Mini App -> minimises inside Telegram -> opens a chat -> returns 20 minutes later
  -> visibilitychange(hidden)  -> "background"  -> stop scheduler + save
  -> visibilitychange(visible) -> "active"      -> exactly ONE advanceOffline(20 min)
  -> duplicate visibilitychange events          -> ignored
```

Three independent protections exist for that "exactly one":

1. the controller de-duplicates transitions;
2. `resumeFromBackground()` returns early when the scheduler is already started;
3. `advanceOffline()` consumes the wall-clock interval (`meta.updatedAt = currentTime`), so even a
   hypothetical duplicated call would simulate `0 ms`.

Tested in `src/platform/lifecycle.spec.ts`.

---

## 4. Storage decision

**Where does the Telegram beta save live?**
Capacitor Preferences, which on any web platform (including the Telegram WebView) resolves to
`localStorage` under the `CapacitorStorage.` prefix. Keys are unchanged: `convergence.save.a`,
`convergence.save.b`, `convergence.save.active`.

**Why one implementation family for all three runtimes?**
Because it makes three divergent save paths impossible and because it guarantees this PR cannot
regress an existing web or APK save. The A/B slot format, the envelope, the checksum and the
migration chain are untouched.

| Runtime | Backing store | `storage.kind` |
|---|---|---|
| Capacitor Android | Preferences / SharedPreferences | `capacitor-native` |
| Telegram WebView | localStorage (Capacitor web fallback) | `web-localstorage` |
| Standalone browser | localStorage (Capacitor web fallback) | `web-localstorage` |
| Any, on storage failure | in-memory | `memory` |

**How stable is that?**
Reasonably stable within a session and across restarts, but not guaranteed: clearing Telegram cache,
reinstalling Telegram, or iOS WebView data eviction can delete it. There is no durability guarantee
from the platform.

**What happens on Telegram reinstall / cache clear?**
The save is gone. The game starts fresh; no corruption occurs because a missing slot simply yields
`null` and `loadSnapshot` falls back to the other slot, then to a fresh state.

**Can we accept this for closed beta?**
Yes, with a caveat: the save system already degrades gracefully and the UI now warns
("SAVE NOT PERSISTENT") when a write fails and the adapter falls back to memory. Closed beta is
explicitly about "is the core loop fun", not about long-term retention.

**When is account/cloud save required?**
Before any public launch, any cross-device play, any leaderboard, or any moment where losing progress
would generate support load. That requires a backend and is out of scope now. The seam is
`KeyValueStore` in `src/game/save.ts` — a cloud implementation only has to satisfy `get` / `set`.

---

## 5. Launch intent

Telegram exposes the same value in three places; all are equally untrusted:

1. `WebApp.initDataUnsafe.start_param`
2. `tgWebAppStartParam` in the Mini App URL query
3. `tgWebAppStartParam` in the URL hash (and the original `startapp` link parameter)

`src/platform/launchIntent.ts` is a **pure** parser:

```ts
type LaunchIntent =
  | { type: "default"; reason: "none" | "empty" | "malformed" }
  | { type: "observe"; id: string }
  | { type: "event";   id: string }
  | { type: "region";  id: string }
  | { type: "invite";  code: string };
```

Guarantees:

- closed allowlist of families; ids match `^[a-z0-9][a-z0-9_-]{0,31}$`, codes `^[A-Z0-9]{4,24}$`;
- reserved values (`__proto__`, `constructor`, `prototype`) rejected;
- hard 64-character cap before any parsing;
- no `JSON.parse`, no `eval`, no dynamic property access, no `GameState` mutation;
- unknown input degrades to `{ type: "default" }` so a bad link still boots the game.

Nothing in the app consumes a launch intent yet. This is an extension point for observer links,
shared anomalies, event invites and region launches.

---

## 6. Security boundary

**Client convenience (used):** viewport, stable viewport, safe-area and content-safe-area insets,
`colorScheme`, `themeParams`, `start_param`, capability detection, `version`, `platform`.

**Never trusted on the client:** `initData` / `initDataUnsafe`. It is a JavaScript string and is
forgeable by anyone who can run JS in the page. It must not be used for identity, purchases, rewards,
anti-cheat, authoritative progression or competitive state.

**Not implemented, and required before any of the above:**

```text
Mini App --(raw initData)--> bot backend
                              ├── HMAC-SHA256 over the initData string, keyed by the bot token
                              ├── reject stale auth_date
                              └── only then: identity, entitlements, cloud save, purchases
```

See `docs/TELEGRAM_READINESS_AUDIT.md` → "Security boundary".

---

## 7. Telegram-specific APIs used

| API | Used | Notes |
|---|---|---|
| `ready()` | Yes | Required; otherwise Telegram keeps the loading placeholder |
| `expand()` | Yes | Otherwise the game renders in the short default viewport |
| `requestFullscreen()` | Capability detected, **not called by default** | Opt-in via `createPlatformAdapter({ enableFullscreen: true })`. Fullscreen hides the Telegram header and changes how the player minimises the app — a product decision |
| `viewportHeight` / `viewportStableHeight` | Yes | `stableHeight` drives `--cv-viewport-height` |
| `safeAreaInset` / `contentSafeAreaInset` | Yes | Element-wise maximum of both feeds `--cv-safe-*` |
| `themeParams` / `colorScheme` | Yes | Only `bg_color` is applied, to the page background |
| `BackButton` (`show` / `hide` / `onClick` / `offClick`) | Yes | Only shown while a handler is registered |
| `onEvent('viewportChanged' \| 'themeChanged' \| 'fullscreenChanged')` | Yes | Refreshes the environment and republishes CSS variables |
| `isVersionAtLeast()` | Yes | Capability gating; fullscreen is gated on 8.0 |
| `addToHomeScreen` / `checkHomeScreenStatus` | Detected only | No prompt is shown |
| `disableVerticalSwipes` / `enableVerticalSwipes` | Detected only | Not called; see open decisions |
| `initData` / `initDataUnsafe` | `start_param` only | Never used for identity or entitlement |

No wrapper SDK (`@tma.js/*`, `@telegram-apps/*`) is used. The official surface is small and already
injected by the client; a wrapper would add a dependency without adding behaviour.

---

## 8. Standalone browser fallback

`createBrowserAdapter()` is the default. Requirements it satisfies:

- no Telegram API → the game behaves as before (plus the new visibility-based pause, which is a fix);
- no Capacitor plugin required;
- no browser navigation hijacking: the back-handler slot is stored for parity but **no `popstate`
  listener is registered**;
- safe-area insets stay at `0` because `env()` is already correct for a normal viewport — inventing
  insets in JS would double-pad notched devices;
- `prefers-color-scheme` is read for `colorScheme`; the CONVERGENCE palette is unchanged.

---

## 9. Capacitor coexistence

`createCapacitorAdapter()` preserves PR #9 exactly:

- `appStateChange({ isActive: false })` → `background` → stop scheduler + save;
- `appStateChange({ isActive: true })` → `active` → one catch-up + restart scheduler;
- `onDispose` is intentionally a no-op, because Android teardown is already covered by
  `appStateChange` and by `onUnmounted`.

Back button: the `backButton` listener is registered **lazily**, only while a handler is set. The
current single-screen app never sets one, so no listener exists and Android's default back behaviour
is untouched. DOM `visibilitychange` is used only if the App plugin is missing.

---

## 10. What a future bot/backend must provide

Nothing here depends on a backend, but these items cannot be done without one:

1. **Server-side `initData` validation** — HMAC-SHA256 against the bot token, plus `auth_date`
   freshness. Prerequisite for everything below.
2. **Cloud / account save** — implements `KeyValueStore` over an authenticated endpoint.
3. **Trusted identity** for cross-device progress.
4. **Monetization** (Telegram Stars or otherwise) — invoice creation and fulfillment server-side.
5. **Competitive / social state** — leaderboards, shared anomalies, invites, referrals.
6. **Static HTTPS hosting** of `dist/` for the Mini App itself (this one needs hosting, not a bot
   backend, and is the only blocking operational item for the first smoke test).

---

## 11. Deliberately NOT implemented in the first beta

| Not implemented | Why |
|---|---|
| Telegram bot / webhook / database | Explicitly out of scope; no backend in beta |
| Telegram Stars, purchases, referrals | Requires server-side `initData` validation |
| Cloud save | Requires identity + backend |
| Server-side `initData` validation | Requires backend |
| Moscow content, world map, region bonuses | Product specification is being produced separately |
| Multiplayer, social graph, invitations | Post-beta |
| Vue Router | The app is single-screen; a router just for BackButton would add a second navigation state machine |
| In-game confirmation dialog | UI decision pending (native `window.confirm` still used; filed as G8) |
| `requestFullscreen()` by default | UX decision pending; adapter supports it behind a flag |
| `disableVerticalSwipes()` | UX decision pending; capability detected only |
| Analytics SDK | Needs a product decision and possibly a new service |
| CASL / rot-js / XState / json-rules-engine | Already decided: postponed (see `docs/research/DONOR_PASS2_SPIKE_RESULT.md`) |

---

## 12. Geography extension point (Russia / Moscow)

The audit question was whether

```text
World -> Countries -> Russia -> Moscow -> Nodes
```

can be added without rewriting the core.

**Answer: yes.** `src/game/world.ts` defines `CountryDefinition`, `RegionDefinition`,
`NodeDefinition`, `RegionState`, `NodeState` and `WorldState`, and `GameState` gains one **optional,
additive** field:

```ts
world?: WorldState;
```

Why this costs nothing today:

- `createInitialGameState()` leaves `world` absent, so `JSON.stringify` produces a byte-identical
  payload and `fnv1a` checksums are unchanged;
- the zod schema entry is `.optional()`, so every existing save still parses and yields
  `world === undefined`;
- simulation, economy, narrative and directives ignore the field completely;
- no migration, no schema bump, no save regression (all asserted in `src/game/world.spec.ts`).

What is **not** included: any Moscow content, regional bonuses, region-specific events, world map UI,
or rebalance. Node pressure reuses the existing five `AnomalyChannel` values so no new pressure model
is introduced. Wiring real content later means: loading definitions from data, creating
`RegionState` / `NodeState` entries, and letting directives read them — all additive.

---

## 13. Verification

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS |
| Tests | `npm test` | 60 passed (10 pre-existing + 50 new) |
| Production build | `npm run build` | PASS |
| Android APK | `.github/workflows/android-beta.yml` | runs on this PR via CI |

New suites:

| Suite | Covers |
|---|---|
| `src/platform/launchIntent.spec.ts` | allowlist, malformed input, hostile payloads, URL extraction |
| `src/platform/lifecycle.spec.ts` | de-duplication, terminal dispose, the 20-minute single catch-up scenario |
| `src/platform/telegram.spec.ts` | detection, ready/expand, fullscreen opt-in, viewport, insets, theme, launch params, BackButton, CSS variables, dispose, client-failure tolerance |
| `src/platform/adapters.spec.ts` | browser fallback, no history hijacking, Capacitor `appStateChange` parity, lazy back registration |
| `src/platform/coreIsolation.spec.ts` | no core file imports a platform module or touches a host global |
| `src/game/world.spec.ts` | geography slot is additive and changes no existing save |
