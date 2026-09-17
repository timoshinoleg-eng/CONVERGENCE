/**
 * Platform boundary contracts.
 *
 * CONVERGENCE runs one canonical plain-TypeScript `GameState` core inside three
 * runtimes: Telegram Mini App, standalone browser and Capacitor Android.
 *
 * Rules enforced by this boundary:
 *
 *  - `src/game/**` (simulation / economy / narrative / persistence core) must
 *    never import anything from `src/platform/**` and must never touch a
 *    Telegram, Capacitor or DOM API directly.
 *  - platform adapters may read from the core (for example the `KeyValueStore`
 *    contract) but the dependency direction is strictly one-way.
 *  - an adapter is a *presentation and lifecycle* bridge only. It never owns
 *    game state, never mutates `GameState`, and never becomes a second source
 *    of truth.
 */

import type { KeyValueStore } from "../game/save";

/** Which runtime the app is currently hosted in. */
export type RuntimePlatform = "telegram" | "browser" | "capacitor";

/**
 * One conceptual lifecycle model shared by every runtime.
 *
 * `active`     -> simulation scheduler running, UI interactive.
 * `background` -> scheduler stopped, save flushed, wall clock still running.
 * `dispose`    -> terminal: host is tearing the page down (no further events).
 */
export type LifecyclePhase = "active" | "background" | "dispose";

export type ColorScheme = "dark" | "light";

/**
 * Where the A/B save slots actually live.
 *
 * `telegram-device` -> Telegram Bot API 9.0+ DeviceStorage (persistent local storage).
 * `capacitor-native` -> Capacitor Preferences (SharedPreferences / UserDefaults).
 * `web-localstorage` -> Capacitor Preferences web fallback backed by localStorage.
 * `memory`           -> degraded fallback, save is lost when the page dies.
 */
export type StorageKind =
  | "telegram-device"
  | "capacitor-native"
  | "web-localstorage"
  | "memory";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportMetrics {
  width: number;
  /** Currently visible height (changes while a keyboard or sheet animates). */
  height: number;
  /** Settled height without transient UI. Use this for layout sizing. */
  stableHeight: number;
}

export interface PlatformTheme {
  colorScheme: ColorScheme;
  /** Raw Telegram `themeParams`. Empty on browser/capacitor. */
  params: Readonly<Record<string, string>>;
}

/**
 * Typed, allowlisted interpretation of a Telegram launch parameter.
 * A launch intent is *data only*: it never mutates `GameState`.
 */
export type LaunchIntent =
  | { readonly type: "default"; readonly reason: "none" | "empty" | "malformed" }
  | { readonly type: "observe"; readonly id: string }
  | { readonly type: "event"; readonly id: string }
  | { readonly type: "region"; readonly id: string }
  | { readonly type: "invite"; readonly code: string };

export interface PlatformCapabilities {
  readonly expand: boolean;
  readonly fullscreen: boolean;
  readonly backButton: boolean;
  readonly homeScreen: boolean;
  readonly verticalSwipeControl: boolean;
  isVersionAtLeast(version: string): boolean;
}

export interface PlatformEnvironment {
  readonly platform: RuntimePlatform;
  readonly safeArea: SafeAreaInsets;
  readonly viewport: ViewportMetrics;
  readonly theme: PlatformTheme;
  readonly launchIntent: LaunchIntent;
  readonly capabilities: PlatformCapabilities;
  /** Telegram WebApp `version` / client build. `null` outside Telegram. */
  readonly runtimeVersion: string | null;
}

export interface PlatformStorage extends KeyValueStore {
  readonly kind: StorageKind;
  /**
   * `false` when a save survives only for the current page session
   * (host storage unavailable, private mode, storage quota, ...).
   */
  readonly durable: boolean;
}

export type BackHandler = () => void;

export interface PlatformAdapter {
  readonly kind: RuntimePlatform;
  readonly storage: PlatformStorage;
  /**
   * Runs once during app mount: Telegram `ready()`/`expand()`, CSS variable
   * bootstrap, environment refresh. Safe to call on every runtime.
   */
  ready(): Promise<void>;
  /** Latest known environment snapshot. Cheap; safe to call on every render. */
  getEnvironment(): PlatformEnvironment;
  /** Lifecycle changes are de-duplicated: never two `background` in a row. */
  onLifecycle(listener: (phase: LifecyclePhase) => void): () => void;
  /**
   * Minimal back affordance. `null` clears it and hides/ignores the control.
   * There is deliberately no router and no second navigation state machine.
   */
  setBackHandler(handler: BackHandler | null): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ *
 * Host ports
 * ------------------------------------------------------------------ */

export interface HostStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HostWindow {
  readonly location: { readonly search: string; readonly hash: string };
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly localStorage?: HostStorage;
  readonly navigator?: { readonly userAgent?: string };
  /** Populated by the official Telegram bridge as `window.Telegram.WebApp`. */
  readonly Telegram?: unknown;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  matchMedia?(query: string): { readonly matches: boolean };
}

export interface HostElementStyle {
  setProperty(name: string, value: string): void;
}

export interface HostDocument {
  readonly visibilityState: string;
  readonly documentElement: {
    readonly style: HostElementStyle;
    dataset: Record<string, string | undefined>;
  };
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
