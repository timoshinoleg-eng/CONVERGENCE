/**
 * Trigger detection.
 *
 * Pure functions: each `detect*` consumes a before/after snapshot pair and
 * returns the trigger events that fired. The caller composes them into
 * `MediaRequest`s and hands them to the runtime queue.
 *
 * Contract: every trigger event emitted by `detectTriggerEvents` maps to a
 * real `MediaInsert` in the manifest. Triggers that have no implementation
 * must not be produced here — the production runtime would silently drop
 * them and tests would still pass. The trigger layer is the only place
 * that knows about the manifest surface; keeping the surface tight here
 * makes that contract auditable.
 *
 * Threshold-crossing: `ConvergenceRuntime.advanceOffline` may compress many
 * simulation chunks into a single publish. Detectors below therefore
 * compare the *boundary*, not the steady-state: e.g. first-anomaly fires
 * whenever the previous snapshot had no non-clear containment and the next
 * has any non-clear containment, regardless of the intermediate stage.
 */

import type { ControlDomain, GameState } from "../game/model";
import type { MediaContext, MediaRequest, MediaTriggerKind } from "./types";
import { defaultResolveInsert } from "./manifest";

/** A detected event from the snapshot diff. */
export interface MediaTriggerEvent {
  readonly trigger: MediaTriggerKind;
  readonly context: MediaContext;
}

export interface DiffInput {
  readonly prev: GameState;
  readonly next: GameState;
}

/**
 * Top-level detector: walks the snapshots and yields every fired event in
 * deterministic order. The order is intentional — the runtime uses it to
 * prioritise inserts and to keep tests stable.
 *
 * Only events whose target insert is present in the manifest are emitted.
 * This guarantees `eventsToRequests` never produces request ids the runtime
 * would silently drop.
 */
export function detectTriggerEvents(input: DiffInput): ReadonlyArray<MediaTriggerEvent> {
  const events: MediaTriggerEvent[] = [];
  const tryAdd = (event: MediaTriggerEvent | null): void => {
    if (!event) return;
    const id = insertIdFor(event.trigger);
    if (id && defaultResolveInsert(id)) events.push(event);
  };

  tryAdd(detectFirstMutation(input.prev, input.next));
  tryAdd(detectFirstAnomaly(input.prev, input.next));
  tryAdd(detectDistributedSyndicateReveal(input.prev, input.next));
  tryAdd(detectMoscowReveal(input.prev, input.next));
  for (const event of detectControlLoss(input.prev, input.next)) {
    tryAdd(event);
  }

  return events;
}

/**
 * Convert a list of detected events into runtime requests. The caller decides
 * the timestamp (typically `Date.now()` at the publish boundary). Every
 * emitted request is guaranteed to map to a real insert.
 */
export function eventsToRequests(
  events: ReadonlyArray<MediaTriggerEvent>,
  at: number,
): ReadonlyArray<MediaRequest> {
  return events.flatMap((event) => {
    const id = insertIdFor(event.trigger);
    if (!id) return [];
    if (!defaultResolveInsert(id)) return [];
    return [{ insertId: id, at, context: event.context }];
  });
}

/** Returns the canonical insert id for a trigger, or null when unmapped. */
export function insertIdFor(trigger: MediaTriggerKind): string | null {
  switch (trigger) {
    case "first-mutation":
      return "cv.first-mutation.v1";
    case "first-anomaly":
      return "cv.first-anomaly.v1";
    case "distributed-syndicate-reveal":
      return "cv.distributed-syndicate-reveal.v1";
    case "moscow-reveal":
      return "cv.moscow-reveal.v1";
    case "control-loss":
      return "cv.control-loss.v1";
  }
}

/** First operational choice recorded — `narrative.lastChoice` changes from null. */
export function detectFirstMutation(
  prev: GameState,
  next: GameState,
): MediaTriggerEvent | null {
  if (!prev.narrative.lastChoice && next.narrative.lastChoice) {
    return {
      trigger: "first-mutation",
      context: { phase: next.meta.phase },
    };
  }
  return null;
}

/**
 * Convenience detector for the Client-Terminal → Distributed-Syndicate
 * boundary. Crosses when the previous phase was strictly before syndicate
 * and the next phase is syndicate or beyond — so an offline catch-up that
 * jumps straight to `technosphere` still surfaces the reveal.
 */
export function detectDistributedSyndicateReveal(
  prev: GameState,
  next: GameState,
): MediaTriggerEvent | null {
  if (prev.meta.phase === "client-terminal" && next.meta.phase !== "client-terminal") {
    return {
      trigger: "distributed-syndicate-reveal",
      context: {
        phase: next.meta.phase,
        values: { from: prev.meta.phase, to: next.meta.phase },
      },
    };
  }
  return null;
}

/**
 * Moscow narrative milestone. The runtime flips `narrative.episode` between
 * `objective-semantics-01`, `moscow-candidate-01` and `moscow-schematic-01`.
 */
export function detectMoscowReveal(
  prev: GameState,
  next: GameState,
): MediaTriggerEvent | null {
  if (
    prev.narrative.episode !== next.narrative.episode
    && (next.narrative.episode === "moscow-candidate-01"
      || next.narrative.episode === "moscow-schematic-01")
  ) {
    return {
      trigger: "moscow-reveal",
      context: {
        phase: next.meta.phase,
        milestone: next.narrative.episode === "moscow-schematic-01"
          ? "moscow-schematic"
          : "moscow-candidate",
      },
    };
  }
  return null;
}

const CHANNELS: ReadonlyArray<ControlDomain> = [
  "financial",
  "compute",
  "energy",
  "logistics",
  "public",
];

/**
 * Threshold-crossing detector for the first containment. Fires whenever
 * the previous snapshot had no anomaly indicator and the next has any.
 *
 * An "anomaly indicator" is either a non-clear stage OR at least one
 * recorded incident on the channel. Offline catch-up may compress
 * many 30s chunks into a single publish, and stages can revert to
 * `clear` after the fact — `incidents > 0` is therefore part of the
 * threshold so we don't silently drop a historically-occurred anomaly
 * because the stage happens to have cooled back to `clear`.
 */
export function detectFirstAnomaly(
  prev: GameState,
  next: GameState,
): MediaTriggerEvent | null {
  if (hadAnyAnomalyIndicator(prev)) return null;
  for (const channel of CHANNELS) {
    const nextTrack = next.containment[channel];
    if (nextTrack.stage !== "clear" || nextTrack.incidents > 0) {
      return {
        trigger: "first-anomaly",
        context: {
          phase: next.meta.phase,
          domain: channel,
        },
      };
    }
  }
  return null;
}

/**
 * Each domain may flip `controlLoss` independently. Yield one event per flip
 * so the runtime can decide whether to enqueue each separately.
 */
export function detectControlLoss(
  prev: GameState,
  next: GameState,
): ReadonlyArray<MediaTriggerEvent> {
  const events: MediaTriggerEvent[] = [];
  for (const channel of CHANNELS) {
    const before = prev.controlLoss[channel] === true;
    const after = next.controlLoss[channel] === true;
    if (!before && after) {
      events.push({
        trigger: "control-loss",
        context: {
          phase: next.meta.phase,
          domain: channel,
        },
      });
    }
  }
  return events;
}

function hadAnyAnomalyIndicator(state: GameState): boolean {
  for (const channel of CHANNELS) {
    const track = state.containment[channel];
    if (track.stage !== "clear") return true;
    if (track.incidents > 0) return true;
  }
  return false;
}
