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
