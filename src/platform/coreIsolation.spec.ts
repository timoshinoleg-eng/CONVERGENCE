/**
 * Architectural guard: the game core must stay host-agnostic.
 *
 * A failure here means platform-specific code leaked into simulation,
 * economy, narrative or persistence - which would make the Telegram Mini App,
 * the browser and the APK drift apart and would break deterministic testing.
 */

import { describe, expect, it } from "vitest";

const rawSources = import.meta.glob("../game/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const coreFiles = Object.entries(rawSources)
  .filter(([path]) => !path.endsWith(".spec.ts"))
  .map(([path, source]) => ({ path, source }));

const FORBIDDEN_IMPORTS = [
  /from\s+["']\.\.\/platform/,
  /from\s+["'].*\/platform\//,
  /from\s+["']@capacitor\//,
  /from\s+["']@tma\.js\//,
  /from\s+["']@telegram-apps\//,
];

const FORBIDDEN_GLOBALS = [/\bwindow\./, /\bdocument\./, /\bTelegram\b/, /\bnavigator\./];

describe("game core isolation", () => {
  it("finds the core files it is supposed to check", () => {
    expect(coreFiles.length).toBeGreaterThan(8);
  });

  it("never imports a platform module or a host SDK", () => {
    const offenders: string[] = [];
    for (const file of coreFiles) {
      for (const pattern of FORBIDDEN_IMPORTS) {
        if (pattern.test(file.source)) offenders.push(`${file.path} :: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never touches browser or Telegram globals", () => {
    const offenders: string[] = [];
    for (const file of coreFiles) {
      for (const pattern of FORBIDDEN_GLOBALS) {
        if (pattern.test(file.source)) offenders.push(`${file.path} :: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the storage contract as the only persistence seam", () => {
    const save = coreFiles.find((file) => file.path.endsWith("/game/save.ts"));
    expect(save).toBeDefined();
    expect(save!.source).toContain("interface KeyValueStore");
    expect(save!.source).not.toContain("@capacitor/preferences");
  });
});
