# CONVERGENCE — Telegram Mini App Readiness Audit

Date: 2026-09-17
Branch: `feat/telegram-readiness`
Target: first Telegram smoke test, while preserving standalone browser and Capacitor Android.

## Executive status

The platform boundary is now technically suitable for merge once CI + Android are green on the final head. Telegram/Web/Capacitor share one gameplay core and one save format. Telegram-specific APIs are isolated under `src/platform/`.

This is **not yet a live Telegram beta**. Hosting, BotFather registration and real-device smoke testing remain operational P0/P1 work.

## What was wrong before this PR

- lifecycle existed only through Capacitor `appStateChange`;
- game persistence core imported Capacitor Preferences directly;
- no Telegram bridge, `ready()`, safe-area, viewport, BackButton or launch-intent handling;
- no Telegram-aware persistence path;
- no explicit security boundary for untrusted Telegram launch/init data.

## P0/P1 gaps and current status

| Gap | Status | Resolution |
| --- | --- | --- |
| Telegram bridge bootstrap | FIXED | Official bridge loads before app entry only for Telegram launch context/transport; browser/APK do not fetch it |
| Native Capacitor detection | FIXED | Uses `Capacitor.isNativePlatform()` |
| Shared lifecycle | FIXED | Telegram `activated/deactivated`, browser visibility, native `appStateChange` feed one de-duplicating controller |
| Startup lifecycle race | FIXED | Subscriber receives current lifecycle phase immediately |
| Telegram viewport/safe area | FIXED IN CODE | Current metrics republished on viewport/theme/fullscreen/safe-area events; device verification still required |
| Platform-independent game core | FIXED | `src/game/**` depends only on `KeyValueStore`, not platform SDKs |
| Telegram persistence | FIXED IN CODE | DeviceStorage -> localStorage -> memory; same A/B save envelope |
| Lost write on storage fallback | FIXED | Failed write is retried with same key/value on next layer |
| Concurrent fallback race | FIXED | storage operations serialized across A/B/active reads/writes |
| Launch parameters | FIXED AS EXTENSION POINT | strict typed `LaunchIntent`; no state mutation/reward |
| Telegram `initData` trust boundary | FIXED IN DOCS/CODE | client data never establishes trusted identity/entitlements |
| Geography extension | FIXED AS TYPES ONLY | Russia/Moscow node contracts exist, persistence deferred to explicit save v3 migration |
| Reset confirmation | OPEN P1 | `window.confirm` still needs an in-game/Telegram-native replacement |
| HTTPS hosting + BotFather | OPEN P0 OPS | required for real Telegram launch |
| Telegram Android/iOS/Desktop device pass | OPEN P1 | cannot be proven by unit/CI alone |

## Runtime architecture

```text
                         canonical GameState
                                |
                         ConvergenceRuntime
                                |
                           Pinia projection
                                |
                         PlatformAdapter
                 _______________|_______________
                |               |               |
            Telegram          Browser       Capacitor
```

No platform adapter owns gameplay state.

## Telegram bootstrap

Telegram's official bridge must exist before the application code calls platform detection. The HTML bootstrap therefore checks Telegram launch evidence / WebView transport and loads `https://telegram.org/js/telegram-web-app.js?63` synchronously before `/src/main.ts` only for Telegram launches.

Why conditional: loading the remote Telegram script for every standalone browser/APK launch would introduce an unnecessary network dependency and weaken the offline-first fallback channel.

## Lifecycle

Conceptual phases:

```text
active <-> background -> dispose
```

Sources:

- Telegram Bot API 8.0+: `activated` / `deactivated`, with DOM visibility fallback;
- browser: `visibilitychange` / `pagehide`;
- Capacitor Android: `App.appStateChange`.

The controller de-duplicates host noise and replays its current phase when a subscriber attaches. This prevents the scheduler from remaining active if Telegram is minimized during app boot.

## Storage

Telegram preferred store is Bot API 9.0+ `WebApp.DeviceStorage` (up to 5 MB per user/bot). Fallback order:

```text
telegram-device -> web-localstorage -> memory
```

Capacitor uses native Preferences; standalone browser uses the web Preferences/localStorage path.

The storage boundary serializes operations because the save layer intentionally reads A/B/active slots with `Promise.all`. A storage failure can therefore switch fallback layers without sibling reads observing different active backends.

No cloud/account save is implemented. DeviceStorage is local to the device.

## Security boundary

Safe client-side uses:

- viewport/safe-area/theme presentation;
- runtime version/platform diagnostics;
- typed start parameter / launch intent;
- capability detection.

Not trusted client-side:

- user identity for authoritative state;
- cloud save ownership;
- purchases/entitlements;
- rewards/referrals;
- multiplayer/leaderboard state.

Those require server-side validation of Telegram `initData` before use.

## Russia / Moscow extension

`src/game/world.ts` defines `CountryDefinition`, `RegionDefinition`, `NodeDefinition`, `RegionState`, `NodeState`, and `WorldState` as a future data contract.

The field is deliberately **not** present in persistent `GameState` schema v2. Real Moscow progression will enter with a save v2 -> v3 migration once the region design is accepted. This prevents older v2 clients from parsing a newer save, stripping unknown geography, and overwriting it.

## Remaining beta gates

### P0 before Telegram smoke test

- merge this platform PR only after final typecheck/tests/build/Android green;
- publish `dist/` at a stable HTTPS URL;
- configure a Main Mini App in BotFather;
- launch from Telegram Android and verify runtime is `telegram`, storage backend, safe area, minimize/return and save restore.

### P1 before closed beta

- replace `window.confirm` reset;
- verify iOS + Desktop;
- decide fullscreen / vertical swipe behavior from device UX, not theory;
- verify DeviceStorage persistence after Telegram restart;
- test unsupported/older Telegram client fallback.

### P2 after core-fun validation

- consume `LaunchIntent` for observer/event/region mechanics;
- bot/relay for asynchronous reports;
- validated identity + cloud save if retention warrants it;
- social mechanics and Telegram Stars only after gameplay retention is proven.

## Known gameplay issues outside this PR

The platform work intentionally does not hide existing gameplay findings from `npm run test:pacing`:

- current Technosphere progression is much faster than the intended first-session reveal;
- early Compute Control-Loss can progression-lock the player;
- Public Control-Loss currently blocks no directive.

These are game-design/balance tasks and must be solved using the accepted Telegram-first first-session specification, not inside the platform adapter PR.
