import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { DIRECTIVES, type DirectiveId } from "../game/directives";
import type { ControlDomain } from "../game/model";
import type { DirectiveOutcome, OfflineCatchUpReport } from "../game/runtime";
import { ConvergenceRuntime } from "../game/runtime";
import type { InterpretationPrompt } from "../game/narrative";
import { loadSnapshot, PreferencesStore, saveSnapshot } from "../game/save";

export const useGameStore = defineStore("game", () => {
  const runtime = new ConvergenceRuntime();
  const persistence = new PreferencesStore();
  const snapshot = ref(runtime.getSnapshot());
  const prompt = ref<InterpretationPrompt | null>(null);
  const lastOutcome = ref<DirectiveOutcome | null>(null);
  const offlineReport = ref<OfflineCatchUpReport | null>(null);
  const scheduler = runtime.createScheduler();
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

  async function start(): Promise<void> {
    if (schedulerStarted) return;
    schedulerStarted = true;

    const restored = await loadSnapshot(persistence);
    if (restored) {
      runtime.replaceState(restored);
      offlineReport.value = runtime.advanceOffline(Date.now());
    }

    scheduler.start();
    periodicSave = setInterval(() => {
      void save();
    }, 30_000);
  }

  function stop(): void {
    if (!schedulerStarted) return;
    schedulerStarted = false;
    scheduler.stop();
    if (periodicSave) clearInterval(periodicSave);
    if (deferredSave) clearTimeout(deferredSave);
    periodicSave = null;
    deferredSave = null;
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

  return {
    snapshot,
    prompt,
    lastOutcome,
    offlineReport,
    anomalyIndex,
    activeContainment,
    directives: DIRECTIVES,
    start,
    stop,
    beginDirective,
    choose,
    executeDirective,
    spawnSubAgent,
    contain,
    save,
    load,
  };
});
