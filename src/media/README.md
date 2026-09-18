# In-Game Media Insert System

Presentation subsystem for milestone / event media in **CONVERGENCE**.

## Scope

This package delivers short, diegetic visual moments — fullscreen reveals,
card modals, inline micro-inserts — for the canonical narrative beats of
the first session. It is **not** a redesign of the broader telemetry
dashboard. The package only renders media for events that already exist in
the simulation core; the rest of the game's surface stays exactly as it
was before.

What this package does:

- Renders a fullscreen / card / inline media insert when the runtime
  publishes a matching event (first mutation, syndicate reveal, Moscow
  reveal, first anomaly, control-loss).
- Decides which asset variant plays (poster, motion poster, or video)
  based on the host's capability tier and the user's reduced-motion
  preference.
- Persists which inserts have been shown, so one-shots do not replay
  across reloads of the same media history.
- Reconciles milestones the snapshot has already crossed but the player
  never saw (Telegram WebView closure mid-insert).
- Hides a DEV-only manual replay panel behind a build-time `import.meta.env.DEV`
  guard so production bundles carry none of its strings, CSS, or
  components.

What this package does **not** do:

- It does not change any screen, panel, layout, or colour outside the
  media layer.
- It does not invent gameplay values (resources, autonomy, pressure,
  scars). Copy traces back to real GameState facts.
- It does not replace the existing dashboard chrome or telemetry panels.
- It does not couple media history with gameplay save generations —
  media history is presentation state and lives in its own slot.

## Goals

1. Move important system moments from "telemetry tick" to "felt event"
   without redesigning the rest of the UI.
2. Keep the canonical `GameState` and `ConvergenceRuntime` untouched.
3. Stay mobile-first, Telegram-friendly, low-bandwidth by default.
4. Be safe to drop a real video asset into later without changing the
   presentation layer.

## Non-goals

- No LLM runtime, no backend, no promo assets.
- No autoplay sound.
- No heavy MP4 in the initial bundle.
- No second source of truth for the simulation.
- No redesign of the dashboard surface outside media inserts.
- No atomic coupling between the canonical `GameState` saves and the
  media slot. The `GameState` envelope remains the authoritative
  gameplay record; media history is a separate, best-effort, presentation
  store. A media-write failure never blocks a gameplay save.

## Architecture

```
            ┌───────────────────────────┐
            │     ConvergenceRuntime    │  ← unchanged simulation core
            │  publish(snapshot)        │
            └──────────────┬────────────┘
                           │ before/after diff
                           ▼
            ┌───────────────────────────┐
            │  detectTriggerEvents()    │  ← pure functions in `triggers.ts`
            └──────────────┬────────────┘
                           │ MediaRequest[]
                           ▼
            ┌───────────────────────────┐
            │  MediaRuntime (Pinia)     │  ← queue, dedupe, cooldown, tier
            └──────────────┬────────────┘
                           │ head + queue
              ┌────────────┴────────────┐
              ▼                         ▼
   ┌────────────────────┐   ┌────────────────────────┐
   │  <MediaLayer />    │   │  <MediaInlineLayer />  │
   │  fullscreen + card │   │  inline (in terminal)  │
   └────────────────────┘   └────────────────────────┘
```

The dependency direction is one-way. `src/game/**` never imports from
`src/media/**`; `src/media/**` reads snapshots only.

### Module layout

