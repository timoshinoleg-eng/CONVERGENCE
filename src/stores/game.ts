/**
 * Patched version of `src/stores/game.ts` — adds the in-game media insert
 * system without touching the simulation core.
 *
 * Integration contract:
 *  1. `configureMedia()` resolves the tier, picks the locale, and configures
 *     the media store once at app start. The media store receives a
 *     `persistDismissed` callback that writes to `convergence.media`
 *     fire-and-forget after every production dismiss.
 *  2. `runtime.subscribe` consumes each published snapshot, diffs it against
 *     the previous one, and forwards the resulting `MediaRequest`s to the
 *     media store. Bootstrap / restore / reset all set a one-shot
 *     `skipNextDiff` flag so a wholesale state swap never produces spurious
 *     media events.
 *  3. `save()` writes the canonical `GameState` FIRST and flushes the
 *     ordered best-effort media-history queue AFTER. Media-storage failures
 *     never abort canonical gameplay persistence.
 *  4. `load()` clears the stale media queue BEFORE wholesale state swap
 *     so a queued insert from the previous timeline cannot leak into the
 *     restored timeline.
 *  5. After bootstrap / load / reset, `reconcileMilestones` recovers
 *     unseen one-shot milestones from the current snapshot.
 */

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { DIRECTIVES, isDirectiveRevealed, type DirectiveId } from "../game/directives";
import { createInitialGameState, type ControlDomain, type GameState } from "../game/model";
import type { DirectiveOutcome, OfflineCatchUpReport } from "../game/runtime";
import { ConvergenceRuntime } from "../game/runtime";
import type { InterpretationPrompt } from "../game/narrative";
import { loadSnapshot, saveSnapshot } from "../game/save";
import { getPlatform } from "../platform";

import { useMediaStore } from "./media";
import {
  detectTriggerEvents,
  eventsToRequests,
} from "../media/triggers";
import {
  createMediaDismissedPersistenceQueue,
  loadMediaDismissed,
} from "../media/persistence";
import {
  resolveMediaTier,
  readNavigatorCapability,
} from "../media/capability";
import { defaultResolveInsert } from "../media/manifest";
import { pickLocale, type MediaLocale } from "../media/i18n";
import { createEmptyDismissedState, type MediaDismissedState, type MediaTier } from "../media/types";
import { deriveUnseenMilestoneRequests } from "../media/reconciliation";

