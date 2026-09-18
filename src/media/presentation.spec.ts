import { describe, expect, it } from "vitest";
import {
  dedupeKeyFor,
  presentationKeyFor,
  type MediaInsert,
  type MediaRequest,
} from "./types";

const ONE_SHOT: MediaInsert = {
  id: "cv.first-mutation.v1",
  trigger: "first-mutation",
  channel: "fullscreen",
  severity: "signal",
  asset: { kind: "motion", poster: "x" },
  copy: { label: "X" },
  videoTier: "standard",
  dismissMode: "auto",
  oneShot: true,
};

const REPEATING: MediaInsert = {
  id: "cv.control-loss.v1",
  trigger: "control-loss",
  channel: "card",
  severity: "critical",
  asset: { kind: "motion", poster: "x" },
  copy: { label: "X" },
  videoTier: "standard",
  dismissMode: "tap",
  oneShot: false,
  cooldownMs: 240_000,
  contextFilter: (ctx) => Boolean(ctx.domain),
};

describe("dedupeKeyFor", () => {
  it("uses insertId alone for oneShot inserts", () => {
    const req: MediaRequest = { insertId: ONE_SHOT.id, at: 1000 };
    expect(dedupeKeyFor(req, ONE_SHOT)).toBe(ONE_SHOT.id);
  });

  it("includes domain in the key for repeating context-sensitive inserts", () => {
    const req: MediaRequest = {
      insertId: REPEATING.id,
      at: 1000,
      context: { domain: "financial" },
    };
    expect(dedupeKeyFor(req, REPEATING)).toBe(`${REPEATING.id}::financial`);
  });

  it("includes phase when domain is absent", () => {
    const req: MediaRequest = {
      insertId: REPEATING.id,
      at: 1000,
      context: { phase: "client-terminal" },
    };
    expect(dedupeKeyFor(req, REPEATING)).toBe(`${REPEATING.id}::client-terminal`);
  });
});

describe("presentationKeyFor", () => {
  it("composes dedupeKey + request timestamp", () => {
    expect(presentationKeyFor("cv.control-loss.v1::financial", 1000))
      .toBe("cv.control-loss.v1::financial::1000");
  });

  it("different timestamps produce different keys for the same dedupe key", () => {
    expect(presentationKeyFor("x", 1000)).not.toBe(presentationKeyFor("x", 1001));
  });
});
