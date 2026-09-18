/**
 * The only place where platform environment data reaches CSS.
 *
 * CONVERGENCE keeps its own dark diegetic terminal identity. This module
 * deliberately publishes *infrastructure* variables only: safe-area insets,
 * viewport height and the host page background. It never recolours game
 * surfaces, never restyles panels and never overrides the terminal palette.
 *
 * Telegram specifics handled here:
 *  - `env(safe-area-inset-*)` is unreliable inside the Telegram WebView, so
 *    the adapter's measured insets are published as `--cv-safe-*` and CSS
 *    takes the maximum of both sources.
 *  - `100vh` is unstable in Telegram Android (it does not track the sheet or
 *    the keyboard), so `--cv-viewport-height` is fed from
 *    `viewportStableHeight` and used for layout sizing.
 */

import type { HostDocument, PlatformEnvironment } from "./types";

export const CSS_VARIABLES = {
  safeTop: "--cv-safe-top",
  safeRight: "--cv-safe-right",
  safeBottom: "--cv-safe-bottom",
  safeLeft: "--cv-safe-left",
  viewportHeight: "--cv-viewport-height",
  viewportHeightDynamic: "--cv-viewport-height-dynamic",
  pageBackground: "--cv-page-background",
} as const;

export function applyEnvironmentToDocument(
  hostDocument: HostDocument,
  environment: PlatformEnvironment,
): void {
  const style = hostDocument.documentElement.style;
  const px = (value: number): string => `${Math.max(0, Math.round(value))}px`;

  // B-05: never clobber the stylesheet's `env()` default. The published value
  // is the maximum of the adapter's measured inset and the CSS environment
  // inset, so a zero-measurement adapter (browser / Capacitor) no longer erases
  // `env(safe-area-inset-*)` on notched devices.
  const inset = (value: number, side: "top" | "right" | "bottom" | "left"): string =>
    value > 0
      ? `max(${px(value)}, env(safe-area-inset-${side}, 0px))`
      : `env(safe-area-inset-${side}, 0px)`;

  style.setProperty(CSS_VARIABLES.safeTop, inset(environment.safeArea.top, "top"));
  style.setProperty(CSS_VARIABLES.safeRight, inset(environment.safeArea.right, "right"));
  style.setProperty(CSS_VARIABLES.safeBottom, inset(environment.safeArea.bottom, "bottom"));
  style.setProperty(CSS_VARIABLES.safeLeft, inset(environment.safeArea.left, "left"));
  style.setProperty(CSS_VARIABLES.viewportHeight, px(environment.viewport.stableHeight));
  style.setProperty(CSS_VARIABLES.viewportHeightDynamic, px(environment.viewport.height));
  style.setProperty(
    CSS_VARIABLES.pageBackground,
    environment.theme.params.bg_color ?? "#050809",
  );

  const dataset = hostDocument.documentElement.dataset;
  dataset.cvPlatform = environment.platform;
  dataset.cvColorScheme = environment.theme.colorScheme;
}

