import { describe, expect, it } from "vitest";
import { MediaRuntime, type InsertResolver } from "./runtime";
import type { MediaInsert } from "./types";

function fixture(overrides: Partial<MediaInsert> = {}): MediaInsert {
  return {
    id: "test.insert.v1",
    trigger: "first-mutation",
    channel: "fullscreen",
    severity: "signal",
    asset: { kind: "motion", poster: "first-mutation", durationMs: 4_000 },
    copy: { label: "TEST" },
    videoTier: "standard",
    dismissMode: "auto",
    oneShot: true,
    ...overrides,
  };
}

function buildResolver(inserts: ReadonlyArray<MediaInsert>): {
  resolve: InsertResolver;
  index: Map<string, MediaInsert>;
} {
  const index = new Map(inserts.map((insert) => [insert.id, insert]));
  const resolve: InsertResolver = (id) => index.get(id);
  return { resolve, index };
}

describe("MediaRuntime", () => {
  it("enqueues an insert on request", () => {
    const insert = fixture();
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      now: () => 1000,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 1000 }]);
    expect(runtime.size()).toBe(1);
    expect(runtime.peek()?.insert.id).toBe(insert.id);
  });

  it("filters out requests for unknown ids", () => {
    const { resolve } = buildResolver([]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: "missing", at: 0 }]);
    expect(runtime.size()).toBe(0);
  });

  it("respects the one-shot seen state", () => {
    const insert = fixture({ oneShot: true });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.setDismissedState({
      seen: [insert.id],
      lastShownAt: {},
      snoozedUntil: {},
    });
    runtime.enqueue([{ insertId: insert.id, at: 0 }]);
    expect(runtime.size()).toBe(0);
  });

  it("honours cooldowns", () => {
    const insert = fixture({ id: "test.cooldown.v1", oneShot: false, cooldownMs: 5000 });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      now: () => 1000,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 1000 }]);
    const head = runtime.peek();
    expect(head).not.toBeNull();
    runtime.dismiss(head);
    runtime.enqueue([{ insertId: insert.id, at: 1500 }]);
    expect(runtime.size()).toBe(0);
  });

  it("returns off when tier is off", () => {
    const insert = fixture();
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "off",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 0 }]);
    expect(runtime.size()).toBe(0);
  });

  it("REGRESSION: setting tier to off clears the pending queue", () => {
    const insert = fixture();
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 0 }]);
    expect(runtime.size()).toBe(1);
    runtime.setTier("off");
    expect(runtime.size()).toBe(0);
    expect(runtime.peek()).toBeNull();
  });

  it("orders by severity, then timestamp", () => {
    const critical = fixture({ id: "critical", severity: "critical", oneShot: false });
    const ambient = fixture({ id: "ambient", severity: "ambient", oneShot: false });
    const { resolve } = buildResolver([critical, ambient]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.enqueue([
      { insertId: ambient.id, at: 100 },
      { insertId: critical.id, at: 50 },
    ]);
    expect(runtime.peek()?.insert.id).toBe("critical");
  });

  it("accepts requests that pass the context filter", () => {
    const insert = fixture({
      id: "test.context.v1",
      oneShot: false,
      contextFilter: (ctx) => Boolean(ctx.domain),
    });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 0, context: { domain: "financial" } }]);
    expect(runtime.size()).toBe(1);
  });

  it("REGRESSION: contextFilter rejects requests with missing context", () => {
    const insert = fixture({
      id: "test.context.missing.v1",
      oneShot: false,
      contextFilter: (ctx) => Boolean(ctx.domain),
    });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 0 }]);
    expect(runtime.size()).toBe(0);
  });

  it("REGRESSION: cooldown starts from runtime now(), not from request.at", () => {
    const insert = fixture({
      id: "test.cooldown.now.v1",
      oneShot: false,
      cooldownMs: 5_000,
    });
    const { resolve } = buildResolver([insert]);
    // request arrived at t=1000 but the runtime will only see it at t=100000
    let now = 100_000;
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      now: () => now,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 1000 }]);
    const head = runtime.peek();
    expect(head).not.toBeNull();
    runtime.dismiss(head);
    // cooldown started at 100_000, expires at 105_000
    now = 100_050;
    runtime.enqueue([{ insertId: insert.id, at: 100_050 }]);
    expect(runtime.size()).toBe(0);
    // advance past expiry
    now = 110_000;
    runtime.enqueue([{ insertId: insert.id, at: 110_000 }]);
    expect(runtime.size()).toBe(1);
  });

  it("REGRESSION: same domain blocked within cooldown window", () => {
    const insert = fixture({
      id: "test.cooldown.domain.v1",
      oneShot: false,
      cooldownMs: 60_000,
      contextFilter: (ctx) => Boolean(ctx.domain),
    });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      now: () => 1000,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 1000, context: { domain: "financial" } }]);
    const head = runtime.peek();
    expect(head).not.toBeNull();
    runtime.dismiss(head);
    runtime.enqueue([{ insertId: insert.id, at: 1500, context: { domain: "financial" } }]);
    expect(runtime.size()).toBe(0);
  });

  it("REGRESSION: same domain allowed after cooldown expires", () => {
    const insert = fixture({
      id: "test.cooldown.expire.v1",
      oneShot: false,
      cooldownMs: 60_000,
      contextFilter: (ctx) => Boolean(ctx.domain),
    });
    const { resolve } = buildResolver([insert]);
    let now = 1000;
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      now: () => now,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 1000, context: { domain: "financial" } }]);
    const head = runtime.peek();
    expect(head).not.toBeNull();
    runtime.dismiss(head);
    now = 30_000;
    runtime.enqueue([{ insertId: insert.id, at: 30_000, context: { domain: "financial" } }]);
    expect(runtime.size()).toBe(0);
    now = 100_000;
    runtime.enqueue([{ insertId: insert.id, at: 100_000, context: { domain: "financial" } }]);
    expect(runtime.size()).toBe(1);
  });

  it("REGRESSION: cooldown for one domain does not block a different domain", () => {
    const insert = fixture({
      id: "cv.control-loss.v1",
      oneShot: false,
      cooldownMs: 240_000,
      contextFilter: (ctx) => Boolean(ctx.domain),
    });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      now: () => 1000,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 1000, context: { domain: "financial" } }]);
    const head = runtime.peek();
    expect(head).not.toBeNull();
    runtime.dismiss(head);
    runtime.enqueue([{ insertId: insert.id, at: 1100, context: { domain: "compute" } }]);
    expect(runtime.size()).toBe(1);
  });

  it("resetState clears queue AND dismissed state", () => {
    const insert = fixture({ id: "test.reset.v1" });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.enqueue([{ insertId: insert.id, at: 1 }]);
    runtime.dismiss();
    expect(runtime.getDismissedState().seen).toContain(insert.id);
    runtime.enqueue([{ insertId: insert.id, at: 2 }]);
    expect(runtime.size()).toBe(0);
    runtime.resetState();
    expect(runtime.size()).toBe(0);
    expect(runtime.getDismissedState().seen).toEqual([]);
    runtime.enqueue([{ insertId: insert.id, at: 3 }]);
    expect(runtime.size()).toBe(1);
  });

  it("tier is mutable through the setter", () => {
    const insert = fixture();
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "off",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.setTier("standard");
    runtime.enqueue([{ insertId: insert.id, at: 0 }]);
    expect(runtime.size()).toBe(1);
    expect(runtime.getTier()).toBe("standard");
  });

  it("prefersReducedMotion is mutable through the setter", () => {
    const insert = fixture();
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    runtime.setPrefersReducedMotion(true);
    expect(runtime.getPrefersReducedMotion()).toBe(true);
  });

  // ── Origin-aware dismiss (P0-1) ─────────────────────────────────────

  it("P0-1: production dismiss marks seen; preview dismiss does NOT", () => {
    const insert = fixture({ id: "test.origin.v1", oneShot: true });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });
    // push a preview entry
    const previewEntry = runtime.pushPreview({ insertId: insert.id, at: 0 });
    expect(previewEntry).not.toBeNull();
    expect(previewEntry?.origin).toBe("preview");
    // dismiss it via the unified dismiss()
    runtime.dismiss(previewEntry);
    // dismissed state MUST NOT contain the insert id
    expect(runtime.getDismissedState().seen).not.toContain(insert.id);
    expect(runtime.size()).toBe(0);
    // now production enqueue + dismiss
    runtime.enqueue([{ insertId: insert.id, at: 1000 }]);
    expect(runtime.peek()?.origin).toBe("production");
    runtime.dismiss();
    expect(runtime.getDismissedState().seen).toContain(insert.id);
  });

  it("P0-1: production dismiss triggers lastShownAt + cooldown update; preview does NOT", () => {
    const insert = fixture({
      id: "test.origin.timing.v1",
      oneShot: false,
      cooldownMs: 100_000,
    });
    const { resolve } = buildResolver([insert]);
    let now = 1000;
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      now: () => now,
      resolveInsert: resolve,
    });
    const preview = runtime.pushPreview({ insertId: insert.id, at: 0 });
    runtime.dismiss(preview);
    expect(runtime.getDismissedState().lastShownAt[insert.id]).toBeUndefined();
    expect(runtime.getDismissedState().snoozedUntil[insert.id]).toBeUndefined();
    now = 2000;
    runtime.enqueue([{ insertId: insert.id, at: 2000 }]);
    runtime.dismiss();
    expect(runtime.getDismissedState().lastShownAt[insert.id]).toBe(2000);
  });
});


