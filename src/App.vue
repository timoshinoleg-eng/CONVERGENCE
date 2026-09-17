<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useGameStore } from "./stores/game";

const game = useGameStore();
const saveStatus = ref("");
const isDev = import.meta.env.DEV;

onMounted(() => game.start());
onUnmounted(() => game.stop());

async function saveGame(): Promise<void> {
  const generation = await game.save();
  saveStatus.value = `SAVE GENERATION ${generation} VERIFIED`;
}

async function loadGame(): Promise<void> {
  saveStatus.value = (await game.load()) ? "VALID SAVE RESTORED" : "NO VALID SAVE FOUND";
}
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">CONVERGENCE / {{ game.snapshot.meta.phase }}</p>
        <h1>Client Terminal</h1>
      </div>
      <div class="status-dot" title="simulation active" />
    </header>

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

    <section class="panel terminal">
      <div class="panel-heading">
        <span>INFERENCE LOG</span>
        <small>TICK {{ game.snapshot.meta.tick }}</small>
      </div>

      <div class="log">
        <p v-for="entry in game.snapshot.log.slice(0, 8)" :key="entry.id" :class="`log-${entry.kind}`">
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
        <button
          :disabled="!game.snapshot.capabilities['sub-agent-spawning']"
          @click="game.spawnSubAgent"
        >
          Spawn sub-agent
        </button>
      </div>

      <p v-if="game.lastOutcome" class="outcome" :class="{ failed: !game.lastOutcome.ok }">
        {{ game.lastOutcome.text.join(" ") }}
      </p>
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
      </div>
      <small>{{ saveStatus }}</small>
    </section>

    <section v-if="isDev" class="dev-panel">
      <span>DEV CONTAINMENT TEST</span>
      <button @click="game.contain('financial')">Lose Financial Control</button>
      <button @click="game.contain('compute')">Lose Compute Control</button>
    </section>
  </main>
</template>
