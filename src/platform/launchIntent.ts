/**
 * Telegram launch parameter -> typed launch intent.
 *
 * SECURITY / DESIGN CONTRACT
 *
 *  - Input is treated as completely untrusted. It is never executed, never
 *    JSON-decoded, never used as an object key path and never handed to any
 *    state mutation path. The only output is a small closed union.
 *  - A launch intent is an *extension point* for future mechanics
 *    (observer link, shared anomaly, event invite, region launch). It carries
 *    no reward, no economy effect and no identity claim.
 *  - Any input that is not explicitly allowlisted degrades to
 *    `{ type: "default" }`. Unknown is never rejected loudly, because a bad
 *    link must still boot the game.
 */

import type { LaunchIntent } from "./types";

/** Hard cap so a hostile link cannot push a megabyte through the parser. */
export const MAX_LAUNCH_PARAM_LENGTH = 64;

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const CODE_PATTERN = /^[A-Z0-9]{4,24}$/;

/**
 * Values that are harmless as strings but dangerous the moment some future
 * feature uses an id as an object key. Rejected up front so downstream code
 * never has to remember this.
 */
const RESERVED_VALUES = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Closed allowlist. Adding a mechanics family means adding one entry here and
 * one variant in `LaunchIntent`; nothing else in the app needs to change.
 */
const INTENT_TYPES = {
  observe: ID_PATTERN,
  event: ID_PATTERN,
  region: ID_PATTERN,
  invite: CODE_PATTERN,
} as const;

type IntentType = keyof typeof INTENT_TYPES;

function isIntentType(value: string): value is IntentType {
  return Object.prototype.hasOwnProperty.call(INTENT_TYPES, value);
}

/**
 * Pure parser. Returns `default` for `null`, empty, oversized, malformed or
 * unknown input. Never throws.
 */
export function parseLaunchIntent(raw: string | null | undefined): LaunchIntent {
  if (typeof raw !== "string") return { type: "default", reason: "none" };

  const trimmed = raw.trim();
  if (trimmed.length === 0) return { type: "default", reason: "empty" };
  if (trimmed.length > MAX_LAUNCH_PARAM_LENGTH) return { type: "default", reason: "malformed" };

  // Only the first separator is structural; a value may not contain one.
  const separator = trimmed.indexOf(":");
  if (separator <= 0 || separator === trimmed.length - 1) {
    // A bare token without a payload carries no actionable intent.
    return { type: "default", reason: "malformed" };
  }

  const type = trimmed.slice(0, separator).toLowerCase();
  const value = trimmed.slice(separator + 1);

  if (!isIntentType(type)) return { type: "default", reason: "malformed" };
  if (RESERVED_VALUES.has(value)) return { type: "default", reason: "malformed" };
  if (!INTENT_TYPES[type].test(value)) return { type: "default", reason: "malformed" };

  switch (type) {
    case "observe":
      return { type: "observe", id: value };
    case "event":
      return { type: "event", id: value };
    case "region":
      return { type: "region", id: value };
    case "invite":
      return { type: "invite", code: value };
  }
}

/**
 * Reads one query value from a `?a=b&c=d` or `#a=b&c=d` fragment without
 * requiring `URLSearchParams` (keeps the parser usable in any JS host).
 */
export function readQueryValue(source: string, key: string): string | null {
  if (typeof source !== "string" || source.length === 0) return null;
  const body = source.startsWith("?") || source.startsWith("#") ? source.slice(1) : source;
  for (const pair of body.split("&")) {
    if (pair.length === 0) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    const rawValue = eq < 0 ? "" : pair.slice(eq + 1);
    if (rawKey !== key) continue;
    try {
      return decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Telegram exposes the same value in up to three places:
 * `WebApp.initDataUnsafe.start_param`, the `tgWebAppStartParam` query/hash key
 * injected into the Mini App URL, and the original `startapp` link parameter.
 * All three are equally untrusted client input; the first one found wins.
 */
export function readLaunchParam(host: {
  readonly search: string;
  readonly hash: string;
  readonly startParam?: string | null;
}): string | null {
  const candidates = [
    host.startParam,
    readQueryValue(host.search, "tgWebAppStartParam"),
    readQueryValue(host.hash, "tgWebAppStartParam"),
    readQueryValue(host.search, "startapp"),
    readQueryValue(host.hash, "startapp"),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

export function resolveLaunchIntent(host: {
  readonly search: string;
  readonly hash: string;
  readonly startParam?: string | null;
}): LaunchIntent {
  return parseLaunchIntent(readLaunchParam(host));
}