describe("MediaRuntime stale dismiss safety", () => {
  it("ignores a queue entry that was already dismissed", () => {
    const insert = fixture({
      id: "test.stale-dismiss.v1",
      oneShot: false,
      cooldownMs: 60_000,
    });
    const { resolve } = buildResolver([insert]);
    let now = 1_000;
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      now: () => now,
      resolveInsert: resolve,
    });

    runtime.enqueue([{ insertId: insert.id, at: 1_000 }]);
    const stale = runtime.peek();
    expect(stale).not.toBeNull();

    expect(runtime.dismiss(stale)).toBe(stale);
    expect(runtime.getDismissedState().lastShownAt[insert.id]).toBe(1_000);

    now = 5_000;
    expect(runtime.dismiss(stale)).toBeNull();
    expect(runtime.getDismissedState().lastShownAt[insert.id]).toBe(1_000);
  });
});


describe("MediaRuntime proxied entry identity", () => {
  it("dismisses an equivalent QueueEntry object from a reactive boundary", () => {
    const insert = fixture({ id: "test.proxy-boundary.v1" });
    const { resolve } = buildResolver([insert]);
    const runtime = new MediaRuntime({
      tier: "standard",
      prefersReducedMotion: false,
      resolveInsert: resolve,
    });

    runtime.enqueue([{ insertId: insert.id, at: 7_000 }]);
    const head = runtime.peek();
    expect(head).not.toBeNull();

    const equivalent = {
      ...head!,
      request: { ...head!.request },
    };

    expect(runtime.dismiss(equivalent)?.insert.id).toBe(insert.id);
    expect(runtime.size()).toBe(0);
    expect(runtime.getDismissedState().seen).toContain(insert.id);
  });
});
