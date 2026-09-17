import { describe, expect, it } from "vitest";
import {
  compareVersion,
  rankTier,
  readNavigatorCapability,
  resolveMediaTier,
} from "./capability";

describe("resolveMediaTier", () => {
  it("respects an explicit user override", () => {
    expect(resolveMediaTier({ userOverride: "off" })).toBe("off");
    expect(resolveMediaTier({ userOverride: "high" })).toBe("high");
  });

  it("clamps unknown Telegram version to minimal (safe default)", () => {
    expect(
      resolveMediaTier({
        platform: "telegram",
        telegramVersion: undefined,
        hardwareConcurrency: 8,
        deviceMemoryGb: 8,
      }),
    ).toBe("minimal");
  });

  it("clamps Telegram below 7.0 to minimal", () => {
    expect(
      resolveMediaTier({
        platform: "telegram",
        telegramVersion: "6.9",
        hardwareConcurrency: 8,
        deviceMemoryGb: 8,
      }),
    ).toBe("minimal");
  });

  it("allows Telegram 7.0+ to reach standard/high when the host is capable", () => {
    expect(
      resolveMediaTier({
        platform: "telegram",
        telegramVersion: "7.0",
        effectiveType: "4g",
        deviceMemoryGb: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe("high");
  });

  it("forces minimal under save-data or slow networks", () => {
    expect(resolveMediaTier({ saveData: true })).toBe("minimal");
    expect(resolveMediaTier({ effectiveType: "2g" })).toBe("minimal");
    expect(resolveMediaTier({ effectiveType: "slow-2g" })).toBe("minimal");
  });

  it("forces minimal on extremely weak devices", () => {
    expect(resolveMediaTier({ deviceMemoryGb: 1 })).toBe("minimal");
    expect(resolveMediaTier({ hardwareConcurrency: 1 })).toBe("minimal");
  });

  it("drops to standard on 3g networks", () => {
    expect(resolveMediaTier({ effectiveType: "3g" })).toBe("standard");
  });

  it("returns high for capable hosts", () => {
    expect(
      resolveMediaTier({
        effectiveType: "4g",
        deviceMemoryGb: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe("high");
  });
});

describe("compareVersion", () => {
  it("orders dotted versions numerically", () => {
    expect(compareVersion("7.0", "7.0")).toBe(0);
    expect(compareVersion("6.9", "7.0")).toBeLessThan(0);
    expect(compareVersion("7.0.1", "7.0")).toBeGreaterThan(0);
    expect(compareVersion("7.10", "7.2")).toBeGreaterThan(0);
    expect(compareVersion("6", "6.0.1")).toBeLessThan(0);
  });
});

describe("rankTier", () => {
  it("orders the four tiers", () => {
    expect(rankTier("off")).toBe(0);
    expect(rankTier("minimal")).toBe(1);
    expect(rankTier("standard")).toBe(2);
    expect(rankTier("high")).toBe(3);
  });
});

describe("readNavigatorCapability", () => {
  it("collects all relevant navigator fields", () => {
    const input = readNavigatorCapability(
      {
        navigator: {
          connection: { effectiveType: "3g", saveData: true },
          deviceMemory: 4,
          hardwareConcurrency: 4,
        },
        matchMedia: (q) => ({ matches: q.includes("reduce") }),
      },
      { platform: "telegram", telegramVersion: "7.5" },
    );

    expect(input.effectiveType).toBe("3g");
    expect(input.saveData).toBe(true);
    expect(input.deviceMemoryGb).toBe(4);
    expect(input.hardwareConcurrency).toBe(4);
    expect(input.prefersReducedMotion).toBe(true);
    expect(input.platform).toBe("telegram");
    expect(input.telegramVersion).toBe("7.5");
  });
});
