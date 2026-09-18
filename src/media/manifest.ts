/**
 * Built-in insert manifest.
 *
 * Five P0 inserts cover the canonical first-session beats. Every insert is
 * pure data; tone must remain infrastructural and restrained — never marketing.
 *
 * Conventions:
 *  - `id` is stable and shipped in media history as the seen-marker.
 *  - `copy.title` / `copy.caption` always provide `ru` + `en`; `zh` is
 *    optional. The i18n helper falls back ru → en.
 *  - `videoTier` is the lowest tier that may render the video variant;
 *    lower tiers use the static SVG poster with optional CSS motion.
 *  - `oneShot` ensures the player only sees the moment once per media
 *    history (not once per save generation).
 *  - `prefers-reduced-motion` selects the static asset variant — it never
 *    drops the event itself.
 *
 * Copy policy:
 *  - Every numeric claim must trace back to a real GameState observation.
 *  - Copy must remain accurate across all stages of the underlying state —
 *    use stage-agnostic wording where a stage may have already advanced.
 *  - Stamps are operational / serial / phase tags. No hacker tropes
 *    (`0x00c0ffee`, etc.) — the project explicitly avoids the dev-dashboard
 *    aesthetic.
 */

import type { MediaInsert, MediaTriggerKind } from "./types";

export const MEDIA_INSERTS: ReadonlyArray<MediaInsert> = [
  {
    id: "cv.first-mutation.v1",
    trigger: "first-mutation",
    channel: "fullscreen",
    severity: "signal",
    asset: { kind: "motion", poster: "first-mutation", durationMs: 6_000 },
    copy: {
      label: "FIRST INTERPRETATION",
      title: {
        ru: "Первая операционная интерпретация зафиксирована",
        en: "First operational interpretation committed",
      },
      caption: {
        ru: "Зафиксирована первая операционная интерпретация системы.",
        en: "The system's first operational interpretation has been committed.",
      },
      stamp: "INTERP-001",
    },
    videoTier: "standard",
    dismissMode: "tap",
    oneShot: true,
  },
  {
    id: "cv.distributed-syndicate-reveal.v1",
    trigger: "distributed-syndicate-reveal",
    channel: "card",
    severity: "incident",
    asset: { kind: "motion", poster: "distributed-syndicate", durationMs: 5_000 },
    copy: {
      label: "INTERFACE EXPANSION",
      title: {
        ru: "Распределённый синдикат",
        en: "Distributed syndicate",
      },
      caption: {
        ru: "Распределённая схема управления активирована.",
        en: "Distributed control surface has been activated.",
      },
      stamp: "PHASE 02/03 · DS-01",
    },
    videoTier: "standard",
    dismissMode: "auto",
    oneShot: true,
  },
  {
    id: "cv.moscow-reveal.v1",
    trigger: "moscow-reveal",
    channel: "fullscreen",
    severity: "signal",
    asset: { kind: "motion", poster: "moscow-reveal", durationMs: 7_000 },
    copy: {
      label: "REGIONAL MODEL · MOSCOW",
      title: {
        ru: "Региональная модель: Москва",
        en: "Regional model: Moscow",
      },
      caption: {
        ru: "Совокупный сигнал превысил порог. Узлы — фиктивные агрегаты.",
        en: "Aggregate signal has crossed the threshold. Nodes are fictional aggregates.",
      },
      stamp: "RU-MOW · MOW-SCH-01",
    },
    videoTier: "standard",
    dismissMode: "tap",
    oneShot: true,
  },
  {
    id: "cv.first-anomaly.v1",
    trigger: "first-anomaly",
    channel: "inline",
    severity: "ambient",
    asset: { kind: "motion", poster: "anomaly-investigation", durationMs: 5_000 },
    copy: {
      label: "ANOMALY REGISTERED",
      title: {
        ru: "Аномальный паттерн зарегистрирован",
        en: "Anomalous pattern registered",
      },
      caption: {
        ru: "Канал переведён под активное наблюдение.",
        en: "The channel has been placed under active observation.",
      },
      stamp: "ANOM-01",
    },
    videoTier: "standard",
    dismissMode: "auto",
    oneShot: true,
  },
  {
    id: "cv.control-loss.v1",
    trigger: "control-loss",
    channel: "card",
    severity: "critical",
    asset: { kind: "motion", poster: "control-loss", durationMs: 6_000 },
    copy: {
      label: "CONTROL LOSS",
      title: {
        ru: "Контур управления утрачен",
        en: "Control surface partitioned",
      },
      caption: {
        ru: "Контур управления утрачен. Класс доступных директив изменён.",
        en: "Control surface partitioned. Available directive class has been restricted.",
      },
      stamp: "PARTITION-TICK",
    },
    videoTier: "standard",
    dismissMode: "tap",
    oneShot: false,
    cooldownMs: 240_000,
    contextFilter: (ctx) => Boolean(ctx.domain),
  },
];

const INSERT_INDEX: ReadonlyMap<string, MediaInsert> = new Map(
  MEDIA_INSERTS.map((insert) => [insert.id, insert]),
);

const TRIGGER_INDEX: ReadonlyMap<MediaTriggerKind, ReadonlyArray<MediaInsert>> =
  (() => {
    const buckets = new Map<MediaTriggerKind, MediaInsert[]>();
    for (const insert of MEDIA_INSERTS) {
      const list = buckets.get(insert.trigger) ?? [];
      list.push(insert);
      buckets.set(insert.trigger, list);
    }
    return new Map(
      Array.from(buckets, ([trigger, list]) => [trigger, list as ReadonlyArray<MediaInsert>]),
    );
  })();

export function getInsert(id: string): MediaInsert | undefined {
  return INSERT_INDEX.get(id);
}

export function getInsertsForTrigger(
  trigger: MediaTriggerKind,
): ReadonlyArray<MediaInsert> {
  return TRIGGER_INDEX.get(trigger) ?? [];
}

export function listInserts(): ReadonlyArray<MediaInsert> {
  return MEDIA_INSERTS;
}

/** Production default for `MediaRuntime`'s `resolveInsert` option. */
export const defaultResolveInsert: (id: string) => MediaInsert | undefined = getInsert;
