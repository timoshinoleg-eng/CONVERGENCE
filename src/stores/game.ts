import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { ControlDomain } from "../game/model";
import type { DirectiveOutcome } from "../game/runtime";
import { ConvergenceRuntime } from "../game/runtime";
import type { InterpretationPrompt } from "../game/narrative";
import { loadSnapshot, PreferencesStore, saveSnapshot } from "../game/save";

export const useGameStore = defineStore("game", () => {
  const runtime = new ConvergenceRuntime();
  const persistence = new PreferencesStore();
  const snapshot = ref(runtime.getSnapshot());
  const prompt = ref<InterpretationPrompt | null>(null);
  const lastOutcome = ref<DirectiveOutcome | null>(null);
  const scheduler = runtime.createScheduler();
  let schedulerStarted = false;

  runtime.subscribe((next) => {
    snapshot.value = next;
  });

  const anomalyIndex = computed(() => {
    const values = Object.values(snapshot.value.anomaly).map((value) => value / 100);
    return (1 - values.reduce((product, value) => product * (1 - value), 1)) * 100;
  });

  function start(): void {
    if (schedulerStarted) return;
    schedulerStarted = true;
    scheduler.start();
  }

  function stop(): void {
    if (!schedulerStarted) return;
    schedulerStarted = false;
    scheduler.stop();
  }

  function beginDirective(): void {
    prompt.value = runtime.beginObjectiveSemantics();
    lastOutcome.value = null;
  }

  function choose(index: number): void {
    lastOutcome.value = runtime.chooseInterpretation(index);
    prompt.value = null;
  }

  function spawnSubAgent(): void {
    lastOutcome.value = runtime.spawnSubAgent();
  }

  function contain(domain: ControlDomain): void {
    runtime.applyContainment(domain);
  }

  async function save(): Promise<number> {
    return saveSnapshot(persistence, runtime.getSnapshot());
  }

  async function load(): Promise<boolean> {
    const restored = await loadSnapshot(persistence);
    if (!restored) return false;
    runtime.replaceState(restored);
    return true;
  }

  return {
    snapshot,
    prompt,
    lastOutcome,
    anomalyIndex,
    start,
    stop,
    beginDirective,
    choose,
    spawnSubAgent,
    contain,
    save,
    load,
  };
});
