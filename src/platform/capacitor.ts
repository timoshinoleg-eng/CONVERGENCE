/**
 * Capacitor Android adapter (dev/test channel + fallback distribution).
 *
 * Compatibility requirement: this adapter must preserve the behaviour shipped
 * in PR #9 exactly when no back handler is registered:
 *
 *   appStateChange(isActive = true)  -> resume + offline catch-up
 *   appStateChange(isActive = false) -> pause + save
 *
 * The native `appStateChange` stream is the only lifecycle source used here,
 * which keeps the APK identical to the current beta build. DOM
 * `visibilitychange` is only used as a fallback when the Capacitor App plugin
 * is unavailable (for example a web build that still reports a native
 * platform).
 *
 * Back button: the `backButton` listener is registered lazily, only while a
 * handler is actually set. With no handler (the current single-screen app) no
 * listener exists, so Android's default back behaviour is untouched.
 */

import { bindHostEvent, createLifecycleController, type LifecycleController } from "./lifecycle";
import { resolveLaunchIntent } from "./launchIntent";
import type {
  BackHandler,
  HostDocument,
  HostWindow,
  LaunchIntent,
  PlatformAdapter,
  PlatformCapabilities,
  PlatformEnvironment,
  PlatformStorage,
  PlatformTheme,
  SafeAreaInsets,
} from "./types";

export interface CapacitorListenerHandle {
  remove(): Promise<void>;
}

/**
 * Structural port for `@capacitor/app`. Kept narrow so the adapter can be
 * tested without the native bridge.
 */
export interface CapacitorAppPort {
  addListener(
    event: "appStateChange",
    listener: (state: { isActive: boolean }) => void,
  ): Promise<CapacitorListenerHandle>;
  addListener(event: "backButton", listener: () => void): Promise<CapacitorListenerHandle>;
}

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const CAPACITOR_CAPABILITIES: PlatformCapabilities = {
  expand: false,
  fullscreen: false,
  backButton: true,
  homeScreen: false,
  verticalSwipeControl: false,
  isVersionAtLeast: () => false,
};

export interface CapacitorAdapterOptions {
  hostWindow: HostWindow;
  hostDocument: HostDocument;
  storage: PlatformStorage;
  /** `@capacitor/app` `App` object. `null` disables native lifecycle events. */
  app: CapacitorAppPort | null;
  lifecycle?: LifecycleController;
  launchIntent?: LaunchIntent;
}

export function createCapacitorAdapter(options: CapacitorAdapterOptions): PlatformAdapter {
  const { hostWindow, hostDocument, storage, app } = options;

  let visible = hostDocument.visibilityState !== "hidden";

  const lifecycle =
    options.lifecycle ??
    createLifecycleController({
      readVisibility: () => visible,
      onVisibilityChange: (listener) => {
        // B-07: bind the DOM fallback FIRST and unconditionally. Previously the
        // `app` branch returned before this was ever reached, so a rejected
        // `addListener` left the app with no lifecycle source at all.
        const domUnbind = bindHostEvent(hostDocument, "visibilitychange", () => {
          visible = hostDocument.visibilityState !== "hidden";
          listener();
        });
        if (!app) return domUnbind;

        let handle: CapacitorListenerHandle | null = null;
        let disposed = false;
        app
          .addListener("appStateChange", ({ isActive }) => {
            visible = isActive;
            listener();
          })
          .then((next) => {
            // Teardown may have already happened; release the late handle.
            if (disposed) void next.remove().catch(() => undefined);
            else handle = next;
          })
          .catch(() => {
            /* plugin unavailable; the DOM fallback above is already bound */
          });

        return () => {
          disposed = true;
          domUnbind();
          void handle?.remove().catch(() => undefined);
        };
      },
      // Android delivers teardown through appStateChange / process death.
      // onUnmounted already flushes a save, so no extra native hook is wired.
      onDispose: () => () => undefined,
    });

  const launchIntent =
    options.launchIntent ??
    resolveLaunchIntent({ search: hostWindow.location.search, hash: hostWindow.location.hash });

  let environment: PlatformEnvironment = readEnvironment();
  let backHandler: BackHandler | null = null;
  let backHandle: CapacitorListenerHandle | null = null;

  function readEnvironment(): PlatformEnvironment {
    const height = typeof hostWindow.innerHeight === "number" ? hostWindow.innerHeight : 0;
    const theme: PlatformTheme = { colorScheme: "dark", params: {} };
    return {
      platform: "capacitor",
      safeArea: ZERO_INSETS,
      viewport: {
        width: typeof hostWindow.innerWidth === "number" ? hostWindow.innerWidth : 0,
        height,
        stableHeight: height,
      },
      theme,
      launchIntent,
      capabilities: CAPACITOR_CAPABILITIES,
      runtimeVersion: null,
    };
  }

  const handleBack = (): void => {
    backHandler?.();
  };

  function setBackHandler(handler: BackHandler | null): void {
    backHandler = handler;
    if (!app) return;
    if (handler) {
      if (backHandle) return;
      void app
        .addListener("backButton", handleBack)
        .then((next) => {
          backHandle = next;
        })
        .catch(() => undefined);
      return;
    }
    const pending = backHandle;
    backHandle = null;
    void pending?.remove().catch(() => undefined);
  }

  return {
    kind: "capacitor",
    storage,
    async ready(): Promise<void> {
      environment = readEnvironment();
    },
    getEnvironment: () => environment,
    onLifecycle: (listener) => lifecycle.subscribe(listener),
    setBackHandler,
    dispose(): void {
      setBackHandler(null);
      lifecycle.dispose();
    },
  };
}

