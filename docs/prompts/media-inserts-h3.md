# MiniMax-H3 prompts — CONVERGENCE in-game media inserts

> **Status: PROMPT-READY, REFERENCE-PLATE PENDING.**
>
> The prompts below describe what the model should produce. They are
> ready to submit the moment an approved portrait 9:16 generation
> reference plate exists. The current runtime fallback posters in
> `src/media/poster/*.svg` are 3:4 placeholders and are NOT the
> Visual North Star — they exist to make the architecture shippable
> without real video, not to anchor a generation run. Submitting the
> SVGs as first-frame reference for an H3 image-to-video task would
> crop and stretch a low-fidelity raster into a 9:16 plate.

## Generation defaults (when a real reference plate exists)

```
model:        MiniMax-H3
mode:         image-to-video (first-frame reference, no mid-keyframes)
ratio:        9:16  (portrait — Telegram Mini App)
duration:     6 s
resolution:   2K master
audio:        OFF — videos ship muted (Vue plays without sound)
reference:    approved portrait 9:16 PNG/JPEG plate for the corresponding beat
```

## Why image-to-video, textless, muted

- The Vue shell overlays real copy (RU/EN/ZH) on top of the video, so the
  video plate must be **textless**. Generating in-video typography either
  re-translates per locale or ships AI-garbled letterforms.
- A single high-quality portrait reference plate is the canonical Visual
  North Star; submitting the same plate every iteration keeps the visual
  language locked across poster + motion + fullscreen.
- No reference audio: the runtime always sets `muted`, and no audio bytes
  ship to the bundle.

## Hard constraints — every prompt must respect

```
- Preserve visual language of the provided reference plate
- NO readable text in the generated video — not English, not Russian,
  not Chinese, no pseudo-letters, no UI labels, no button names,
  no digits, no counters, no serial numbers, no field names
- The Vue shell supplies all readable copy on top of the plate
- No logos, no brand marks, no UI buttons, no fake typography
- No real infrastructure labels (street names, provider names, real coordinates)
- No Matrix rain, no neon cyberpunk, no military HUD, no command-center theatrics
- No camera shake, no fast cuts, no whip pans
- Restrained motion only (slow drift, soft light, single sweep)
- Fictional aggregate topology only — no exact map overlays
- The plate must remain readable at 360 CSS px width
- No fabricated gameplay numbers, autonomy counters, or pressure values
  (the runtime supplies real context if a number is ever needed)
```

Moscow-specific constraints (for `cv.moscow-reveal.v1`):

```
- No real city coordinates
- No real critical infrastructure shapes
- No exact street or district overlays
- Schematic nodes are explicit fictional placeholders
- Latitude/longitude ticks are stylised, not real values
```

## Beat briefs

### cv.first-mutation.v1

A boot-trace visualisation that signals the first interpretive
mutation. The video plate should feel like a slow, restrained operator
debrief — not a sci-fi glitch.

```
Motion: a single horizontal light sweep crosses the frame once, leaving
a faint afterglow. The plate stays still otherwise. No camera movement.
NO readable text in the generated video. End on the static reference
frame. 6 seconds.
```

### cv.distributed-syndicate-reveal.v1

The interface expansion from Client Terminal to Distributed Syndicate.
A schematic mesh of abstract nodes around a central anchor point.

```
Motion: several abstract surrounding nodes pulse outward from the
center one by one over the duration, each pulse a faint brightness
bloom that decays to baseline before the next begins. Connecting
strokes between nodes briefly re-draw as faint lines. The center node
brightens on the final second. No camera movement. NO readable text in
the generated video. End on the reference frame. 6 seconds.
```

### cv.moscow-reveal.v1

The regional model milestone. Fictional aggregate topology only.

```
Motion: a few aggregate nodes fade in sequentially from a faint dotted
coordinate grid (the grid is a stylised texture, not real coordinates),
then a thin rectangular containment outline draws itself around them
once. Stylised latitude/longitude ticks appear as decorative only. No
real city names, no real street names, no real district outlines. No
camera movement. NO readable text in the generated video. End on the
reference frame. 6 seconds.
```

### cv.first-anomaly.v1

An operator-grade anomaly correlation card. Subdued tension, not alarm.

```
Motion: an abstract pressure indicator rises noticeably along the
bottom track. An abstract indicator area pulses once and resolves into
a redacted geometric block. No digits, no glyphs, no letters, no labels,
no pseudo-text. NO readable text in the generated video. End on the
reference frame. 6 seconds.
```

### cv.control-loss.v1

A control surface partitioned card. The player's directive class has
been restricted; the visual is restrained, not catastrophic.

```
Motion: a thin diagonal cross draws itself once across the frame. The
card border brightens at the moment the cross completes. One of the
control channels visually dims or disconnects; the topology boundary
shifts inward slightly. No camera movement. NO readable text in the
generated video. End on the reference frame. 6 seconds.
```

## Workflow

When a real reference plate exists for each beat:

1. Submit the prompt above with the matching generation defaults and the
   corresponding 9:16 reference plate as the first-frame reference.
2. Save the output under `public/media/<insert.id>.mp4` (poster still
   lives in the bundle as the fallback asset).
3. Edit `src/media/manifest.ts` and set
   `asset.src = "/media/<insert.id>.mp4"` on the matching `MediaInsert`.

The runtime will:

- Skip video on `minimal` and `off` tiers — poster plays instead.
- Skip video entirely when `asset.src` is missing.
- Honour `prefers-reduced-motion`, one-shot rules, and per-context cooldowns.
- Fall back to poster automatically on `<video>` `error`.