| Module | Purpose |
|---|---|
| `types.ts` | `MediaInsert`, `MediaRequest`, `MediaDismissedState`, channel/severity/tier enums, `dedupeKeyFor`, `presentationKeyFor`. |
| `capability.ts` | Pure tier detection from `navigator.connection`, `deviceMemory`, `hardwareConcurrency`, `prefers-reduced-motion`, Telegram version, user override. Telegram hosts below 7.0 always degrade to `minimal`. |
| `assetPolicy.ts` | Pure helper shared by all components — picks `video` / `motion` / `static` for a given insert + capability + motion preference. |
| `timer.ts` | Pure countdown controller used by all timed inserts (startTime + now-startTime model). |
| `i18n.ts` | BCP-47 locale resolution (primary subtag → `ru`/`en`/`zh`), copy lookup with safe fallbacks. |
| `manifest.ts` | P0 insert definitions (pure data, swappable). Default resolver for the runtime. |
| `triggers.ts` | Pure diff functions for every P0 event. Only events that map to a manifest insert are emitted. |
| `reconciliation.ts` | `deriveUnseenMilestoneRequests(state, dismissed, at)` recovers one-shot milestones crossed by the current snapshot but not recorded as seen. |
| `runtime.ts` | `MediaRuntime` class — queue, dedupe, severity sort, one-shot, per-key cooldown, context-filter, `setTier("off")` drains queue, origin-aware DEV `pushPreview` + unified `dismiss()`. |
| `persistence.ts` | `KeyValueStore`-based dismissed-state persistence in slot `convergence.media`, tolerant validator, and an ordered best-effort write queue that prevents stale writes from landing after newer state. |
| `stores/media.ts` | Pinia wrapper around `MediaRuntime`; single source of truth for `tier` + `prefersReducedMotion`; preview path exposed only to the debug panel. |
| `components/MediaLayer.vue` | Overlay mount point — fullscreen + card only. Teleport to body. Uses `:key="presentationKey"`. |
| `components/MediaInlineLayer.vue` | Inline mount point — must live inside the terminal panel, NOT teleported. Uses `:key="presentationKey"`. |
| `components/InsertFullscreen.vue` | Reveal-grade fullscreen insert. |
| `components/InsertCard.vue` | Modal-style card insert. |
| `components/InsertInline.vue` | Inline micro-insert with auto-dismiss timer. |
| `components/MediaDebugPanel.vue` | DEV-only manual replay panel — only loaded via `MediaDebugEntry.vue`'s dynamic import. |
| `components/MediaDebugEntry.vue` | Wrapper that calls `defineAsyncComponent(import(...))` only when `import.meta.env.DEV` is true. Production bundler dead-code-eliminates the branch. |
| `poster/*.svg` | Lightweight runtime fallback posters. Not the H3 generation reference — that is still pending. |

## Insert types (P0)

| `id` | When it fires | Channel | Severity | Tier | One-shot |
|---|---|---|---|---|---|
| `cv.first-mutation.v1` | First operational choice recorded (`narrative.lastChoice` changes from null) | fullscreen | signal | standard | yes |
| `cv.distributed-syndicate-reveal.v1` | Phase crosses from client-terminal to syndicate (or beyond) | card | incident | standard | yes |
| `cv.moscow-reveal.v1` | Narrative milestone `moscow-candidate` or `moscow-schematic` | fullscreen | signal | standard | yes |
| `cv.first-anomaly.v1` | First durable anomaly indicator: a non-clear containment stage or recorded incident | inline | ambient | standard | yes |
| `cv.control-loss.v1` | A `controlLoss` domain flips to true | card | critical | standard | no, 240s cooldown per domain |

Every insert is pure data: an `id`, the channel it lives in, an asset
selector (poster id + optional video src), localised copy, the tier at
which video is allowed, and gating rules (`oneShot`, `cooldownMs`,
`contextFilter`).

## Capability tiers

| Tier | Behaviour |
|---|---|
| `off` | All inserts dropped. Pending queue drained. |
| `minimal` | Static SVG poster only, no motion, no video. Chosen when `prefers-reduced-motion`, save-data, slow network, weak device, or unknown / pre-7.0 Telegram. |
| `standard` | CSS motion (drift, scanlines) on the poster. Video shown only when the manifest declares `videoTier: "standard"` and an `asset.src` exists. |
| `high` | Same as `standard`; reserved for future high-bitrate variants. |

Telegram clients with an unknown version or below `7.0` always clamp to
`minimal` — failing safe beats failing flashy.

## Accessibility

- `prefers-reduced-motion: reduce` selects the **static** asset variant.
  It never drops the event itself — important beats still surface, just
  as a static poster + copy.
- The motion drift animations are wrapped in
  `@media (prefers-reduced-motion: reduce)` rules so the CSS never
  animates regardless of `resolveAssetMode` policy.
