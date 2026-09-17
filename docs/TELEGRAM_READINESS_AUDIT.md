# CONVERGENCE — Telegram Mini App Readiness Audit

Date: 2026-09-17
Audited `main`: `17a19b7` (`docs: record CASL and rot-js spike result`)
Scope: repo-grounded audit of the current mobile/web beta against a Telegram-first launch.

**Status convention used below:** `FIXED IN THIS PR` means the change is already implemented on
`feat/telegram-readiness`. `OPEN` means it is carried forward as an issue.

---

## Current architecture

```text
index.html
  └── src/main.ts                 createApp(App).use(createPinia()).mount("#app")
        └── src/App.vue           UI + native lifecycle wiring (Capacitor import at module scope)
              └── src/stores/game.ts        Pinia UI projection; owns scheduler + persistence calls
                    └── src/game/runtime.ts ConvergenceRuntime (single owner of canonical GameState)
                          ├── simulation.ts / incidents.ts   deterministic tick, hazard, containment
                          ├── engine/{rng,scheduler,events}  deterministic RNG, wall-clock boundary
                          ├── economy.ts (IdleKit)           requirements + transactions
                          ├── capabilities.ts (Yggdrasil)    progression graph
                          ├── narrative.ts (InkJS)           branching interpretation
                          └── save.ts                        versioned A/B snapshots + zod + checksum
```

Facts established by reading the code, not assumed:

| Fact | Evidence |
|---|---|
| One canonical plain-TS `GameState` is the source of truth | `src/game/model.ts`, `src/game/runtime.ts` |
| Pinia is a projection only | `src/stores/game.ts` — `snapshot` is a `ref` fed by `runtime.subscribe` |
| Wall clock enters at exactly one boundary | `src/game/engine/scheduler.ts` produces `{ currentTime, deltaMs }` |
| Simulation clamps one tick to 60 s | `advanceSimulation`: `Math.min(Math.max(input.deltaMs, 0), 60_000)` |
| Offline catch-up is bounded and consumes wall time | `advanceOffline`: 4 h cap, then `meta.updatedAt = currentTime` |
| Persistence is abstracted behind one interface | `KeyValueStore` in `src/game/save.ts` |
| The concrete store was hardcoded | `new PreferencesStore()` in `src/stores/game.ts` |
| The core already imported a platform SDK | `@capacitor/preferences` imported by `src/game/save.ts` |
| Native lifecycle was wired directly in the view | `@capacitor/app` imported by `src/App.vue` |
| No DOM visibility handling existed anywhere | grep: no `visibilitychange`, no `pagehide` |
| No Telegram code existed anywhere | grep: no `Telegram`, no `tgWebApp*` |

---

## Telegram compatibility

Verdict before this PR: **the game would most likely boot inside Telegram, but it would behave like a
browser tab that nobody ever told it was a Mini App.** No `ready()`, no `expand()`, no measured safe
area, no background save, no reliable resume, no launch parameter, no back-button handling.

| Area | Compatible as-is? | Note |
|---|---|---|
| Deterministic simulation | Yes | Pure functions over `GameState`; no DOM or timers inside |
| Economy / capabilities / narrative | Yes | Headless donor libraries, already isolated |
| Save format & migration | Yes | zod v4 + checksum + A/B slots; host-agnostic |
| Scheduler | Partially | `setInterval` is suspended by the WebView; without a pause/resume hook the elapsed time is silently lost (a resumed tick is clamped to 60 s) |
| Storage | Probably | Capacitor Preferences falls back to `localStorage` inside the Telegram WebView; durability is not guaranteed (see Risks) |
| Layout / safe area | No | Only `env(safe-area-inset-*)`, which is unreliable inside the Telegram WebView; `100vh` does not track the Telegram sheet |
| Lifecycle | **No** | `appStateChange` never fires in a WebView; nothing else was listening |
| Telegram chrome integration | **No** | No `ready()`, no `expand()`, no BackButton, no theme params |
| Launch parameter | No | `tgWebAppStartParam` / `start_param` ignored |
| Standalone APK | Yes | Untouched by the Telegram path |
| Desktop / iOS Telegram | Unknown, needs device test | No device telemetry exists yet |

---

## Blocking gaps

Each gap lists: file, current problem, required change, risk, priority, whether it can be solved
without a backend.

### G1 — Lifecycle is wired to a Capacitor-only event (`src/App.vue`, `src/stores/game.ts`)

- **Problem:** `CapacitorApp.addListener("appStateChange", ...)` is the only lifecycle source. On the
  Capacitor **web** platform (browser and Telegram WebView) that event is never emitted, so
  `pauseForBackground()` / `resumeFromBackground()` never run. Minimising the Mini App leaves the
  scheduler running or suspended with no save and no catch-up.
