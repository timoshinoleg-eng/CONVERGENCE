/**
 * Localised copy lookup.
 *
 * Resolution order: requested locale → `ru` → `en` → first available.
 * Empty strings are treated as missing. The lookup is intentionally
 * synchronous — the manifest is small and copy is bundled.
 */

import type { MediaCopy } from "./types";

export type MediaLocale = "ru" | "en" | "zh";

const FALLBACK_CHAIN: ReadonlyArray<MediaLocale> = ["ru", "en"];

/**
 * Accept the canonical three locales plus any BCP-47 spelling so that
 * `ru-RU`, `ru-KZ`, `en-US`, `en-GB`, `zh-CN`, `zh-Hans`, `zh-Hans-CN`,
 * `zh-TW` all map to their primary subtag. The primary subtag is the
 * first dash-separated segment per RFC 5646.
 */
export function pickLocale(
  candidates: ReadonlyArray<string | undefined>,
): MediaLocale {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const primary = candidate.toLowerCase().split(/[-_]/)[0] ?? "";
    if (primary === "ru") return "ru";
    if (primary === "en") return "en";
    if (primary === "zh") return "zh";
  }
  return "en";
}

export function lookupCopy(
  copy: MediaCopy | undefined,
  locale: MediaLocale,
  field: "title" | "caption",
): string | undefined {
  if (!copy) return undefined;
  const dict = copy[field];
  if (!dict) return undefined;
  const value = dict[locale];
  if (value && value.length > 0) return value;
  for (const fallback of FALLBACK_CHAIN) {
    if (fallback === locale) continue;
    const v = dict[fallback];
    if (v && v.length > 0) return v;
  }
  for (const value of Object.values(dict)) {
    if (value && value.length > 0) return value;
  }
  return undefined;
}

export function resolveHeadline(
  copy: MediaCopy | undefined,
  locale: MediaLocale,
): string | undefined {
  return (
    lookupCopy(copy, locale, "title")
    ?? lookupCopy(copy, locale, "caption")
    ?? copy?.label
  );
}