- Touch targets on dismiss affordances are at least 44 px tall.
- Video elements are `muted`, `playsinline`, `preload="metadata"`. They
  ship with the bundle only when `asset.src` is set on the matching
  insert and the runtime picks the head of the queue.

## Persistence

Media state is presentation-only and lives in the dedicated slot
`convergence.media`, separate from the `schemaVersion: 2` save envelope.
The slot records:

- `seen`: insert ids the player has already dismissed (drives `oneShot`).
- `lastShownAt`: insert id → wall-clock presentation time.
- `snoozedUntil`: dedupe-key → wall-clock cooldown expiry.

`oneShot` semantics are **once per media history**, not "once per save
generation". A manual restore of a gameplay save does **not** rewind
media history — the seen / snoozed timeline continues forward. The
`resetForBeta` resets the in-memory history and persists that empty
history through the same ordered media queue so a fresh beta session
can replay one-shots.

There is no atomic guarantee between `GameState` slots and the media
slot. The canonical `GameState` save remains authoritative gameplay
state; only the separate media slot is best-effort presentation history.
A user who restarts the WebView mid-insert may need the `reconciliation`
helper to recover an unseen milestone (Telegram background closures were
a real driver for this addition).

## Reconciliation

After bootstrap, manual restore, or reset, the game store calls
`deriveUnseenMilestoneRequests(snapshot, dismissed, at)` and forwards
the result to the runtime. One-shot milestones that the current snapshot
has already crossed but the dismissed state hasn't recorded are
recovered. Repeating inserts (control-loss) are deliberately excluded
so a critical card never fires automatically on every launch.

## Integration

The patched `src/stores/game.ts` and `src/App.vue` add the following
minimal hooks:

1. `configureMedia()` resolves the tier and prepares the dismissed state
   bucket at app start. The store receives a `persistDismissed` callback
   that immediately queues each production dismiss into an ordered,
   best-effort `convergence.media` writer.
2. The runtime `subscribe` callback diffs the new snapshot against the
   previous one and forwards `MediaRequest`s to the media store.
   Bootstrap / restore / reset all set a one-shot `skipNextDiff` flag so
   a wholesale state swap never produces spurious media events.
3. `save()` writes the canonical `GameState` FIRST, then awaits the
   ordered media-history queue. Media writes never reject, so a media
   storage failure cannot fail an already-completed canonical save.
4. `load()` clears the stale media queue BEFORE wholesale state swap
   so a queued insert from the previous timeline cannot leak into the
   restored one.
5. `resetForBeta` wipes both the snapshot and the media slot so a
   fresh beta session can replay one-shot inserts.
6. After bootstrap / load / reset, `reconcileMilestones` recovers
   unseen one-shot milestones from the current snapshot.
7. `<MediaDebugEntry />` mounts the DEV-only panel behind a
   `defineAsyncComponent` dynamic import that the production bundler
   dead-code-eliminates.

No file under `src/game/**` is altered. No new dependency is added to
`package.json`.

## Save-priority ordering

Canonical gameplay save always wins over media persistence. The
`save()` flow:

```
1. await saveSnapshot(persistence, snapshot)    ← canonical, must succeed
2. await mediaPersistence.persist(dismissed)    ← ordered best-effort queue, never rejects
3. return generation
```

Each production dismiss also queues the latest media history immediately.
Writes are serialized, so an older slow write cannot overwrite a newer
`seen`/cooldown state. A media-write failure therefore never aborts a
gameplay save, while lifecycle/background saves still get a chance to
flush presentation history before returning.

## Localisation

`MediaCopy.title` and `MediaCopy.caption` are dictionaries keyed by
locale (`ru`, `en`, `zh`). `pickLocale` accepts any BCP-47 spelling
and routes on the primary subtag (`ru-RU` → `ru`, `en-US` → `en`,
`zh-Hans-CN` → `zh`). Missing locales fall back through
`ru → en → any` and never throw.

## Asset strategy

