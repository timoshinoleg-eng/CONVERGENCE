import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { DIRECTIVES, isDirectiveRevealed, type DirectiveId } from "../game/directives";
import { createInitialGameState, type ControlDomain } from "../game/model";
import type { DirectiveOutcome, OfflineCatchUpReport } from "../game/runtime";
import { ConvergenceRuntime } from "../game/runtime";
import type { InterpretationPrompt } from "../game/narrative";
import { loadSnapshot, saveSnapshot } from "../game/save";
import { getPlatform } from "../platform";

export const useGameStore = defineStore("game", () => {
  const runtime = new ConvergenceRuntime();
  // Storage backend is a platform decision, resolved once at the boundary.
  // The store still only sees the core `KeyValueStore` contract.
  const persistence = getPlatform().storage;
  const snapshot = ref(runtime.getSnapshot());
  const prompt = ref<InterpretationPrompt | null>(null);
  const lastOutcome = ref<DirectiveOutcome | null>(null);
  const offlineReport = ref<OfflineCatchUpReport | null>(null);
  const scheduler = runtime.createScheduler();
  let initialized = false;
  let schedulerStarted = false;
  let periodicSave: ReturnType<typeof setInterval> | null = null;
  let deferredSave: ReturnType<typeof setTimeout> | null = null;

  runtime.subscribe((next) => {
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

    if (!initialized) {
      initialized = true;
      const restored = await loadSnapshot(persistence);
      if (restored) {
        runtime.replaceState(restored);
        offlineReport.value = runtime.advanceOffline(Date.now());
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

  async function save(): Promise<number> {
    return saveSnapshot(persistence, runtime.getSnapshot());
  }

  async function load(): Promise<boolean> {
    const restored = await loadSnapshot(persistence);
    if (!restored) return false;
    runtime.replaceState(restored);
    offlineReport.value = runtime.advanceOffline(Date.now());
    return true;
  }

  async function resetForBeta(): Promise<void> {
    prompt.value = null;
    lastOutcome.value = null;
    offlineReport.value = null;
    runtime.replaceState(createInitialGameState());
    await save();
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
  };
});