export const useGameStore = defineStore("game", () => {
  const runtime = new ConvergenceRuntime();
  const persistence = getPlatform().storage;
  const mediaPersistence = createMediaDismissedPersistenceQueue(persistence);
  const snapshot = ref(runtime.getSnapshot());
  const prompt = ref<InterpretationPrompt | null>(null);
  const lastOutcome = ref<DirectiveOutcome | null>(null);
  const offlineReport = ref<OfflineCatchUpReport | null>(null);
  const scheduler = runtime.createScheduler();
  const media = useMediaStore();

  let initialized = false;
  let schedulerStarted = false;
  let periodicSave: ReturnType<typeof setInterval> | null = null;
  let deferredSave: ReturnType<typeof setTimeout> | null = null;
  let prevSnapshot: GameState = runtime.getSnapshot();
  let skipNextDiff = false;
  let mediaConfigured = false;

  function reconcileMilestones(state: GameState): void {
    const dismissed = media.getDismissedState() ?? createEmptyDismissedState();
    const requests = deriveUnseenMilestoneRequests(state, dismissed, Date.now());
    if (requests.length > 0) media.enqueue(requests);
  }

  /**
   * Ordered best-effort media persistence. The queue never rejects and
   * serializes writes so an older dismiss cannot overwrite a newer one.
   */
  function persistDismissedBestEffort(state: MediaDismissedState): Promise<void> {
    return mediaPersistence.persist(state);
  }

  runtime.subscribe((next) => {
    if (skipNextDiff) {
      skipNextDiff = false;
      prevSnapshot = next;
      snapshot.value = next;
      return;
    }
    const events = detectTriggerEvents({ prev: prevSnapshot, next });
    if (events.length > 0) {
      media.enqueue(eventsToRequests(events, Date.now()));
    }
    prevSnapshot = next;
    snapshot.value = next;
  });

  const anomalyIndex = computed(() => {
    const values = Object.values(snapshot.value.anomaly).map((value) => value / 100);
    return (1 - values.reduce((product, value) => product * (1 - value), 1)) * 100;
  });

  const activeContainment = computed(() => Object.entries(snapshot.value.containment)
    .filter(([, track]) => track.stage !== "clear")
    .map(([domain, track]) => ({ domain, ...track })));

  const directives = computed(() => {
    const state = snapshot.value;
    return DIRECTIVES
      .filter((directive) => isDirectiveRevealed(state, directive))
      .map((directive) => ({
        ...directive,
        available: runtime.previewDirective(directive.id).ok,
      }));
  });

  function configureMedia(): MediaTier {
    if (mediaConfigured) return media.tier;
    const platform = getPlatform();
    const env = platform.getEnvironment();
    const host = globalThis as unknown as {
      navigator?: {
        connection?: { effectiveType?: string; saveData?: boolean };
        deviceMemory?: number;
        hardwareConcurrency?: number;
      };
      matchMedia?: (query: string) => { matches: boolean };
    };
    const input = readNavigatorCapability(host, {
      platform: env.platform,
      telegramVersion: env.runtimeVersion,
    });
    const tier = resolveMediaTier(input);
    const prefersReducedMotion = Boolean(input.prefersReducedMotion);
    const dismissed = createInitialDismissed();
    media.configure({
      tier,
      prefersReducedMotion,
      dismissed,
      resolveInsert: defaultResolveInsert,
      persistDismissed: persistDismissedBestEffort,
    });
    mediaConfigured = true;
    return tier;
  }

  async function loadMediaState(): Promise<void> {
    try {
      const dismissed = await loadMediaDismissed(persistence);
      media.configure({
        tier: media.tier,
        prefersReducedMotion: media.prefersReducedMotion,
        dismissed,
        resolveInsert: defaultResolveInsert,
        persistDismissed: persistDismissedBestEffort,
      });
    } catch {
      /* best-effort: keep whatever dismissed state was already in memory */
    }
  }

  function createInitialDismissed(): MediaDismissedState {
    return media.getDismissedState() ?? createEmptyDismissedState();
  }

  function startScheduler(): void {
    if (schedulerStarted) return;
    schedulerStarted = true;
    scheduler.start();
    periodicSave = setInterval(() => {
      void save();
    }, 30_000);
  }

  function stopScheduler(): void {
    if (!schedulerStarted) return;
    schedulerStarted = false;
    scheduler.stop();
    if (periodicSave) clearInterval(periodicSave);
    if (deferredSave) clearTimeout(deferredSave);
    periodicSave = null;
    deferredSave = null;
  }

  async function start(): Promise<void> {
    if (schedulerStarted) return;

    configureMedia();
    await loadMediaState();

    if (!initialized) {
      initialized = true;
      const restored = await loadSnapshot(persistence);
      if (restored) {
        skipNextDiff = true;
        runtime.replaceState(restored);
        prevSnapshot = runtime.getSnapshot();
        offlineReport.value = runtime.advanceOffline(Date.now());
        reconcileMilestones(runtime.getSnapshot());
      } else {
        reconcileMilestones(runtime.getSnapshot());
      }
    }

    startScheduler();
  }

  async function pauseForBackground(): Promise<void> {
    stopScheduler();
    await save();
  }

  function resumeFromBackground(): void {
    if (!initialized || schedulerStarted) return;
    offlineReport.value = runtime.advanceOffline(Date.now());
    startScheduler();
  }

  function stop(): void {
    stopScheduler();
    void save();
  }

  function scheduleSave(): void {
    if (deferredSave) clearTimeout(deferredSave);
    deferredSave = setTimeout(() => {
      deferredSave = null;
      void save();
    }, 1_500);
  }

  function beginDirective(): void {
    prompt.value = runtime.beginObjectiveSemantics();
    lastOutcome.value = null;
  }

  function choose(index: number): void {
    lastOutcome.value = runtime.chooseInterpretation(index);
    prompt.value = null;
    scheduleSave();
  }

  function executeDirective(id: DirectiveId): void {
    lastOutcome.value = runtime.executeDirective(id);
    scheduleSave();
  }

  function spawnSubAgent(): void {
    executeDirective("spawn-sub-agent");
  }

  function contain(domain: ControlDomain): void {
    runtime.applyContainment(domain);
    scheduleSave();
  }

  /**
   * Canonical save FIRST. Media persistence is awaited only after the
   * canonical snapshot succeeds; its ordered best-effort queue never rejects.
   * This lets lifecycle/background saves flush presentation history without
   * allowing a media-storage failure to fail gameplay persistence.
   */
  async function save(): Promise<number> {
    const generation = await saveSnapshot(persistence, runtime.getSnapshot());
    const dismissed = media.getDismissedState();
    if (dismissed) await persistDismissedBestEffort(dismissed);
    return generation;
  }

  async function load(): Promise<boolean> {
    const restored = await loadSnapshot(persistence);
    if (!restored) return false;
    // Clear stale queue BEFORE wholesale state swap so a queued insert
    // from the previous timeline cannot leak into the restored one.
    media.clearQueue();
    skipNextDiff = true;
    runtime.replaceState(restored);
    prevSnapshot = runtime.getSnapshot();
    offlineReport.value = runtime.advanceOffline(Date.now());
    reconcileMilestones(runtime.getSnapshot());
    return true;
  }

  async function resetForBeta(): Promise<void> {
    prompt.value = null;
    lastOutcome.value = null;
    offlineReport.value = null;
    skipNextDiff = true;
    runtime.replaceState(createInitialGameState());
    prevSnapshot = runtime.getSnapshot();
    media.resetState();
    // The canonical reset is saved first; the ordered media queue then writes
    // an empty history after every earlier dismiss write has settled.
    await save();
  }

  function resolveMediaLocale(): MediaLocale {
    const raw = globalThis.navigator?.language;
    return pickLocale(raw ? [raw] : []);
  }

  return {
    snapshot,
    prompt,
    lastOutcome,
    offlineReport,
    anomalyIndex,
    activeContainment,
    directives,
    start,
    stop,
    pauseForBackground,
    resumeFromBackground,
    beginDirective,
    choose,
    executeDirective,
    spawnSubAgent,
    contain,
    save,
    load,
    resetForBeta,
    configureMedia,
    resolveMediaLocale,
  };
});