- Posters live in `src/media/poster/*.svg` and are imported with
  `?raw` so Vite bundles them as inline strings (≤ 3 kB each). They
  serve as the runtime fallback when no video is set.
- Video assets are optional. When a future video is produced for a
  given insert, set `asset.src = "/media/<insert.id>.mp4"` and the
  runtime will pick it up automatically when the tier permits.
- Videos are loaded only when the runtime has chosen to play them; the
  initial bundle never includes heavy video.
- H3 prompts in `docs/prompts/media-inserts-h3.md` are textless, use a
  9:16 reference plate, and produce muted video. The current state of
  the prompts is **PROMPT-READY, REFERENCE-PLATE PENDING** — the
  fallback SVG posters are 3:4 placeholders, not the Visual North Star
  needed for the first real generation run.

## DEV replay

The manual replay panel is wired through the runtime's `pushPreview`
path. Every queue entry carries an `origin` field; the unified
`dismiss()` reads it and only updates dismissed state for production
entries. For inserts that require a `domain` (control-loss), the panel
supplies a safe fictitious `financial` context; this context is part
of the preview entry only and never reaches production dismissed state.

## Testing

```
npm run typecheck
npx vitest run src/media
npx vitest run --testTimeout=60000
```

Covers:

- `capability.spec.ts` — tier detection, navigator parsing, version
  comparison, Telegram < 7.0 / unknown → minimal.
- `i18n.spec.ts` — BCP-47 locale selection, copy fallback chain.
- `assetPolicy.spec.ts` — `resolveAssetMode` matrix (video / motion /
  static) under every tier + motion preference combination.
- `timer.spec.ts` — `TimerController` state machine.
- `triggers.spec.ts` — every detector against representative snapshot
  diffs; threshold-crossing semantics for offline catch-up;
  `detectTriggerEvents` only emits events with a real manifest entry;
  `eventsToRequests` only emits resolvable requests.
- `reconciliation.spec.ts` — unseen-milestone recovery from the
  current snapshot; one-shot dedupe against seen; control-loss
  excluded from reconciliation.
- `presentation.spec.ts` — `dedupeKeyFor` and `presentationKeyFor`
  contracts.
- `runtime.spec.ts` — DI resolver, unknown id, oneShot, cooldown
  (starts from runtime `now()`, blocks same domain within window,
  allows same domain after expiry, never blocks a different domain),
  reduced-motion as a presentation hint, tier=off clears the queue,
  severity ordering, context filter, dismissed state, dedupe, reset,
  mutable setters, DEV preview path bypasses gates.
- `persistence.spec.ts` — validator against prototype pollution,
  NaN/Infinity, unsafe keys, non-string entries, non-object payloads;
  ordered-write regression coverage and recovery after a failed media write.
- `storeIntegration.spec.ts` — production dismiss persists immediately;
  DEV preview dismiss uses the same UI path without mutating or persisting history.
- `autoDismiss.spec.ts` — inline auto-dismiss arms, restarts, cancels and
  transitions back to stopped state after firing.

## Scaling later

- Add new inserts by appending to `MEDIA_INSERTS` in `manifest.ts`. The
  trigger layer grows by adding a new entry to `MediaTriggerKind` and a
  detector in `triggers.ts`; the runtime picks them up automatically.
- Real videos: drop the MP4 into `public/media/<id>.mp4`, point the
  insert's `asset.src` at the URL, set the desired `videoTier`.
- Localisation: extend the `MediaCopy` dictionaries; no code changes
  needed.
- Per-domain anomalies: introduce `cv.first-anomaly.<domain>.v1` and
  switch the trigger to emit one request per domain using the existing
  `contextFilter`.
- Approved H3 reference plate: replace `PROMPT-READY, REFERENCE-PLATE
  PENDING` with the actual plate, then submit the matching H3 prompt.

## PR / commit plan

1. Land `src/media/` as a single feature commit.
2. Update `src/stores/game.ts` and `src/App.vue` as follow-up commits.
3. Add a CHANGELOG entry noting the new public surface.
4. Optional: regenerate posters with the design system if the visual
   language evolves — the manifest is data-driven so no migration is
   needed.
