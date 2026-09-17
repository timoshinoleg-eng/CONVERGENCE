/**
 * Platform boundary entry point.
 *
 * Detection order matters: Telegram first, then native Capacitor, then browser.
 * The official Telegram bridge is loaded from index.html, but detection still
 * requires genuine Telegram launch context so ordinary browsers remain web.
 */

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createBrowserAdapter } from "./browser";
import { createCapacitorAdapter, type CapacitorAppPort } from "./capacitor";
import { applyEnvironmentToDocument } from "./dom";
import { createPlatformStorage } from "./storage";
import { createTelegramAdapter, readTelegramWebApp } from "./telegram";
import type {
  HostDocument,
  HostWindow,
  PlatformAdapter,
  PlatformStorage,
  RuntimePlatform,
} from "./types";

export * from "./types";
export { parseLaunchIntent, readLaunchParam, resolveLaunchIntent } from "./launchIntent";
export { createLifecycleController } from "./lifecycle";
export {
  createPlatformStorage,
  MemoryStore,
  PreferencesStore,
  TelegramDeviceStore,
} from "./storage";
export { asTelegramWebApp, readTelegramWebApp, type TelegramWebApp } from "./telegram";
export { applyEnvironmentToDocument, CSS_VARIABLES } from "./dom";

export interface CreatePlatformOptions {
  hostWindow?: HostWindow;
  hostDocument?: HostDocument;
  /** `@capacitor/app` port. Defaults to the real plugin. */
  capacitorApp?: CapacitorAppPort | null;
  /** Overrides Capacitor native detection (tests). */
  native?: boolean;
  storage?: PlatformStorage;
  /** Opt-in Telegram fullscreen. Off by default - see docs. */
  enableFullscreen?: boolean;
}

function defaultHostWindow(): HostWindow {
  return globalThis.window as unknown as HostWindow;
}

function defaultHostDocument(): HostDocument {
  return globalThis.document as unknown as HostDocument;
}

function detectNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function detectRuntimePlatform(
  host: { hostWindow?: HostWindow; native?: boolean } = {},
): RuntimePlatform {
  const hostWindow = host.hostWindow ?? defaultHostWindow();
  if (readTelegramWebApp(hostWindow) !== null) return "telegram";
  if (host.native ?? detectNative()) return "capacitor";
  return "browser";
}

export function createPlatformAdapter(options: CreatePlatformOptions = {}): PlatformAdapter {
  const hostWindow = options.hostWindow ?? defaultHostWindow();
  const hostDocument = options.hostDocument ?? defaultHostDocument();
  const native = options.native ?? detectNative();
  const webApp = readTelegramWebApp(hostWindow);
  const storage =
    options.storage ??
    createPlatformStorage({
      native,
      telegramDeviceStorage: webApp?.DeviceStorage ?? null,
    });

  let adapter: PlatformAdapter;
  if (webApp) {
    adapter = createTelegramAdapter({
      webApp,
      hostWindow,
      hostDocument,
      storage,
      enableFullscreen: options.enableFullscreen === true,
    });
  } else if (native) {
    adapter = createCapacitorAdapter({
      hostWindow,
      hostDocument,
      storage,
      app:
        options.capacitorApp === undefined
          ? (CapacitorApp as unknown as CapacitorAppPort)
          : options.capacitorApp,
    });
  } else {
    adapter = createBrowserAdapter({ hostWindow, hostDocument, storage });
  }

  applyEnvironmentToDocument(hostDocument, adapter.getEnvironment());
  return adapter;
}

let installed: PlatformAdapter | null = null;

/** Lazily created process-wide adapter used by `App.vue` and the Pinia store. */
export function getPlatform(): PlatformAdapter {
  if (!installed) installed = createPlatformAdapter();
  return installed;
}

/** Test seam: replaces or clears the singleton. */
export function installPlatform(adapter: PlatformAdapter | null): void {
  installed = adapter;
}
