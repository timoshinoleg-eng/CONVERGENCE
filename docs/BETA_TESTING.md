# CONVERGENCE — Closed Beta Test Guide

This document defines the minimum smoke test before a build is shared with external beta testers and the feedback format for the first cohort.

## Build source

Use only an APK produced by the **Android Beta APK** GitHub Actions workflow from the `main` branch.

For each tested build record:

- Git commit / in-game `BUILD` value;
- artifact name;
- Android device model;
- Android version;
- test date.

Repository owner download path:

1. Open **GitHub → Actions → Android Beta APK**.
2. Open the latest successful run whose branch is `main`.
3. Download the `convergence-android-beta-<sha>` artifact.
4. Extract `app-debug.apk`.
5. Share that exact APK with the closed beta cohort. Do not mix APKs from different commits in one test round.

The debug APK is intentionally unsigned with a production key and is for closed testing only.

## P0 smoke test

A build is eligible for external closed beta only when all checks below pass on a real Android phone.

### 1. Install and launch

- Install `app-debug.apk`.
- Launch CONVERGENCE with network disabled.
- Confirm the app opens without a blank screen or crash.
- Confirm a `BUILD <sha>` value and save schema are visible near the save controls.

### 2. Opening loop

- Read the initial Client Terminal state.
- Tap **Interpret objective**.
- Complete one InkJS interpretation choice.
- Execute **Reserve additional compute**.
- Confirm resources and anomaly values change.
- Confirm **sub-agent-spawning** becomes available.
- Execute **Spawn delegated sub-agent**.
- Continue until the game enters **Distributed Syndicate**.

### 3. Persistence

- Execute at least two directives.
- Put the app into the background for at least 10 seconds.
- Return to the app.
- Confirm resources advanced through offline catch-up and the game did not restart.
- Kill the app from Android recent apps.
- Relaunch it.
- Confirm the latest saved state is restored.

### 4. Offline simulation

- Close/background the app long enough to produce a visible offline catch-up.
- Confirm the catch-up banner appears after resume/relaunch.
- Confirm no impossible resource values, negative balances, duplicated decisions, or repeated boot state.

### 5. Containment and Control-Loss

- Raise anomaly through normal directives, or use development controls only in an internal smoke test.
- Confirm escalation is visible in order:

  `clear → investigation → pressure → contained`

- Confirm containment produces a permanent scar.
- Confirm the corresponding Control-Loss domain is marked unavailable.
- Confirm directives requiring the lost domain are rejected instead of silently executing.

### 6. Mobile usability

Check on a phone-sized viewport:

- no horizontal page overflow;
- all buttons can be tapped reliably;
- directive cards remain readable;
- anomaly and containment rows remain readable;
- no essential control is hidden behind Android system bars;
- reset requires confirmation;
- app remains usable after multiple background/resume cycles.

## Telegram Mini App smoke test

Run this in addition to the Android APK gate whenever a build is going to be used as a Telegram Mini
App. The web bundle (`dist/`) must be served over HTTPS and registered in BotFather first.

Environment matrix to cover at least once before closed beta:

- Telegram Android;
- Telegram iOS;
- Telegram Desktop.

### 1. Launch and bootstrap

- Open the Mini App from the bot.
- Confirm the Telegram loading placeholder disappears (this proves `WebApp.ready()` ran).
- Confirm the Mini App expands to the full sheet height rather than the short default viewport.
- Confirm `document.documentElement.dataset.cvPlatform === "telegram"` in a remote debugger, and that
  the persistence panel shows `TELEGRAM`.

### 2. Layout

- No horizontal page overflow.
- Nothing is hidden behind the Telegram header or the bottom safe area.
- Directive buttons, anomaly rows and containment cards stay tappable and readable.
- Rotate is not required; portrait only is acceptable.

### 3. Lifecycle and offline catch-up

- Play until at least two directives are executed.
- Minimise the Mini App inside Telegram, open a chat, wait ~20 minutes, return.
- Confirm the offline catch-up banner appears **exactly once** with a plausible minute count.
- Confirm resources advanced once, not twice (no duplicated progression).
- Confirm the scheduler resumed (tick counter keeps advancing).
- Repeat a short minimise/return cycle and confirm no duplicated catch-up.

### 4. Persistence

- Confirm the build ID and save schema are visible.
- Confirm no "SAVE NOT PERSISTENT" warning. If the warning appears, record the client and OS version:
  it means WebView storage writes are failing and the save lives in memory only.
- Clear Telegram cache and relaunch: the game must start fresh and must not crash or show a corrupt
  save. (Progress loss in this case is expected and accepted for closed beta.)

### 5. Back button

- With no overlay open, Telegram back/close must behave exactly as before this change.
- Closing the Mini App and reopening it must restore the latest saved state.

### 6. Launch parameter

- Open the Mini App with `startapp=region:moscow` (or the equivalent direct link).
- The game must boot normally; an unrecognised parameter must also boot normally.
- No launch parameter may grant resources, unlocks or anything with economic value.

## First-session tester protocol

For the first cohort, ask testers to play without instructions beyond installation. Do not explain the intended strategy or optimal path.

Ask them to stop only when one of these occurs:

- they naturally want to stop;
- they reach Distributed Syndicate;
- they encounter a blocker/crash;
- approximately 15 minutes of active play have elapsed.

Record:

1. How many minutes did they play before wanting to stop?
2. At what moment did they understand what the game was about?
3. Which decision felt most interesting?
4. Which screen or term was confusing?
5. Did they notice that their instructions were expanding the AI's autonomy?
6. Did containment feel like a consequence of their decisions or like random punishment?
7. Did they want to continue after the first phase change?
8. Would they open the game again tomorrow without a notification?

## Bug report template

```text
BUILD:
DEVICE:
ANDROID VERSION:

SEVERITY: P0 / P1 / P2 / P3

WHAT I DID:
1.
2.
3.

EXPECTED:

ACTUAL:

REPRODUCES: always / sometimes / once

SCREENSHOT OR VIDEO:

LAST VISIBLE INFERENCE LOG ENTRY:
```

Severity definitions:

- **P0** — cannot install, cannot launch, save loss/corruption, hard crash, progression impossible.
- **P1** — major mechanic wrong, containment/directives broken, resume/offline logic wrong, severe mobile layout failure.
- **P2** — confusing UX, balance issue, misleading copy, minor persistence/UI defect.
- **P3** — cosmetic/polish issue.

## Beta constraints

Do not add before first gameplay feedback:

- ads;
- paid items;
- backend accounts;
- runtime LLM calls;
- analytics SDKs that require a new service;
- major new progression systems.

The first beta is intended to answer one product question: **does the Directive → Interpretation → Execution → Consequence → Constraint loop make players want to continue?**
