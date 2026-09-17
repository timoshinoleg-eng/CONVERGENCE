/**
 * Standalone browser adapter (default / dev / web build).
 *
 * Requirements it must satisfy:
 *  - No Telegram API present -> the game behaves exactly as before.
 *  - No Capacitor native plugin required.
 *  - No browser navigation is hijacked. The BackButton slot exists for API
 *    parity only: registering `popstate` here would fight the browser's own
 *    history and is deliberately NOT implemented.
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

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const NO_CAPABILITIES: PlatformCapabilities = {
  expand: false,
  fullscreen: false,
  backButton: false,
  homeScreen: false,
  verticalSwipeControl: false,
  isVersionAtLeast: () => false,
};

export interface BrowserAdapterOptions {
  hostWindow: HostWindow;
  hostDocument: HostDocument;
  storage: PlatformStorage;
  lifecycle?: LifecycleController;
  launchIntent?: LaunchIntent;
}

export function createBrowserAdapter(options: BrowserAdapterOptions): PlatformAdapter {
  const { hostWindow, hostDocument, storage } = options;

  const lifecycle =
    options.lifecycle ??
    createLifecycleController({
      readVisibility: () => hostDocument.visibilityState !== "hidden",
      onVisibilityChange: (listener) => bindHostEvent(hostDocument, "visibilitychange", listener),
      onDispose: (listener) => bindHostEvent(hostWindow, "pagehide", listener),
    });

  const launchIntent =
    options.launchIntent ??
    resolveLaunchIntent({ search: hostWindow.location.search, hash: hostWindow.location.hash });

  let environment: PlatformEnvironment = readEnvironment();
  let backHandler: BackHandler | null = null;

  function readTheme(): PlatformTheme {
    let light = false;
    try {
      light = hostWindow.matchMedia?.("(prefers-color-scheme: light)").matches === true;
    } catch {
      light = false;
    }
    return { colorScheme: light ? "light" : "dark", params: {} };
  }

  function readEnvironment(): PlatformEnvironment {
    const height = typeof hostWindow.innerHeight === "number" ? hostWindow.innerHeight : 0;
    return {
      platform: "browser",
      // The browser adapter leaves safe-area insets at zero: CSS `env()` is
      // already correct for a normal browser viewport, and inventing insets
      // here would double-pad on notched devices.
      safeArea: ZERO_INSETS,
      viewport: {
        width: typeof hostWindow.innerWidth === "number" ? hostWindow.innerWidth : 0,
        height,
        stableHeight: height,
      },
      theme: readTheme(),
      launchIntent,
      capabilities: NO_CAPABILITIES,
      runtimeVersion: null,
    };
  }

  return {
    kind: "browser",
    storage,
    async ready(): Promise<void> {
      environment = readEnvironment();
    },
    getEnvironment: () => environment,
    onLifecycle: (listener) => lifecycle.subscribe(listener),
    setBackHandler(handler: BackHandler | null): void {
      // Stored for parity and for a future in-app overlay. Browser history is
      // intentionally left alone.
      backHandler = handler;
    },
    dispose(): void {
      backHandler = null;
      lifecycle.dispose();
    },
  };
}
