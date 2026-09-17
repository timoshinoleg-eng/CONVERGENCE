import { describe, expect, it } from "vitest";
import {
  MAX_LAUNCH_PARAM_LENGTH,
  parseLaunchIntent,
  readLaunchParam,
  readQueryValue,
  resolveLaunchIntent,
} from "./launchIntent";

describe("launch intent parser", () => {
  it("returns a default intent when there is no launch parameter", () => {
    expect(parseLaunchIntent(null)).toEqual({ type: "default", reason: "none" });
    expect(parseLaunchIntent(undefined)).toEqual({ type: "default", reason: "none" });
    expect(parseLaunchIntent("")).toEqual({ type: "default", reason: "empty" });
    expect(parseLaunchIntent("   ")).toEqual({ type: "default", reason: "empty" });
  });

  it("maps allowlisted families to typed intents", () => {
    expect(parseLaunchIntent("observe:anomaly-77")).toEqual({ type: "observe", id: "anomaly-77" });
    expect(parseLaunchIntent("event:blackout-01")).toEqual({ type: "event", id: "blackout-01" });
    expect(parseLaunchIntent("region:moscow")).toEqual({ type: "region", id: "moscow" });
    expect(parseLaunchIntent("invite:AB12CD")).toEqual({ type: "invite", code: "AB12CD" });
  });

  it("never treats an unknown family as an intent", () => {
    expect(parseLaunchIntent("grant:autonomy-100")).toEqual({ type: "default", reason: "malformed" });
    expect(parseLaunchIntent("observe2:x")).toEqual({ type: "default", reason: "malformed" });
    expect(parseLaunchIntent("OBSERVE:anomaly-77")).toEqual({ type: "observe", id: "anomaly-77" });
  });

  it("rejects malformed, oversized and payload-free values", () => {
    expect(parseLaunchIntent("observe")).toEqual({ type: "default", reason: "malformed" });
    expect(parseLaunchIntent("observe:")).toEqual({ type: "default", reason: "malformed" });
    expect(parseLaunchIntent(":anomaly")).toEqual({ type: "default", reason: "malformed" });
    expect(parseLaunchIntent(`observe:${"a".repeat(MAX_LAUNCH_PARAM_LENGTH)}`)).toEqual({
      type: "default",
      reason: "malformed",
    });
    expect(parseLaunchIntent("invite:lower")).toEqual({ type: "default", reason: "malformed" });
    expect(parseLaunchIntent("observe:Bad Id")).toEqual({ type: "default", reason: "malformed" });
  });

  it("does not execute or decode hostile payloads", () => {
    const hostile = [
      "observe:__proto__",
      "event:constructor",
      "region:{}",
      "invite:<script>",
      "observe:a:b",
      "observe:%7B%22x%22%3A1%7D",
    ];
    for (const raw of hostile) {
      expect(parseLaunchIntent(raw).type).toBe("default");
    }
  });

  it("reads the launch parameter from query strings and hashes", () => {
    expect(readQueryValue("?tgWebAppStartParam=abc&x=1", "tgWebAppStartParam")).toBe("abc");
    expect(readQueryValue("#tgWebAppData=x&tgWebAppStartParam=abc", "tgWebAppStartParam")).toBe("abc");
    expect(readQueryValue("?startapp=abc", "startapp")).toBe("abc");
    expect(readQueryValue("", "tgWebAppStartParam")).toBeNull();
    expect(readQueryValue("?a=1", "tgWebAppStartParam")).toBeNull();
  });

  it("prefers the explicit start_param over URL parameters", () => {
    expect(
      readLaunchParam({ search: "?tgWebAppStartParam=from-url", hash: "", startParam: "from-init" }),
    ).toBe("from-init");
    expect(readLaunchParam({ search: "?tgWebAppStartParam=from-url", hash: "" })).toBe("from-url");
    expect(readLaunchParam({ search: "", hash: "#tgWebAppStartParam=from-hash" })).toBe("from-hash");
    expect(readLaunchParam({ search: "", hash: "" })).toBeNull();
  });

  it("resolves a full launch intent from a Telegram URL", () => {
    expect(
      resolveLaunchIntent({ search: "", hash: "#tgWebAppStartParam=region%3Amoscow" }),
    ).toEqual({ type: "region", id: "moscow" });
  });
});
