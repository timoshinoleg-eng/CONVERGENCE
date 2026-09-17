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

  style.setProperty(CSS_VARIABLES.safeTop, px(environment.safeArea.top));
  style.setProperty(CSS_VARIABLES.safeRight, px(environment.safeArea.right));
  style.setProperty(CSS_VARIABLES.safeBottom, px(environment.safeArea.bottom));
  style.setProperty(CSS_VARIABLES.safeLeft, px(environment.safeArea.left));
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
