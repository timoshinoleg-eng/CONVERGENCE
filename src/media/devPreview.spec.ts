import { describe, expect, it } from "vitest";
import { MediaRuntime } from "./runtime";
import { MEDIA_INSERTS, defaultResolveInsert } from "./manifest";
import { createEmptyDismissedState, type MediaContext, type MediaRequest } from "./types";

/**
 * Manual replay smoke test: every P0 insert must be re-watchable through
 * the preview path regardless of its gating rules. For inserts whose
 * manifest expects a domain, the panel supplies the fictitious `financial`
 * context that the dev panel actually sends.
 *
 * CRITICAL: this test exercises the SAME `dismiss()` path that the Vue
 * presentation components call — NOT a separate preview-only method.
 * The dismiss contract is origin-aware: preview dismisses must NOT touch
 * dismissed state.
 */
function previewRequestFor(insertId: string): MediaRequest {
  const insert = defaultResolveInsert(insertId);
  if (!insert) throw new Error(`unknown insert ${insertId}`);
  const needsDomain = typeof insert.contextFilter === "function";
  const context: MediaContext | undefined = needsDomain
    ? { domain: "financial" }
    : undefined;
  return { insertId, at: 1000, context };
}

describe("DEV preview — every P0 insert is re-watchable", () => {
  for (const insert of MEDIA_INSERTS) {
    it(`preview enqueues ${insert.id} via unified dismiss()`, () => {
      const runtime = new MediaRuntime({
        tier: "standard",
        prefersReducedMotion: false,
        resolveInsert: defaultResolveInsert,
      });
      const initialSeen = insert.oneShot ? [insert.id] : [];
      runtime.setDismissedState({
        ...createEmptyDismissedState(),
        seen: initialSeen,
      });

      if (insert.oneShot) {
        // Production enqueue respects oneShot — must NOT enqueue.
        runtime.enqueue([previewRequestFor(insert.id)]);
        expect(runtime.size()).toBe(0);
      }

      const entry = runtime.pushPreview(previewRequestFor(insert.id));
      expect(entry).not.toBeNull();
      expect(entry?.origin).toBe("preview");
      expect(runtime.size()).toBe(1);

      // Unified dismiss — the SAME call Vue components make.
      runtime.dismiss(entry!);
      expect(runtime.size()).toBe(0);
      const dismissed = runtime.getDismissedState();
      if (insert.oneShot) {
        expect(dismissed.seen).toEqual(initialSeen);
      } else {
        expect(dismissed.seen).toEqual([]);
      }
    });
  }
});
