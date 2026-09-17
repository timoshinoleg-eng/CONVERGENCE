/**
 * Minimal typed adapter over the official `window.Telegram.WebApp` API.
 *
 * The official bridge is loaded by `index.html`. Runtime detection remains
 * defensive because that bridge can also be downloaded by a normal browser.
 * `initData` / `initDataUnsafe` are UNTRUSTED client convenience data only.
 */

import { applyEnvironmentToDocument } from "./dom";
import { createLifecycleController, bindHostEvent, type LifecycleController } from "./lifecycle";
import { resolveLaunchIntent } from "./launchIntent";
import type { TelegramDeviceStoragePort } from "./storage";
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
  ViewportMetrics,
} from "./types";

export interface TelegramSafeAreaInset {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface TelegramBackButton {
  isVisible?: boolean;
  show?(): void;
  hide?(): void;
  onClick?(handler: () => void): void;
  offClick?(handler: () => void): void;
}

export interface TelegramWebApp {
  readonly initData?: string;
  readonly initDataUnsafe?: { start_param?: string; [key: string]: unknown };
  readonly version?: string;
  readonly platform?: string;
  readonly colorScheme?: string;
  readonly themeParams?: Record<string, string | undefined>;
  readonly viewportHeight?: number;
  readonly viewportStableHeight?: number;
  readonly isExpanded?: boolean;
  readonly isFullscreen?: boolean;
  readonly isActive?: boolean;
  readonly safeAreaInset?: TelegramSafeAreaInset;
  readonly contentSafeAreaInset?: TelegramSafeAreaInset;
  readonly BackButton?: TelegramBackButton;
  readonly DeviceStorage?: TelegramDeviceStoragePort;
  ready?(): void;
  expand?(): void;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  isVersionAtLeast?(version: string): boolean;
  onEvent?(eventType: string, handler: () => void): void;
  offEvent?(eventType: string, handler: () => void): void;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(callback: (status: string) => void): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
}

export function asTelegramWebApp(value: unknown): TelegramWebApp | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<TelegramWebApp>;
  const hasRuntimeMarker =
    typeof candidate.ready === "function" ||
    typeof candidate.initData === "string" ||
    typeof candidate.version === "string" ||
    typeof candidate.expand === "function";
  return hasRuntimeMarker ? (candidate as TelegramWebApp) : null;
}

