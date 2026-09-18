import { describe, expect, it } from "vitest";
import { effectiveDurationMs, resolveAssetMode } from "./assetPolicy";
import type { MediaInsert } from "./types";

function fixture(overrides: Partial<MediaInsert> = {}): MediaInsert {
  return {
    id: "policy.test.v1",
    trigger: "first-mutation",
    channel: "card",
    severity: "signal",
    asset: { kind: "motion", poster: "first-mutation", durationMs: 6_000 },
    copy: { label: "POLICY" },
    videoTier: "standard",
    dismissMode: "auto",
    oneShot: true,
    ...overrides,
  };
}

describe("resolveAssetMode", () => {
  it("returns static when tier is off", () => {
    const insert = fixture({ asset: { kind: "video", src: "/a.mp4", poster: "x" } });
    expect(resolveAssetMode({ insert, tier: "off", prefersReducedMotion: false })).toBe("static");
  });

  it("returns static when tier is minimal, regardless of asset kind", () => {
    const insert = fixture({
      asset: { kind: "motion", poster: "first-mutation", durationMs: 6_000 },
    });
    expect(resolveAssetMode({ insert, tier: "minimal", prefersReducedMotion: false })).toBe("static");
  });

  it("returns static for minimal tier even when a video src is provided", () => {
    const insert = fixture({
      videoTier: "minimal",
      asset: { kind: "video", src: "/a.mp4", poster: "x" },
    });
    expect(resolveAssetMode({ insert, tier: "minimal", prefersReducedMotion: false })).toBe("static");
  });

  it("returns video when host tier >= videoTier and a src is provided", () => {
    const insert = fixture({ asset: { kind: "video", src: "/a.mp4", poster: "x" } });
    expect(resolveAssetMode({ insert, tier: "standard", prefersReducedMotion: false })).toBe("video");
  });

  it("refuses video when host tier is below videoTier", () => {
    const insert = fixture({
      videoTier: "high",
      asset: { kind: "video", src: "/a.mp4", poster: "x" },
    });
    expect(resolveAssetMode({ insert, tier: "standard", prefersReducedMotion: false })).toBe("motion");
  });

  it("falls back to motion poster when there is no src", () => {
    const insert = fixture({ asset: { kind: "motion", poster: "x", durationMs: 6_000 } });
    expect(resolveAssetMode({ insert, tier: "high", prefersReducedMotion: false })).toBe("motion");
  });

  it("downgrades to static under reduced motion, regardless of tier", () => {
    const insert = fixture({
      asset: { kind: "motion", poster: "x", durationMs: 6_000 },
    });
    expect(resolveAssetMode({ insert, tier: "high", prefersReducedMotion: true })).toBe("static");
  });

  it("respects asset.kind = static", () => {
    const insert = fixture({ asset: { kind: "static", poster: "x" } });
    expect(resolveAssetMode({ insert, tier: "high", prefersReducedMotion: false })).toBe("static");
  });
});

describe("effectiveDurationMs", () => {
  it("caps static duration at 4s", () => {
    const insert = fixture({ asset: { kind: "static", poster: "x", durationMs: 9_000 } });
    expect(effectiveDurationMs(insert, "static")).toBe(4_000);
  });

  it("returns explicit duration for motion", () => {
    const insert = fixture({ asset: { kind: "motion", poster: "x", durationMs: 6_500 } });
    expect(effectiveDurationMs(insert, "motion")).toBe(6_500);
  });

  it("returns explicit duration for video", () => {
    const insert = fixture({ asset: { kind: "video", src: "/a.mp4", poster: "x", durationMs: 7_500 } });
    expect(effectiveDurationMs(insert, "video")).toBe(7_500);
  });

  it("uses 6s default when no explicit duration is provided", () => {
    const insert = fixture({ asset: { kind: "motion", poster: "x" } });
    expect(effectiveDurationMs(insert, "motion")).toBe(6_000);
  });

  it("uses 3s default for static when no explicit duration", () => {
    const insert = fixture({ asset: { kind: "static", poster: "x" } });
    expect(effectiveDurationMs(insert, "static")).toBe(3_000);
  });
});
