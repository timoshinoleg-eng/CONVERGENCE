/**
 * Single source of truth for media selection.
 *
 * Every presentation component — fullscreen, card, inline — asks this helper
 * which asset variant to render. Keeping the policy centralised avoids
 * drift between components and makes it unit-testable in isolation.
 *
 * Policy (in order):
 *   1. tier === "off"             → static
 *   2. tier === "minimal"         → static (no motion, no video)
 *   3. prefers-reduced-motion     → static (the event itself is preserved;
 *                                    presentation only switches asset class)
 *   4. tier meets videoTier AND src exists → video
 *   5. poster present             → motion
 *   6. otherwise                  → static
 */

import type { MediaInsert, MediaTier } from "./types";
import { rankTier } from "./capability";

export type AssetMode = "video" | "motion" | "static";

export interface ResolveAssetInput {
  readonly insert: MediaInsert;
  readonly tier: MediaTier;
  readonly prefersReducedMotion: boolean;
}

export function resolveAssetMode(input: ResolveAssetInput): AssetMode {
  const { insert, tier, prefersReducedMotion } = input;

  if (tier === "off" || tier === "minimal") return "static";
  if (prefersReducedMotion) return "static";

  const hasVideo = Boolean(insert.asset.src);
  if (hasVideo && rankTier(tier) >= rankTier(insert.videoTier)) {
    return "video";
  }

  if (insert.asset.kind === "static" || !insert.asset.poster) return "static";

  return "motion";
}

/**
 * Compute the effective duration for an insert given the chosen mode.
 *
 * For `static` mode under reduced motion, the insert is short enough to feel
 * like a glance, not a hold. The host UI may still allow tap-to-dismiss.
 */
export function effectiveDurationMs(insert: MediaInsert, mode: AssetMode): number {
  if (mode === "static") {
    const explicit = insert.asset.durationMs;
    if (typeof explicit === "number") return Math.min(explicit, 4_000);
    return 3_000;
  }
  const explicit = insert.asset.durationMs;
  if (typeof explicit === "number") return explicit;
  return 6_000;
}
