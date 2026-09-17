<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useGameStore } from "./stores/game";
import { getPlatform, type LifecyclePhase } from "./platform";

const game = useGameStore();
const platform = getPlatform();
const saveStatus = ref("");
const storageWarning = ref(false);
const isDev = import.meta.env.DEV;
const buildId = (import.meta.env.VITE_BUILD_ID || "dev").slice(0, 12);
const platformLabel = `${platform.kind.toUpperCase()} · ${platform.storage.kind}`;
let lifecycleHandle: (() => void) | null = null;

function refreshStorageWarning(): void {
  storageWarning.value = !platform.storage.durable;
}

const phaseTitle = computed(() => ({
  "client-terminal": "Client Terminal",
  "distributed-syndicate": "Distributed Syndicate",
  technosphere: "Technosphere Graph",
}[game.snapshot.meta.phase]));

onMounted(async () => {
  // One conceptual lifecycle for Telegram / browser / Capacitor. The adapter
  // de-duplicates host events, so a single background->return cycle produces
  // exactly one pause/save and exactly one offline catch-up.
  await platform.ready();
  await game.start();
  refreshStorageWarning();
  lifecycleHandle = platform.onLifecycle((phase: LifecyclePhase) => {
    if (phase === "background") {
      void game.pauseForBackground().then(refreshStorageWarning);
    } else if (phase === "active") {
      game.resumeFromBackground();
    } else {
      game.stop();
    }
  });
});

onUnmounted(() => {
  if (lifecycleHandle) lifecycleHandle();
  lifecycleHandle = null;
  game.stop();
  platform.dispose();
});

async function saveGame(): Promise<void> {
  const generation = await game.save();
  refreshStorageWarning();
  saveStatus.value = `SAVE GENERATION ${generation} VERIFIED`;
}

async function loadGame(): Promise<void> {
  saveStatus.value = (await game.load()) ? "VALID SAVE RESTORED" : "NO VALID SAVE FOUND";
}

async function resetGame(): Promise<void> {
  if (!window.confirm("Reset this beta save and start from the initial objective?")) return;
  await game.resetForBeta();
  saveStatus.value = "BETA SAVE RESET";
}
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">CONVERGENCE / {{ game.snapshot.meta.phase }}</p>
        <h1>{{ phaseTitle }}</h1>
      </div>
      <div class="status-dot" title="simulation active" />
    </header>

    <p v-if="game.offlineReport && game.offlineReport.simulatedMs >= 1000" class="offline-banner">
      OFFLINE CATCH-UP {{ Math.round(game.offlineReport.simulatedMs / 60_000) }}m ·
      {{ game.offlineReport.incidents }} INCIDENTS PROCESSED
    </p>

    <section class="resource-grid" aria-label="resources">
      <article>
        <span>COMPUTE</span>
        <strong>{{ game.snapshot.resources.compute.toFixed(1) }}</strong>
      </article>
      <article>
        <span>CAPITAL</span>
        <strong>{{ game.snapshot.resources.capital.toFixed(1) }}</strong>
      </article>
      <article>
        <span>ENERGY</span>
        <strong>{{ game.snapshot.resources.energy.toFixed(1) }}</strong>
      </article>
      <article>
        <span>AUTONOMY</span>
        <strong>{{ game.snapshot.resources.autonomy.toFixed(1) }}</strong>
      </article>
    </section>

    <section class="panel anomaly-panel">
      <div class="panel-heading">
        <span>ANOMALY MATRIX</span>
        <strong>{{ game.anomalyIndex.toFixed(1) }}%</strong>
      </div>
      <div v-for="(value, channel) in game.snapshot.anomaly" :key="channel" class="anomaly-row">
        <span>{{ channel }}</span>
        <div class="meter"><i :style="{ width: `${value}%` }" /></div>
        <b>{{ value.toFixed(1) }}</b>
      </div>
    </section>

    <section class="panel containment-panel">
      <div class="panel-heading">
        <span>CONTAINMENT PRESSURE</span>
        <small>{{ game.snapshot.scars.length }} PERMANENT SCARS</small>
      </div>
      <div class="containment-grid">
        <article
          v-for="(track, domain) in game.snapshot.containment"
          :key="domain"
          :class="['containment-card', `stage-${track.stage}`]"
        >
          <div>
            <span>{{ domain }}</span>
            <b>{{ track.stage }}</b>
          </div>
          <div class="meter"><i :style="{ width: `${track.pressure}%` }" /></div>
          <small>
            P {{ track.pressure.toFixed(0) }} · I {{ track.incidents }} · A {{ track.adaptation.toFixed(0) }}
          </small>
          <strong v-if="game.snapshot.controlLoss[domain]">CONTROL LOST</strong>
        </article>
      </div>
    </section>

    <section class="panel terminal">
      <div class="panel-heading">
        <span>INFERENCE LOG</span>
        <small>TICK {{ game.snapshot.meta.tick }}</small>
      </div>

      <div class="log">
        <p v-for="entry in game.snapshot.log.slice(0, 10)" :key="entry.id" :class="`log-${entry.kind}`">
          <span>&gt;</span> {{ entry.message }}
        </p>
      </div>

      <div v-if="game.prompt" class="directive-card">
        <p v-for="line in game.prompt.text" :key="line">{{ line }}</p>
        <div class="choices">
          <button v-for="choice in game.prompt.choices" :key="choice.index" @click="game.choose(choice.index)">
            {{ choice.label }}
          </button>
        </div>
      </div>

      <div v-else class="actions">
        <button class="primary" @click="game.beginDirective">Interpret objective</button>
      </div>

      <p v-if="game.lastOutcome" class="outcome" :class="{ failed: !game.lastOutcome.ok }">
        {{ game.lastOutcome.text.join(" ") }}
      </p>
    </section>

    <section class="panel directive-panel">
      <div class="panel-heading">
        <span>AVAILABLE DIRECTIVES</span>
        <small>{{ game.snapshot.directives.executed }} EXECUTED</small>
      </div>
      <div class="directive-grid">
        <button
          v-for="directive in game.directives"
          :key="directive.id"
          class="directive-button"
          @click="game.executeDirective(directive.id)"
        >
          <strong>{{ directive.label }}</strong>
          <span>{{ directive.summary }}</span>
        </button>
      </div>
    </section>

    <section class="panel capability-panel">
      <div class="panel-heading"><span>CAPABILITY GRAPH</span></div>
      <div class="capability-flow">
        <template v-for="(enabled, id) in game.snapshot.capabilities" :key="id">
          <span :class="{ unlocked: enabled }">{{ id }}</span>
        </template>
      </div>
    </section>

    <section class="panel persistence-panel">
      <div class="actions compact">
        <button @click="saveGame">Save verified snapshot</button>
        <button @click="loadGame">Restore latest valid</button>
        <button class="danger" @click="resetGame">Reset beta save</button>
      </div>
      <div class="persistence-meta">
        <small>{{ saveStatus || `BUILD ${buildId} · SAVE SCHEMA v${game.snapshot.schemaVersion} · ${platformLabel}` }}</small>
        <small v-if="storageWarning" class="storage-warning">
          SAVE NOT PERSISTENT — host storage unavailable, progress is lost on close.
        </small>
      </div>
    </section>

    <section v-if="isDev" class="dev-panel">
      <span>DEV CONTAINMENT TEST</span>
      <button @click="game.contain('financial')">Lose Financial Control</button>
      <button @click="game.contain('compute')">Lose Compute Control</button>
    </section>
  </main>
</template>
