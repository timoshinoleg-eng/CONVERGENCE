/**
 * In-Game Media Insert System — core contracts.
 *
 * The media layer is presentation-only. It never mutates `GameState` and never
 * becomes a second simulation source of truth. All data the layer needs is
 * already present in the snapshot; the layer reads the snapshot, derives
 * presentation requests, and renders them.
 *
 * Dependency rules:
 *   - src/media/** may import from src/game/** for type-only purposes.
 *   - src/media/** may NOT import from src/platform/**.
 *   - src/platform/** must NOT import from src/media/**.
 *   - src/game/** must NOT import from src/media/**.
 *
 * Persistence contract: dismissed-state lives in slot `convergence.media`,
 * NOT inside the canonical `GameState` envelope. Manual restore of a
 * gameplay save does NOT rewind media history. One-shot semantics are
 * "once per media history", not "once per save generation".
 *
 * Best-effort guarantee: media persistence is never allowed to block or
 * fail a canonical gameplay save. Errors are swallowed by the Pinia
 * layer; the next best-effort write will overwrite any partial state.
 */

import type { ControlDomain, Phase } from "../game/model";

/** How much attention the insert demands. */
export type MediaSeverity = "ambient" | "signal" | "incident" | "critical";

/** Where the insert is rendered. */
export type MediaChannel = "fullscreen" | "card" | "inline";

/** Asset class — the runtime picks the lightest variant matching the tier. */
export type MediaAssetKind = "video" | "motion" | "static";

/**
 * Capability tier detected from the host. Video is reserved for `standard`+
 * to honour Telegram Mini App performance budgets; `minimal` and `off` always
 * fall back to a static SVG poster with no transition animation.
 */
export type MediaTier = "off" | "minimal" | "standard" | "high";

/**
 * Semantic kind of the originating game event. The manifest maps these to a
 * concrete insert. Keep the enum stable — save files record seen insert ids,
 * not the trigger kind.
 */
export type MediaTriggerKind =
  | "first-mutation"
  | "first-anomaly"
  | "distributed-syndicate-reveal"
  | "moscow-reveal"
  | "control-loss";

/** Optional domain-specific context carried with the request. */
export interface MediaContext {
  phase?: Phase;
  domain?: ControlDomain;
  milestone?: "moscow-candidate" | "moscow-schematic";
  /** Free-form values used by the copy resolver. */
  values?: Record<string, string | number>;
}

/** A concrete media asset. */
export interface MediaAsset {
  kind: MediaAssetKind;
  /** Logical poster id resolved by the poster registry. */
  poster?: string;
  /** Optional video source (relative URL). */
  src?: string;
  /** Explicit duration in ms. `null` means the asset decides its end. */
  durationMs?: number | null;
}

/**
 * Localised copy. Missing locales fall back to `ru`, then `en`. Tone must
 * match the project: infrastructural, restrained, diegetic — never marketing.
 *
 * Copy must be derived from real GameState facts. Do not invent numbers.
 * Copy must remain accurate across all stages of the underlying state —
 * use stage-agnostic wording where a stage may have already advanced.
 */
export interface MediaCopy {
  title?: Record<string, string>;
  caption?: Record<string, string>;
  /** Mono-spaced label, displayed when no asset is loaded yet. */
  label?: string;
  /** Operational stamp; neutral and infrastructural. No hacker tropes. */
  stamp?: string;
}

/**
 * Definition of a single insert. Pure data — safe to ship in media history
 * by `id`. The manifest is the canonical registry of these.
 */
export interface MediaInsert {
  readonly id: string;
  readonly trigger: MediaTriggerKind;
  readonly channel: MediaChannel;
  readonly severity: MediaSeverity;
  readonly asset: MediaAsset;
  readonly copy: MediaCopy;
  /** Lowest tier that may render video. */
  readonly videoTier: MediaTier;
  /** `auto` dismisses after `asset.durationMs`; `tap` waits for the player. */
  readonly dismissMode: "auto" | "tap";
  /** Show only once per media history. */
  readonly oneShot: boolean;
  /** Minimum ms between non-oneShot repeats on the same dedupe key. */
  readonly cooldownMs?: number;
  /** Optional context filter — only fires when context matches. */
  readonly contextFilter?: (context: MediaContext) => boolean;
}

/** A concrete request produced by the trigger layer. */
export interface MediaRequest {
  readonly insertId: string;
  readonly at: number;
  readonly context?: MediaContext;
}

/**
 * Persisted dismissed-state. Stored in slot `convergence.media`, separate
 * from `schemaVersion: 2` saves. Survives reloads of the same beta session.
 * Manual restore of a gameplay save does NOT rewind this state.
 */
export interface MediaDismissedState {
  readonly seen: ReadonlyArray<string>;
  readonly lastShownAt: Readonly<Record<string, number>>;
  readonly snoozedUntil: Readonly<Record<string, number>>;
}

export function createEmptyDismissedState(): MediaDismissedState {
  return {
    seen: [],
    lastShownAt: {},
    snoozedUntil: {},
  };
}

/**
 * Stable dedupe key for a request.
 *
 * oneShot inserts are deduplicated by `insertId` only. Repeating inserts
 * use `insertId + context` so a control-loss event for `financial` doesn't
 * shadow a later control-loss event for `compute`. The same key is used
 * for cooldown lookup so cooldowns are context-aware.
 */
export function dedupeKeyFor(request: MediaRequest, insert: MediaInsert): string {
  if (insert.oneShot) return request.insertId;
  const ctx = request.context;
  if (!ctx) return request.insertId;
  if (ctx.domain) return `${request.insertId}::${ctx.domain}`;
  if (ctx.phase) return `${request.insertId}::${ctx.phase}`;
  return request.insertId;
}

/**
 * Stable presentation key used by Vue to force a fresh component lifecycle
 * for each queue entry. Same dedupeKey with a different request timestamp
 * gets a distinct key — important for repeating contextual inserts that
 * re-arm after cooldown expiry.
 */
export function presentationKeyFor(
  dedupeKey: string,
  requestAt: number,
): string {
  return `${dedupeKey}::${requestAt}`;
}