- **Change:** route every runtime through one lifecycle controller driven by DOM
  `visibilitychange` + `pagehide` on web/Telegram and by `appStateChange` on native.
- **Risk:** save loss and "the game did not advance while I was away" reports.
- **Priority:** **P0**. **Backend not required.** → **FIXED IN THIS PR**

### G2 — No Telegram bootstrap (`src/main.ts`, `src/App.vue`)

- **Problem:** `WebApp.ready()` is never called, so Telegram keeps showing its loading placeholder and
  may never resize the WebView correctly. `expand()` is never called, so the game renders inside the
  default short Mini App viewport under Telegram's header.
- **Change:** call `ready()` then `expand()` from a Telegram adapter during mount.
- **Risk:** Mini App appears stuck loading, or is unusably short.
- **Priority:** **P0**. **Backend not required.** → **FIXED IN THIS PR**

### G3 — Platform code inside the game core (`src/game/save.ts`)

- **Problem:** the persistence core imported `@capacitor/preferences`. Simulation, economy and
  narrative therefore transitively depend on a native bridge, which makes the core non-portable and
  untestable outside a Capacitor host.
- **Change:** keep only the `KeyValueStore` contract in `src/game/save.ts`; move concrete stores to
  `src/platform/storage.ts`.
- **Risk:** future platform work leaks into simulation and breaks determinism guarantees.
- **Priority:** **P1**. **Backend not required.** → **FIXED IN THIS PR**

### G4 — Storage backend hardcoded (`src/stores/game.ts`)

- **Problem:** `new PreferencesStore()` is constructed inside the store. There is no seam to choose a
  different backend per runtime and no way to tell the player that storage is unavailable.
- **Change:** resolve storage at the platform boundary; expose `kind` and `durable`.
- **Risk:** three divergent save paths (browser / Telegram WebView / APK) and silent save loss.
- **Priority:** **P1**. **Backend not required** (cloud save *would* need one — see below).
  → **FIXED IN THIS PR**

### G5 — Viewport and safe area (`src/style.css`, `src/App.vue`)

- **Problem:** `.shell` and `body` use `100vh`, which in Telegram Android does not follow the sheet
  or the keyboard. Padding uses only `env(safe-area-inset-*)`, which the Telegram WebView does not
  populate reliably; Telegram exposes the correct values through `safeAreaInset` /
  `contentSafeAreaInset` in JS. `body { min-width: 320px }` forces horizontal overflow on narrow
  Telegram viewports.
- **Change:** publish measured insets and `viewportStableHeight` as CSS custom properties; keep the
  game's own palette untouched.
- **Risk:** controls hidden behind Telegram chrome; horizontal scroll on small phones.
- **Priority:** **P1**. **Backend not required.** → **FIXED IN THIS PR** (narrow-viewport width and
  overscroll included; per-client visual verification still **OPEN**)

### G6 — No back-button model (`src/App.vue`)

- **Problem:** the app is single-screen. Telegram's header back/close and Android's hardware back both
  tear the Mini App down immediately. The only protection is the 30 s periodic save and the 1.5 s
  deferred save.
- **Change:** a minimal `setBackHandler(handler | null)` slot. No router, no second navigation state
  machine. With no handler registered, behaviour is unchanged.
- **Risk:** accidental loss of up to 30 s of progress; player cannot dismiss a future overlay.
- **Priority:** **P1**. **Backend not required.** → **FIXED IN THIS PR** (extension point; no UI
  currently registers a handler)

### G7 — No launch-parameter extension point (`src/main.ts`)

- **Problem:** `tgWebAppStartParam` / `start_param` are ignored, so observer links, shared anomalies,
  event invites and region launches have nowhere to land.
- **Change:** a pure allowlisted parser producing a closed `LaunchIntent` union. No execution, no
  state mutation.
- **Risk:** none today; blocks future growth mechanics.
- **Priority:** **P2**. **Backend not required** for attribution-free local use.
  → **FIXED IN THIS PR** (parser only; no mechanics consume it yet)

### G8 — `window.confirm` for destructive reset (`src/App.vue`)

- **Problem:** `resetGame()` uses the native `window.confirm`. Several WebViews (notably iOS Telegram)
  block or auto-dismiss modal JS dialogs. A blocked dialog returns `false`, so reset silently
  no-ops; a hostile path could make it return `true`.
- **Change:** replace with an in-game confirmation surface.
- **Risk:** confusing "reset does nothing" bug reports in the Telegram beta.
- **Priority:** **P1**. **Backend not required.** → **OPEN** (deliberately not changed here: it needs
  a UI decision from the lead)

### G9 — No Telegram smoke-test checklist (`docs/BETA_TESTING.md`)

