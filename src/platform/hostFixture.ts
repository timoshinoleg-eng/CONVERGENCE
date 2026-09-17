/**
 * In-memory host doubles for platform adapter tests.
 *
 * Lets every adapter be tested with no jsdom / happy-dom dependency: the
 * adapters only ever touch the narrow `HostWindow` / `HostDocument` ports.
 */

import type { HostDocument, HostWindow, PlatformStorage } from "./types";

/** In-memory `PlatformStorage` with the durability flag adapters expect. */
export function createTestStorage(backing = new Map<string, string>()): PlatformStorage {
  return {
    kind: "memory",
    durable: true,
    async get(key: string): Promise<string | null> {
      return backing.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      backing.set(key, value);
    },
  };
}

interface ListenerRegistry {
  add(type: string, listener: () => void): void;
  remove(type: string, listener: () => void): void;
  fire(type: string): void;
  count(type: string): number;
}

function createListenerRegistry(): ListenerRegistry {
  const listeners = new Map<string, Set<() => void>>();
  return {
    add(type, listener) {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    remove(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    fire(type) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
    count(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

export interface FakeHostOptions {
  search?: string;
  hash?: string;
  visibilityState?: string;
  width?: number;
  height?: number;
  matchMedia?: (query: string) => { matches: boolean };
  Telegram?: unknown;
}

export interface FakeHost {
  readonly window: HostWindow;
  readonly document: HostDocument;
  readonly cssVariables: Map<string, string>;
  readonly dataset: Record<string, string | undefined>;
  setVisibility(state: string): void;
  fire(type: "visibilitychange" | "pagehide"): void;
  listenerCount(target: "window" | "document", type: string): number;
}

export function createFakeHost(options: FakeHostOptions = {}): FakeHost {
  const windowListeners = createListenerRegistry();
  const documentListeners = createListenerRegistry();
  const cssVariables = new Map<string, string>();
  const dataset: Record<string, string | undefined> = {};
  const location = { search: options.search ?? "", hash: options.hash ?? "" };

  let visibilityState = options.visibilityState ?? "visible";
  const matchMedia = options.matchMedia;

  const hostWindow: HostWindow = {
    location,
    innerWidth: options.width ?? 390,
    innerHeight: options.height ?? 844,
    Telegram: options.Telegram,
    matchMedia,
    addEventListener: (type, listener) => windowListeners.add(type, listener),
    removeEventListener: (type, listener) => windowListeners.remove(type, listener),
  };

  const hostDocument: HostDocument = {
    get visibilityState(): string {
      return visibilityState;
    },
    documentElement: {
      style: {
        setProperty: (name: string, value: string) => {
          cssVariables.set(name, value);
        },
      },
      dataset,
    },
    addEventListener: (type, listener) => documentListeners.add(type, listener),
    removeEventListener: (type, listener) => documentListeners.remove(type, listener),
  };

  return {
    window: hostWindow,
    document: hostDocument,
    cssVariables,
    dataset,
    setVisibility(state: string): void {
      visibilityState = state;
    },
    fire(type): void {
      if (type === "pagehide") windowListeners.fire(type);
      else documentListeners.fire(type);
    },
    listenerCount(target, type): number {
      return (target === "window" ? windowListeners : documentListeners).count(type);
    },
  };
}

/** Minimal stand-in for `window.Telegram.WebApp` with spy recording. */
export interface FakeTelegramWebApp {
  calls: string[];
  webApp: Record<string, unknown>;
}

export interface FakeWebAppOptions {
  version?: string;
  colorScheme?: string;
  themeParams?: Record<string, string>;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  startParam?: string;
  initData?: string;
  withBackButton?: boolean;
  withFullscreen?: boolean;
  withHomeScreen?: boolean;
  versionAtLeast?: (version: string) => boolean;
}

export function createFakeWebApp(options: FakeWebAppOptions = {}): FakeTelegramWebApp {
  const calls: string[] = [];
  const events = new Map<string, Set<() => void>>();
  const backButton = {
    isVisible: false,
    show(): void {
      backButton.isVisible = true;
      calls.push("back.show");
    },
    hide(): void {
      backButton.isVisible = false;
      calls.push("back.hide");
    },
    onClick(handler: () => void): void {
      events.set("backButtonClicked", new Set([handler]));
      calls.push("back.onClick");
    },
    offClick(): void {
      events.delete("backButtonClicked");
      calls.push("back.offClick");
    },
  };

  const webApp: Record<string, unknown> = {
    version: options.version ?? "8.0",
    platform: "android",
    initData: options.initData ?? "",
    initDataUnsafe: { start_param: options.startParam },
    colorScheme: options.colorScheme ?? "dark",
    themeParams: options.themeParams ?? { bg_color: "#17212b", header_bg_color: "#17212b" },
    viewportHeight: options.viewportHeight ?? 640,
    viewportStableHeight: options.viewportStableHeight ?? 700,
    isExpanded: false,
    ready(): void {
      calls.push("ready");
    },
    expand(): void {
      calls.push("expand");
    },
    isVersionAtLeast(version: string): boolean {
      return options.versionAtLeast ? options.versionAtLeast(version) : true;
    },
    onEvent(eventType: string, handler: () => void): void {
      const set = events.get(eventType) ?? new Set<() => void>();
      set.add(handler);
      events.set(eventType, set);
    },
    offEvent(eventType: string, handler: () => void): void {
      events.get(eventType)?.delete(handler);
    },
    fire(eventType: string): void {
      for (const handler of [...(events.get(eventType) ?? [])]) handler();
    },
  };

  if (options.safeAreaInset) webApp.safeAreaInset = options.safeAreaInset;
  if (options.contentSafeAreaInset) webApp.contentSafeAreaInset = options.contentSafeAreaInset;
  if (options.withBackButton !== false) webApp.BackButton = backButton;
  if (options.withFullscreen === true) {
    webApp.requestFullscreen = (): void => {
      calls.push("requestFullscreen");
    };
  }
  if (options.withHomeScreen === true) {
    webApp.addToHomeScreen = (): void => {
      calls.push("addToHomeScreen");
    };
  }

  return { calls, webApp };
}
