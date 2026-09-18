/**
 * Milestone reconciliation.
 *
 * On startup, after a manual restore, or after an offline catch-up, the
 * queue is empty and the snapshot diff will not re-emit events the player
 * already passed through. If the player closed the Telegram WebView before
 * dismissing the corresponding insert, the one-shot beat would be lost.
 *
 * This module derives "unseen achieved milestones" from the *current*
 * snapshot. The caller passes the dismissed state so the result only
 * contains beats the player has not actually seen. The runtime then
 * enqueues them; the manifest's `oneShot` and `cooldownMs` rules take over
 * from there.
 *
 * The reconciliation only emits one-shot milestones — repeating inserts
 * (control-loss) are intentionally excluded. Showing a critical card on
 * every startup just because `controlLoss.financial === true` would be
 * hostile to the player.
 */

import type { GameState } from "../game/model";
import type { MediaContext, MediaRequest, MediaDismissedState } from "./types";
import { defaultResolveInsert } from "./manifest";
import { insertIdFor } from "./triggers";

const CHANNELS = ["financial", "compute", "energy", "logistics", "public"] as const;

interface MilestoneSource {
  readonly trigger: "first-mutation" | "first-anomaly" | "distributed-syndicate-reveal" | "moscow-reveal";
  readonly context: MediaContext;
}

function sourcesFor(state: GameState): ReadonlyArray<MilestoneSource> {
  const sources: MilestoneSource[] = [];

  if (state.narrative.lastChoice) {
    sources.push({
      trigger: "first-mutation",
      context: { phase: state.meta.phase },
    });
  }

  if (state.meta.phase !== "client-terminal") {
    sources.push({
      trigger: "distributed-syndicate-reveal",
      context: {
        phase: state.meta.phase,
        values: { to: state.meta.phase },
      },
    });
  }

  if (
    state.narrative.episode === "moscow-candidate-01"
    || state.narrative.episode === "moscow-schematic-01"
  ) {
    sources.push({
      trigger: "moscow-reveal",
      context: {
        phase: state.meta.phase,
        milestone: state.narrative.episode === "moscow-schematic-01"
          ? "moscow-schematic"
          : "moscow-candidate",
      },
    });
  }

  for (const channel of CHANNELS) {
    const track = state.containment[channel];
    // Either a non-clear stage OR a recorded incident counts as an
    // anomaly that has already happened. Stages can revert to `clear`
    // after the fact; `incidents > 0` is the durable signal.
    if (track.stage !== "clear" || track.incidents > 0) {
      sources.push({
        trigger: "first-anomaly",
        context: {
          phase: state.meta.phase,
          domain: channel,
        },
      });
      break; // one anomaly insert per session; further domains are ambient
    }
  }

  return sources;
}

/**
 * Return `MediaRequest`s for milestones the snapshot has already crossed but
 * the dismissed state hasn't recorded yet.
 */
export function deriveUnseenMilestoneRequests(
  state: GameState,
  dismissed: MediaDismissedState,
  at: number,
): ReadonlyArray<MediaRequest> {
  const requests: MediaRequest[] = [];
  const seen = new Set(dismissed.seen);
  for (const source of sourcesFor(state)) {
    const id = insertIdFor(source.trigger);
    if (!id) continue;
    if (!defaultResolveInsert(id)) continue;
    if (seen.has(id)) continue;
    requests.push({
      insertId: id,
      at,
      context: source.context,
    });
  }
  return requests;
}
