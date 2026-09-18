/**
 * Auto-dismiss helper.
 *
 * The inline insert has `dismissMode: "auto"` in the manifest, which
 * promises the host UI a setTimeout-based dismiss. Vue lifecycle hooks
 * (`onMounted` / `onBeforeUnmount`) wire this helper into a component so
 * the contract is testable without spinning up a DOM environment.
 */

export interface AutoDismissOptions {
  readonly durationMs: number;
  readonly dismissMode: "auto" | "tap";
  readonly onDismiss: () => void;
}

export interface AutoDismissController {
  /** Start (or restart) the auto timer. Safe to call repeatedly. */
  start: () => void;
  /** Stop the timer. Safe to call when already stopped. */
  stop: () => void;
  /** True iff a setTimeout is currently armed. */
  isRunning: () => boolean;
}

export function createAutoDismiss(
  options: AutoDismissOptions,
): AutoDismissController {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
    timer = null;
    options.onDismiss();
  };

  return {
    start(): void {
      if (timer !== null) clearTimeout(timer);
      if (options.dismissMode !== "auto") {
        timer = null;
        return;
      }
      if (options.durationMs <= 0) {
        // Edge case: zero or negative duration → dismiss immediately on
        // the next tick so callers can rely on the contract without a
        // zero-second timeout.
        timer = setTimeout(fire, 0);
        return;
      }
      timer = setTimeout(fire, options.durationMs);
    },
    stop(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    isRunning(): boolean {
      return timer !== null;
    },
  };
}