function hasTelegramLaunchContext(hostWindow: HostWindow, webApp: TelegramWebApp): boolean {
  const platform = typeof webApp.platform === "string" ? webApp.platform.trim().toLowerCase() : "";
  if (platform.length > 0 && platform !== "unknown") return true;
  if (typeof webApp.initData === "string" && webApp.initData.length > 0) return true;

  const locationData = `${hostWindow.location.search}&${hostWindow.location.hash}`;
  return /(?:^|[?&#])tgWebApp(?:Version|Platform|Data|StartParam)=/.test(locationData);
}

/** Reads `window.Telegram.WebApp` defensively without misclassifying normal web. */
export function readTelegramWebApp(hostWindow: HostWindow): TelegramWebApp | null {
  const namespace = hostWindow.Telegram as { WebApp?: unknown } | undefined;
  if (!namespace) return null;
  const webApp = asTelegramWebApp(namespace.WebApp);
  if (!webApp) return null;
  return hasTelegramLaunchContext(hostWindow, webApp) ? webApp : null;
}

function readInsets(
  primary: TelegramSafeAreaInset | undefined,
  secondary: TelegramSafeAreaInset | undefined,
): SafeAreaInsets {
  const pick = (side: keyof TelegramSafeAreaInset): number => {
    const values = [primary?.[side], secondary?.[side]].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    return values.length > 0 ? Math.max(...values) : 0;
  };
  return { top: pick("top"), right: pick("right"), bottom: pick("bottom"), left: pick("left") };
}

function readTheme(webApp: TelegramWebApp): PlatformTheme {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(webApp.themeParams ?? {})) {
    if (typeof value === "string") params[key] = value;
  }
  return { colorScheme: webApp.colorScheme === "light" ? "light" : "dark", params };
}

function readCapabilities(webApp: TelegramWebApp): PlatformCapabilities {
  const versioned = (version: string): boolean => {
    try {
      return webApp.isVersionAtLeast?.(version) ?? false;
    } catch {
      return false;
    }
  };
  return {
    expand: typeof webApp.expand === "function",
    fullscreen: typeof webApp.requestFullscreen === "function" && versioned("8.0"),
    backButton: typeof webApp.BackButton?.show === "function",
    homeScreen: typeof webApp.addToHomeScreen === "function",
    verticalSwipeControl: typeof webApp.disableVerticalSwipes === "function",
    isVersionAtLeast: versioned,
  };
}

function readViewport(webApp: TelegramWebApp, hostWindow: HostWindow): ViewportMetrics {
  const width = typeof hostWindow.innerWidth === "number" ? hostWindow.innerWidth : 0;
  const height =
    typeof webApp.viewportHeight === "number" && webApp.viewportHeight > 0
      ? webApp.viewportHeight
      : hostWindow.innerHeight;
  const stableHeight =
    typeof webApp.viewportStableHeight === "number" && webApp.viewportStableHeight > 0
      ? webApp.viewportStableHeight
      : height;
  return { width, height, stableHeight };
}

export interface TelegramAdapterOptions {
  webApp: TelegramWebApp;
  hostWindow: HostWindow;
  hostDocument: HostDocument;
  storage: PlatformStorage;
  enableFullscreen?: boolean;
  lifecycle?: LifecycleController;
  launchIntent?: LaunchIntent;
}

export function createTelegramAdapter(options: TelegramAdapterOptions): PlatformAdapter {
  const { webApp, hostWindow, hostDocument, storage } = options;
  let active =
    typeof webApp.isActive === "boolean"
      ? webApp.isActive
      : hostDocument.visibilityState !== "hidden";

  const lifecycle =
    options.lifecycle ??
    createLifecycleController({
      readVisibility: () => active,
      onVisibilityChange: (listener) => {
        const unsubscribes: Array<() => void> = [];
        const registerTelegramLifecycle = (eventType: "activated" | "deactivated", value: boolean) => {
          if (typeof webApp.onEvent !== "function") return;
          const handler = () => {
            active = value;
            listener();
          };
          try {
            webApp.onEvent(eventType, handler);
            unsubscribes.push(() => {
              try {
                webApp.offEvent?.(eventType, handler);
              } catch {
                /* client already gone */
              }
            });
          } catch {
            /* old Telegram client: DOM fallback remains active */
          }
        };

        registerTelegramLifecycle("activated", true);
        registerTelegramLifecycle("deactivated", false);
        unsubscribes.push(
          bindHostEvent(hostDocument, "visibilitychange", () => {
            active = hostDocument.visibilityState !== "hidden";
            listener();
          }),
        );
        return () => {
          while (unsubscribes.length > 0) unsubscribes.pop()?.();
        };
      },
      onDispose: (listener) => bindHostEvent(hostWindow, "pagehide", listener),
    });

  const launchIntent =
    options.launchIntent ??
    resolveLaunchIntent({
      search: hostWindow.location.search,
      hash: hostWindow.location.hash,
      startParam:
        typeof webApp.initDataUnsafe?.start_param === "string"
          ? webApp.initDataUnsafe.start_param
          : null,
    });

  let environment: PlatformEnvironment = readEnvironment();
  let backHandler: BackHandler | null = null;
  const hostUnsubscribes: Array<() => void> = [];

  function readEnvironment(): PlatformEnvironment {
    return {
      platform: "telegram",
      safeArea: readInsets(webApp.contentSafeAreaInset, webApp.safeAreaInset),
      viewport: readViewport(webApp, hostWindow),
      theme: readTheme(webApp),
      launchIntent,
      capabilities: readCapabilities(webApp),
      runtimeVersion: typeof webApp.version === "string" ? webApp.version : null,
    };
  }

  function refresh(): void {
    environment = readEnvironment();
    applyEnvironmentToDocument(hostDocument, environment);
  }

  const handleBack = (): void => {
    backHandler?.();
  };

  for (const eventType of [
    "viewportChanged",
    "themeChanged",
    "fullscreenChanged",
    "safeAreaChanged",
    "contentSafeAreaChanged",
  ]) {
    if (typeof webApp.onEvent !== "function") continue;
    try {
      webApp.onEvent(eventType, refresh);
      hostUnsubscribes.push(() => {
        try {
          webApp.offEvent?.(eventType, refresh);
        } catch {
          /* client already gone */
        }
      });
    } catch {
      /* event unsupported on this client */
    }
  }

  function setBackHandler(handler: BackHandler | null): void {
    backHandler = handler;
    const button = webApp.BackButton;
    if (!button) return;
    try {
      if (handler) {
        button.offClick?.(handleBack);
        button.onClick?.(handleBack);
        button.show?.();
      } else {
        button.offClick?.(handleBack);
        button.hide?.();
      }
    } catch {
      /* back button unavailable on this client */
    }
  }

  return {
    kind: "telegram",
    storage,
    async ready(): Promise<void> {
      try {
        webApp.ready?.();
      } catch {
        /* never block boot on a client API failure */
      }
      try {
        webApp.expand?.();
      } catch {
        /* non-fatal */
      }
      refresh();
      if (options.enableFullscreen === true && environment.capabilities.fullscreen) {
        try {
          webApp.requestFullscreen?.();
        } catch {
          /* non-fatal */
        }
      }
    },
    getEnvironment: () => environment,
    onLifecycle: (listener) => lifecycle.subscribe(listener),
    setBackHandler,
    dispose(): void {
      while (hostUnsubscribes.length > 0) hostUnsubscribes.pop()?.();
      setBackHandler(null);
      lifecycle.dispose();
    },
  };
}
