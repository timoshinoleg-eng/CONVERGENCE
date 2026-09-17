/**
 * Minimal typed adapter over the official `window.Telegram.WebApp` API.
 *
 * No wrapper SDK is used: the official surface is small, stable and already
 * injected by the client, so pulling in `@tma.js/*` or similar would add
 * dependencies for no behavioural gain.
 *
 * SECURITY BOUNDARY
 *
 * Only *client convenience* fields are read: viewport, safe area, theme,
 * colour scheme, start parameter, back button and capability detection.
 *
 * `initData` / `initDataUnsafe` are treated as UNTRUSTED. Nothing derived from
 * them may be used for identity, purchases, rewards, anti-cheat or competitive
 * state. Those require server-side validation of the signed `initData` against
 * the bot token, which is explicitly out of scope for this beta. See
 * `docs/TELEGRAM_READINESS_AUDIT.md` -> "Security boundary".
 */

import { createLifecycleController, bindHostEvent, type LifecycleController } from "./lifecycle";
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
  ViewportMetrics,
} from "./types";

/** Structural subset of the official Telegram Mini Apps WebApp object. */
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
  readonly safeAreaInset?: TelegramSafeAreaInset;
  readonly contentSafeAreaInset?: TelegramSafeAreaInset;
  readonly BackButton?: TelegramBackButton;
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

/**
 * Structural check. The WebView object is hostile input until proven
 * otherwise, and several clients expose a partially initialised stub before
 * `ready()`.
 */
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

/** Reads `window.Telegram.WebApp` defensively. */
export function readTelegramWebApp(hostWindow: HostWindow): TelegramWebApp | null {
  const namespace = hostWindow.Telegram as { WebApp?: unknown } | undefined;
  if (!namespace) return null;
  return asTelegramWebApp(namespace.WebApp);
}

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

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
    // Fullscreen is a Bot API 8.0+ feature; requesting it on older clients
    // is silently ignored, so it is capability-gated rather than assumed.
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
  /**
   * Opt-in only. Fullscreen hides the Telegram header and changes how the
   * player minimises the Mini App, so it is left off until product decides.
   */
  enableFullscreen?: boolean;
  /** Injectable for tests; defaults to the shared lifecycle controller. */
  lifecycle?: LifecycleController;
  launchIntent?: LaunchIntent;
}

export function createTelegramAdapter(options: TelegramAdapterOptions): PlatformAdapter {
  const { webApp, hostWindow, hostDocument, storage } = options;

  const lifecycle =
    options.lifecycle ??
    createLifecycleController({
      readVisibility: () => hostDocument.visibilityState !== "hidden",
      onVisibilityChange: (listener) => bindHostEvent(hostDocument, "visibilitychange", listener),
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
  }

  const handleBack = (): void => {
    backHandler?.();
  };

  // Telegram has no background event, so visibility + pagehide is the only
  // reliable resume/background source inside the WebView.
  for (const eventType of ["viewportChanged", "themeChanged", "fullscreenChanged"]) {
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
      refresh();
      try {
        webApp.expand?.();
      } catch {
        /* non-fatal: the Mini App simply stays at its default height */
      }
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