- **Problem:** the beta guide is Android-APK-only. There is no definition of "Telegram smoke test
  passed".
- **Change:** add a Telegram section mirroring the APK gate.
- **Risk:** first Telegram build gets distributed without a gate.
- **Priority:** **P1**. **Backend not required.** → **FIXED IN THIS PR**
  (device execution of that checklist is still **OPEN**)

### G10 — Hosting / bot configuration outside the repo (operational)

- **Problem:** a Mini App needs a BotFather-registered app and an HTTPS URL serving `dist/`. Nothing
  in the repo or CI produces or publishes that.
- **Change:** deployment concern; must be decided by the lead (static hosting of `dist/` is
  sufficient — no backend needed for the beta).
- **Risk:** the code is ready but nothing is wired to Telegram.
- **Priority:** **P0 (operational)**. **Backend not required** (static HTTPS hosting is enough).
  → **OPEN**

### G11 — `initData` boundary is undocumented

- **Problem:** no code reads `initData` today, which is correct and safe. But without a written rule
  the next feature may treat `initDataUnsafe.user` as identity or `initData` as an entitlement.
- **Change:** document the boundary (see "Security boundary"), enforce it in review.
- **Risk:** a future "reward for Telegram user" feature becomes trivially forgeable.
- **Priority:** **P1 (documentation + review rule)**. → **FIXED IN THIS PR** (documented; adapter only
  reads display/presentation fields)

### G12 — Telegram Desktop and iOS untested

- **Problem:** all existing evidence is Android APK. Telegram Desktop has a very different viewport
  model (resizable window, no safe area) and iOS persists WebView storage differently.
- **Change:** manual device matrix pass.
- **Risk:** layout or storage regressions found only after distribution.
- **Priority:** **P1**. → **OPEN**

---

## P0 before Telegram smoke test

| # | Item | State |
|---|---|---|
| G1 | One lifecycle model across Telegram / browser / Capacitor | FIXED IN THIS PR |
| G2 | Telegram `ready()` + `expand()` bootstrap | FIXED IN THIS PR |
| G10 | HTTPS hosting of `dist/` + BotFather Mini App registration | OPEN — needs lead decision |
| — | Typecheck, tests, production build, Android APK all green | FIXED IN THIS PR (CI enforces) |
| — | Exactly one offline catch-up for one background → return cycle | FIXED IN THIS PR (covered by tests) |

## P1 before closed beta

| # | Item | State |
|---|---|---|
| G3 | Platform SDK out of the game core | FIXED IN THIS PR |
| G4 | Storage resolved at the boundary with durability reporting | FIXED IN THIS PR |
| G5 | Safe-area / viewport / narrow-screen infrastructure | FIXED IN THIS PR (device verification OPEN) |
| G6 | Back-button extension point | FIXED IN THIS PR |
| G8 | Replace `window.confirm` with an in-game confirm | OPEN |
| G9 | Telegram section in `docs/BETA_TESTING.md` | FIXED IN THIS PR |
| G11 | `initData` security boundary documented | FIXED IN THIS PR |
| G12 | Desktop + iOS device pass | OPEN |
| — | Decide whether Telegram fullscreen is wanted | OPEN — adapter supports it, default OFF |
| — | Decide whether to call `disableVerticalSwipes()` | OPEN — capability detected, not called |

## P2 after gameplay validation

| # | Item |
|---|---|
| G7 | Consume launch intents for real mechanics (observer link, shared anomaly, invite) |
| — | Cloud / account save (requires a backend) |
| — | Server-side `initData` validation (requires a backend) |
| — | Telegram Stars / monetization (requires a backend) |
| — | Home-screen install prompts (`addToHomeScreen`) |
| — | Split Analytics/telemetry (needs a product decision, not a platform one) |
| — | Keyboard-aware layout (no text inputs exist today, so currently moot) |
| — | Lazy-loading Capacitor plugins to shrink the Telegram bundle |

---

## Risks

