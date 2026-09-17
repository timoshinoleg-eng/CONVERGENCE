# CONVERGENCE — Telegram Mini App Architecture

Date: 2026-09-17
Branch: `feat/telegram-readiness`

This document is the authoritative platform-boundary description for the first Telegram beta.

## Invariants

- One canonical plain-TypeScript `GameState` remains the gameplay source of truth.
- Pinia remains a UI projection.
- `src/game/**` does not import Telegram, DOM or Capacitor APIs.
- Platform-specific lifecycle, storage and presentation live under `src/platform/`.
- No backend, bot service, database, Stars, multiplayer or runtime LLM is introduced here.
- Save schema remains v2. Persistent geography is deliberately deferred to a future v3 migration.

## Runtime bootstrap and detection

Telegram requires the official `telegram-web-app.js` bridge before application scripts. `index.html` loads it synchronously only when Telegram launch parameters or the Telegram WebView transport are present. Ordinary browser and Capacitor launches therefore remain offline-first and do not block on a request to `telegram.org`.

Detection order:

```text
genuine Telegram launch context + window.Telegram.WebApp -> telegram
Capacitor.isNativePlatform()                            -> capacitor
otherwise                                               -> browser
```

Loading the bridge alone is not sufficient to classify a normal browser as Telegram: `platform=unknown` with no Telegram launch context is rejected.

## Lifecycle

One conceptual model is shared across runtimes:

```text
active <-> background -> dispose
```

| Runtime | Authoritative input | Fallback |
| --- | --- | --- |
| Telegram Bot API 8.0+ | `activated` / `deactivated` | DOM `visibilitychange`; `pagehide` for disposal |
| Browser | DOM `visibilitychange` | `pagehide` |
| Capacitor Android | `App.appStateChange` | DOM visibility only when the App plugin is unavailable |

The lifecycle controller de-duplicates repeated signals and immediately reports its current phase to a subscriber. That closes the boot race where a Mini App can become inactive before Vue subscribes: after `game.start()`, a current `background` phase immediately stops the scheduler and flushes a save.

## Telegram environment

The adapter refreshes its environment and republishes CSS variables on:

- `viewportChanged`
- `themeChanged`
- `fullscreenChanged`
- `safeAreaChanged`
- `contentSafeAreaChanged`

It uses `viewportHeight`, `viewportStableHeight`, `safeAreaInset`, `contentSafeAreaInset`, `themeParams` and `colorScheme` without allowing Telegram to replace the CONVERGENCE visual identity.

## Storage

The save envelope, checksum, A/B slots and schema are unchanged. Only the host storage changes.

Telegram order:

```text
WebApp.DeviceStorage (Bot API 9.0+, up to 5 MB per user/bot)
    -> Capacitor Preferences web fallback / localStorage
        -> in-memory session fallback
```

Other runtimes:

| Runtime | Primary persistence |
| --- | --- |
| Capacitor Android | Preferences / native SharedPreferences |
| Standalone browser | Preferences web fallback / localStorage |

A failed write is retried with the same key/value on the next layer. Storage operations are serialized because the A/B save code reads several keys through `Promise.all`; this prevents a single failing DeviceStorage request from switching the shared fallback layer while sibling reads are still in flight.

`DeviceStorage` is local-device persistence, not cloud/account save. Cross-device progress remains a later backend concern.

## Launch intents

Telegram `start_param`, `tgWebAppStartParam` and equivalent link data are untrusted. They are converted to a closed data-only union:

```ts
type LaunchIntent =
  | { type: 'default'; reason: 'none' | 'empty' | 'malformed' }
  | { type: 'observe'; id: string }
  | { type: 'event'; id: string }
  | { type: 'region'; id: string }
  | { type: 'invite'; code: string };
```

Unknown or malformed values boot normally. Launch intents do not mutate `GameState`, grant resources or establish identity.

## Security boundary

`initDataUnsafe` is never authoritative. Client data can be used for presentation and launch context only.

Trusted identity, cloud save, entitlements, purchases, rewards and competitive/social state require validated Telegram `initData` outside the client. That backend boundary is intentionally not implemented in this PR.

## Geography extension point

`src/game/world.ts` defines data contracts for:

```text
World -> Countries -> Russia -> Moscow -> Nodes
```

It does **not** add `world` to persistent `GameState` v2. When Moscow becomes real mutable gameplay state, persistence must arrive together with an explicit save migration v2 -> v3. This prevents an older v2 build from silently stripping geography from a newer save and then overwriting it.

## Telegram API surface used now

| API | Status |
| --- | --- |
| official `telegram-web-app.js` bridge | conditional Telegram-only bootstrap before app entry |
| `ready()` | used |
| `expand()` | used |
| `activated` / `deactivated` | lifecycle input |
| viewport + safe-area fields/events | used and republished to CSS |
| `BackButton` | supported through a minimal handler slot |
| `DeviceStorage` | primary Telegram save store when available |
| `requestFullscreen()` | capability-detected, opt-in only |
| `disableVerticalSwipes()` | capability-detected, not enabled by default |
| home-screen APIs | detected only |

No Telegram wrapper SDK is required.

## Still required before a real Telegram beta

1. Static HTTPS hosting for `dist/`.
2. BotFather Main Mini App registration using that URL.
3. Device smoke test on Telegram Android, then iOS and Desktop.
4. Replace `window.confirm` reset with an in-game/Telegram-native confirmation before closed beta.
5. Product decision on fullscreen and vertical-swipe behavior after real-device testing.

## Verification contract

Every platform-boundary change must keep all of these green:

```text
npm run typecheck
npm test
npm run build
Android assembleDebug
```

The test suite includes Telegram runtime detection, current Bot API lifecycle/safe-area behavior, storage degradation, launch-intent validation, core isolation, Capacitor lifecycle parity and the pre-existing pacing/integration gates.
