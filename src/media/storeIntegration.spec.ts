import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMediaStore } from "../stores/media";
import { defaultResolveInsert } from "./manifest";
import { createEmptyDismissedState } from "./types";

describe("media Pinia integration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("persists immediately after a production dismiss", () => {
    const persistDismissed = vi.fn();
    const media = useMediaStore();
    media.configure({
      tier: "standard",
      prefersReducedMotion: false,
      dismissed: createEmptyDismissedState(),
      resolveInsert: defaultResolveInsert,
      persistDismissed,
    });

    media.enqueue([{
      insertId: "cv.first-mutation.v1",
      at: 1_000,
    }]);

    expect(media.queueHead?.origin).toBe("production");
    media.dismiss();

    expect(persistDismissed).toHaveBeenCalledTimes(1);
    expect(media.getDismissedState()?.seen)
      .toContain("cv.first-mutation.v1");
  });

  it("does not persist or mutate history when a preview is dismissed", () => {
    const persistDismissed = vi.fn();
    const media = useMediaStore();
    media.configure({
      tier: "standard",
      prefersReducedMotion: false,
      dismissed: createEmptyDismissedState(),
      resolveInsert: defaultResolveInsert,
      persistDismissed,
    });

    media.previewEnqueue([{
      insertId: "cv.first-mutation.v1",
      at: 2_000,
    }]);

    expect(media.queueHead?.origin).toBe("preview");
    media.dismiss();

    expect(persistDismissed).not.toHaveBeenCalled();
    expect(media.getDismissedState()?.seen).toEqual([]);
  });
});
