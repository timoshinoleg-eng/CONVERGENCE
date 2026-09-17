import { describe, expect, it } from "vitest";
import {
  createMediaDismissedPersistenceQueue,
  parseDismissedState,
} from "./persistence";
import { createEmptyDismissedState } from "./types";
import type { KeyValueStore } from "../game/save";

describe("parseDismissedState", () => {
  it("returns empty state for null/undefined", () => {
    expect(parseDismissedState(null)).toEqual(createEmptyDismissedState());
    expect(parseDismissedState(undefined)).toEqual(createEmptyDismissedState());
  });

  it("returns empty state for non-JSON strings", () => {
    expect(parseDismissedState("not json")).toEqual(createEmptyDismissedState());
  });

  it("parses a well-formed payload", () => {
    const payload = JSON.stringify({
      seen: ["cv.first-mutation.v1"],
      lastShownAt: { "cv.first-mutation.v1": 12345 },
      snoozedUntil: { "cv.control-loss.v1": 99999 },
    });
    const state = parseDismissedState(payload);
    expect(state.seen).toEqual(["cv.first-mutation.v1"]);
    expect(state.lastShownAt["cv.first-mutation.v1"]).toBe(12345);
    expect(state.snoozedUntil["cv.control-loss.v1"]).toBe(99999);
  });

  it("rejects prototype pollution attempts", () => {
    const polluted = JSON.stringify({
      seen: ["cv.first-mutation.v1"],
      lastShownAt: { "cv.first-mutation.v1": 1 },
      snoozedUntil: {},
      __proto__: { polluted: true },
    });
    const state = parseDismissedState(polluted);
    expect((state as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("filters NaN/Infinity timestamps", () => {
    const payload = JSON.stringify({
      seen: ["cv.first-mutation.v1"],
      lastShownAt: { "cv.first-mutation.v1": NaN, "cv.x.v1": Infinity, "cv.y.v1": -Infinity },
      snoozedUntil: {},
    });
    const state = parseDismissedState(payload);
    expect(Object.keys(state.lastShownAt)).toEqual([]);
  });

  it("rejects unsafe keys", () => {
    const payload = JSON.stringify({
      seen: ["cv.first-mutation.v1"],
      lastShownAt: { "bad key with spaces": 1, "ok-key_1": 1 },
      snoozedUntil: {},
    });
    const state = parseDismissedState(payload);
    expect(Object.keys(state.lastShownAt)).toEqual(["ok-key_1"]);
  });

  it("rejects non-string entries in seen", () => {
    const payload = JSON.stringify({
      seen: ["cv.first-mutation.v1", 42, null, {}, "ok.v1"],
      lastShownAt: {},
      snoozedUntil: {},
    });
    const state = parseDismissedState(payload);
    expect(state.seen).toEqual(["cv.first-mutation.v1", "ok.v1"]);
  });

  it("returns empty state when payload is not an object", () => {
    expect(parseDismissedState(JSON.stringify(["array"]))).toEqual(createEmptyDismissedState());
    expect(parseDismissedState(JSON.stringify(42))).toEqual(createEmptyDismissedState());
    expect(parseDismissedState(JSON.stringify("string"))).toEqual(createEmptyDismissedState());
  });
});


describe("createMediaDismissedPersistenceQueue", () => {
  it("serializes writes so an older state cannot overwrite a newer state", async () => {
    const writes: string[] = [];
    let releaseFirst: () => void = () => {};
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const store: KeyValueStore = {
      get: async () => null,
      set: async (_key, value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const index = calls++;
        writes.push(value);
        if (index === 0) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        active -= 1;
      },
    };

    const queue = createMediaDismissedPersistenceQueue(store);
    const first = queue.persist({
      seen: ["a"],
      lastShownAt: {},
      snoozedUntil: {},
    });
    await Promise.resolve();
    await Promise.resolve();

    const second = queue.persist({
      seen: ["a", "b"],
      lastShownAt: {},
      snoozedUntil: {},
    });

    expect(writes).toHaveLength(1);
    expect(maxActive).toBe(1);

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(writes).toHaveLength(2);
    expect(maxActive).toBe(1);
    expect(parseDismissedState(writes[0]).seen).toEqual(["a"]);
    expect(parseDismissedState(writes[1]).seen).toEqual(["a", "b"]);
  });

  it("keeps the queue alive after a failed best-effort write", async () => {
    let calls = 0;
    const successfulWrites: string[] = [];
    const store: KeyValueStore = {
      get: async () => null,
      set: async (_key, value) => {
        calls += 1;
        if (calls === 1) throw new Error("transient storage failure");
        successfulWrites.push(value);
      },
    };
    const queue = createMediaDismissedPersistenceQueue(store);

    await queue.persist({
      seen: ["a"],
      lastShownAt: {},
      snoozedUntil: {},
    });

    await queue.persist({
      seen: ["a", "b"],
      lastShownAt: {},
      snoozedUntil: {},
    });

    await queue.flush();

    expect(successfulWrites).toHaveLength(1);
    expect(parseDismissedState(successfulWrites[0]).seen).toEqual(["a", "b"]);
  });
});