| Risk | Likelihood | Impact | Mitigation / decision |
|---|---|---|---|
| Telegram WebView storage is cleared (cache clear, reinstall, iOS eviction) | Medium | High — full progress loss | Accepted for closed beta. `storage.durable` is surfaced in the UI when writes fail. Cloud save is the real fix and needs a backend. |
| Double offline catch-up from two event sources | Low (was Medium) | High — duplicated progression | Controller de-duplicates transitions; `advanceOffline` consumes wall time so a repeat call simulates 0 ms; `resumeFromBackground` is additionally guarded by `schedulerStarted`. Covered by tests. |
| Minimize → the WebView is killed → cold start | High | Low | Cold start already loads the save and runs one catch-up; this is the same code path the APK uses. |
| `100vh` / safe-area differences per Telegram client | Medium | Medium | Measured values are published as CSS variables; still requires a device matrix pass. |
| Accidental swipe-to-close of the Mini App | Medium | Medium | `overscroll-behavior: none`; `disableVerticalSwipes()` capability detected but deliberately not called until the lead decides. |
| Bundle growth from platform code | Low | Low | Measured: +9.18 kB raw / +3.02 kB gzip (+1.91 % / +2.27 %). No new dependency. |
| APK regression | Low | High | The Capacitor adapter reproduces PR #9 semantics exactly (`appStateChange` only, lazy back-button registration). CI runs `assembleDebug` on this PR. |
| `window.confirm` blocked in Telegram WebView | Medium | Medium | Known and filed (G8); deliberately not changed in this PR. |
| Light-theme white flash before CSS applies | Low | Low | `html` now paints the page background from theme params. |

---

## Security boundary

### Client convenience context — safe to use without a backend

Read by the adapter today:

- viewport, stable viewport, safe-area / content-safe-area insets;
- `colorScheme` and `themeParams` (presentation only);
- `start_param` / `tgWebAppStartParam` (typed, allowlisted, never executed);
- capability detection (`isVersionAtLeast`, `BackButton`, `addToHomeScreen`, fullscreen);
- `version`, `platform` (diagnostics).

### Trusted identity / monetary / competitive state — NOT safe on the client

`initData` is a **string in JavaScript**. It is forgeable by anyone who can run JS in the page. The
adapter therefore:

- never reads `initData` for identity;
- never treats `initDataUnsafe.user` as an authenticated user;
- never grants resources, rewards, unlocks or directive access from launch input;
- never uses `start_param` as an authorization token.

The following require **server-side validation of `initData` against the bot token** and are
explicitly out of scope for this beta:

- real purchases / Telegram Stars;
- rewards with economic value;
- anti-cheat and authoritative progression;
- trusted identity and cross-device progress;
- authoritative multiplayer and leaderboards.

Future backend boundary (not built now):

```text
Mini App  --(initData raw string)-->  bot backend
                                        ├── HMAC-SHA256 verify against bot token
                                        ├── check auth_date freshness
                                        └── only then: identity / entitlements / cloud save
```

---

## Recommended platform abstraction

Implemented as `src/platform/`. The game core imports nothing from it; the dependency direction is
strictly `platform → core`.

```text
src/platform/
  types.ts          contracts (RuntimePlatform, LifecyclePhase, PlatformEnvironment, ...)
  launchIntent.ts   pure allowlisted launch-parameter parser
  lifecycle.ts      one de-duplicating lifecycle controller
  storage.ts        PreferencesStore / MemoryStore / createPlatformStorage
  telegram.ts       typed adapter over window.Telegram.WebApp (no wrapper SDK)
  browser.ts        standalone browser adapter
  capacitor.ts      Android adapter preserving PR #9 semantics
  dom.ts            the only place environment data reaches CSS
  index.ts          createPlatformAdapter() + getPlatform() singleton
  hostFixture.ts    in-memory host doubles (test only; avoids a jsdom dependency)
```

Target model:

```text
                 CONVERGENCE GAME CORE
                  canonical GameState
                          │
                  Platform Boundary (src/platform)
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
    Telegram           Browser          Capacitor
  (WebApp API)     (visibilitychange)  (appStateChange)
```

Rules the boundary enforces:

1. `src/game/**` imports no platform module (enforced by `coreIsolation.spec.ts`).
2. An adapter never mutates `GameState`.
3. Pinia stays a UI projection; the adapter is not a state manager.
4. There is one lifecycle enum, not a second state machine.
5. No new runtime dependency was added.

---

## Estimated implementation complexity

| Work item | Complexity | Done here |
|---|---|---|
| Platform contracts + detection | S | Yes |
| Lifecycle controller + adapters | M | Yes |
| Telegram typed adapter (ready/expand/insets/theme/back/version) | M | Yes |
| Launch-intent parser | S | Yes |
| Storage resolution + durability | S | Yes |
| Safe-area / viewport CSS bridge | S | Yes |
| Tests (7 suites, 50 new cases) | M | Yes |
| Move `PreferencesStore` out of the core | S | Yes |
| Geography extension types (no content) | S | Yes |
| In-game confirmation dialog | S | No — needs a UI decision |
| Telegram section in the beta guide | S | Yes (`docs/BETA_TESTING.md`) |
| Device matrix (Android/iOS/Desktop Telegram) | M | No — needs devices |
| Static HTTPS hosting + BotFather setup | S–M | No — outside the repo |
| Cloud save / account linking | L | No — needs a backend |
| Server-side `initData` validation | M | No — needs a backend |
| Moscow / region content | L | No — product spec in progress |
