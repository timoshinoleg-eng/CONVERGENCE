/**
 * Capability detection — chooses the right media tier for the host.
 *
 * Goals:
 *  - never ship heavy video to a weak device or a metered connection
 *  - honour the user's `prefers-reduced-motion` setting (presentation hint)
 *  - respect an explicit user override persisted in storage
 *  - prefer conservative degradation when the Telegram WebApp version is
 *    unknown or below the supported baseline (treat as `minimal`, not
 *    `standard` — failing safe beats failing flashy).
 *  - keep the detection rule pure and unit-testable
 */

import type { MediaTier } from "./types";

export interface MediaCapabilityInput {
  /** Effective connection type if exposed (`4g`, `3g`, `2g`, `slow-2g`). */
  effectiveType?: string;
  /** navigator.deviceMemory in GB. */
  deviceMemoryGb?: number;
  /** navigator.hardwareConcurrency. */
  hardwareConcurrency?: number;
  /** Reduced-motion media query match. */
  prefersReducedMotion?: boolean;
  /** Save-data header if exposed. */
  saveData?: boolean;
  /** Override from local user preference; `null` means "follow detection". */
  userOverride?: MediaTier | null;
  /** Telegram WebApp version (e.g. "7.0"); null on other runtimes. */
  telegramVersion?: string | null;
  /** Resolved runtime platform. */
  platform?: "telegram" | "browser" | "capacitor";
}

const TELEGRAM_SUPPORTED_VERSION = "7.0";

/**
 * Resolve the tier the runtime should use. The function is intentionally
 * side-effect free — the caller is responsible for collecting the inputs.
 *
 * Telegram hosts whose version is unknown or below `7.0` always degrade to
 * `minimal`. Inline video playback is unreliable in older WebViews; the
 * conservative read is the correct read.
 */
export function resolveMediaTier(input: MediaCapabilityInput): MediaTier {
  if (input.userOverride) return input.userOverride;

  if (input.platform === "telegram") {
    if (!input.telegramVersion) return "minimal";
    if (compareVersion(input.telegramVersion, TELEGRAM_SUPPORTED_VERSION) < 0) {
      return "minimal";
    }
  }

  if (input.prefersReducedMotion) return "minimal";
  if (input.saveData) return "minimal";
  if (input.effectiveType === "slow-2g" || input.effectiveType === "2g") {
    return "minimal";
  }
  if (typeof input.deviceMemoryGb === "number" && input.deviceMemoryGb <= 1) {
    return "minimal";
  }
  if (typeof input.hardwareConcurrency === "number" && input.hardwareConcurrency <= 1) {
    return "minimal";
  }

  if (input.effectiveType === "3g") return "standard";

  return "high";
}

/** Parse `navigator`-like globals into a `MediaCapabilityInput`. */
export function readNavigatorCapability(
  host: {
    navigator?: {
      connection?: {
        effectiveType?: string;
        saveData?: boolean;
      };
      deviceMemory?: number;
      hardwareConcurrency?: number;
    };
    matchMedia?: (query: string) => { matches: boolean };
  },
  options: {
    platform?: "telegram" | "browser" | "capacitor";
    telegramVersion?: string | null;
    userOverride?: MediaTier | null;
  } = {},
): MediaCapabilityInput {
  return {
    effectiveType: host.navigator?.connection?.effectiveType,
    saveData: host.navigator?.connection?.saveData,
    deviceMemoryGb: host.navigator?.deviceMemory,
    hardwareConcurrency: host.navigator?.hardwareConcurrency,
    prefersReducedMotion: host.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches,
    userOverride: options.userOverride ?? null,
    telegramVersion: options.telegramVersion ?? null,
    platform: options.platform ?? "browser",
  };
}

/** Compare dotted versions; returns negative / 0 / positive. */
export function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Numeric rank used by policy comparisons. */
export function rankTier(tier: MediaTier): number {
  switch (tier) {
    case "off":
      return 0;
    case "minimal":
      return 1;
    case "standard":
      return 2;
    case "high":
      return 3;
  }
}
