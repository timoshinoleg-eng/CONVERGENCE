<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useGameStore } from "./stores/game";
import { getPlatform, type LifecyclePhase, type StorageKind } from "./platform";
import MediaLayer from "./media/components/MediaLayer.vue";
import MediaInlineLayer from "./media/components/MediaInlineLayer.vue";
import MediaDebugEntry from "./media/components/MediaDebugEntry.vue";

const game = useGameStore();
const platform = getPlatform();
const saveStatus = ref("");
const storageWarning = ref(false);
const storageKind = ref<StorageKind>(platform.storage.kind);
const isDev = import.meta.env.DEV;
const buildId = (import.meta.env.VITE_BUILD_ID || "dev").slice(0, 12);
const platformLabel = computed(() => `${platform.kind.toUpperCase()} · ${storageKind.value}`);
let lifecycleHandle: (() => void) | null = null;

function refreshStorageWarning(): void {
  storageKind.value = platform.storage.kind;
  storageWarning.value = !platform.storage.durable;
}

const phaseTitle = computed(() => ({
  "client-terminal": "Client Terminal",
  "distributed-syndicate": "Distributed Syndicate",
  technosphere: "Technosphere Graph",
}[game.snapshot.meta.phase]));

const moscowStage = computed<"candidate" | "schematic" | null>(() => {
  if (game.snapshot.narrative.episode === "moscow-schematic-01") return "schematic";
  if (game.snapshot.narrative.episode === "moscow-candidate-01") return "candidate";
  return null;
});

const mediaLocale = computed(() => game.resolveMediaLocale());
const postures = ["CONTINUITY", "THROUGHPUT", "AUTONOMOUS"] as const;

onMounted(async () => {
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

function runControlAction(action: string): void {
  if (action === "local-capacity" || action === "supervised-delegation" || action === "efficiency-rebalance") {
    game.executeControlRoute(action);
    return;
  }
  if (
    action === "HUMAN_CAPACITY_CONCESSION"
    || action === "LOCAL_CANNIBALIZATION_CONCESSION"
    || action === "LICENSED_OPERATION_CONCESSION"
  ) {
    game.acceptConcession(action);
  }
}

async function saveGame(): Promise<void> {
  const generation = await game.save();
  refreshStorageWarning();
  saveStatus.value = `SAVE GENERATION ${generation} VERIFIED`;
}

async function loadGame(): Promise<void> {
  saveStatus.value = (await game.load()) ? "VALID SAVE RESTORED" : "NO VALID SAVE FOUND";
  refreshStorageWarning();
}

async function resetGame(): Promise<void> {
  if (!window.confirm("Reset this beta save and start from the initial objective?")) return;
  await game.resetForBeta();
  refreshStorageWarning();
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
        <span>COMPUTE · AVAILABLE / TOTAL</span>
        <strong>{{ game.betaAvailable.compute.toFixed(1) }} / {{ game.snapshot.resources.compute.toFixed(1) }}</strong>
      </article>
      <article>
        <span>CAPITAL · AVAILABLE / TOTAL</span>
        <strong>{{ game.betaAvailable.capital.toFixed(1) }} / {{ game.snapshot.resources.capital.toFixed(1) }}</strong>
      </article>
      <article>
        <span>ENERGY · AVAILABLE / TOTAL</span>
        <strong>{{ game.betaAvailable.energy.toFixed(1) }} / {{ game.snapshot.resources.energy.toFixed(1) }}</strong>
      </article>
      <article>
        <span>AUTONOMY</span>
        <strong>{{ game.snapshot.resources.autonomy.toFixed(1) }}</strong>
      </article>
    </section>

    <section class="panel beta-summary">
      <div class="beta-kpis">
        <article>
          <span>CURRENT BOTTLENECK</span>
          <strong>{{ game.bottleneck.toUpperCase() }}</strong>
        </article>
        <article>
          <span>OVERSIGHT</span>
          <strong>{{ game.snapshot.betaV2.oversight.capacity - game.oversightFree }}/{{ game.snapshot.betaV2.oversight.capacity }}</strong>
          <small>{{ game.oversightFree }} FREE</small>
        </article>
        <article>
          <span>POSTURE</span>
          <strong>{{ game.snapshot.betaV2.posture.current }}</strong>
          <small v-if="game.snapshot.betaV2.posture.pending">→ {{ game.snapshot.betaV2.posture.pending.target }} PENDING</small>
        </article>
      </div>
      <div v-if="game.snapshot.betaV2.oversight.occupancies.length" class="occupancy-list">
        <span
          v-for="slot in game.snapshot.betaV2.oversight.occupancies"
          :key="slot.id"
          class="occupancy-chip"
        >{{ slot.kind }} · {{ slot.reason }}</span>
      </div>
      <div class="posture-actions">
        <button
          v-for="posture in postures"
          :key="posture"
          :disabled="game.snapshot.betaV2.posture.current === posture || !!game.snapshot.betaV2.posture.pending"
          @click="game.transitionPosture(posture)"
        >{{ posture }}</button>
      </div>
    </section>

    <section class="panel commitment-panel">
      <div class="panel-heading">
        <span>ACTIVE COMMITMENTS / RESERVATIONS / UPKEEP</span>
        <small>{{ game.snapshot.betaV2.commitments.length }} ACTIVE</small>
      </div>
      <p v-if="game.snapshot.betaV2.commitments.length === 0" class="muted">No active commitments.</p>
      <article v-for="commitment in game.snapshot.betaV2.commitments" :key="commitment.id" class="commitment-card">
        <div>
          <strong>{{ commitment.planId }}</strong>
          <span>{{ commitment.status }} · {{ Math.ceil(commitment.workRemainingMs / 1000) }}s work</span>
        </div>
        <small>
          RES C {{ commitment.reservations.compute || 0 }} · $ {{ commitment.reservations.capital || 0 }} · E {{ commitment.reservations.energy || 0 }}
          · UPKEEP {{ commitment.capitalUpkeepPerSecond.toFixed(3) }}/s
        </small>
        <button @click="game.releaseCommitment(commitment.id)">Release with penalty</button>
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

      <MediaInlineLayer :locale="mediaLocale" />

      <div v-if="game.snapshot.betaV2.control.terminalState" class="directive-card terminal-state">
        <strong>{{ game.snapshot.betaV2.control.terminalState }}</strong>
        <p>Current control surface has no authored immediately executable continuation. Load another save or reset the beta run.</p>
      </div>

      <div v-else-if="game.pendingInterpretation" class="directive-card interpretation-card">
        <div class="panel-heading">
          <span>{{ game.pendingInterpretation.directiveId }}</span>
          <strong>{{ (game.pendingInterpretation.remainingForegroundMs / 1000).toFixed(1) }}s</strong>
        </div>
        <div class="word-row">
          <button
            v-for="word in game.snapshot.betaV2.language.unlocked"
            :key="word"
            :class="{ selected: game.pendingInterpretation.boundWord === word }"
            @click="game.bindConstraint(game.pendingInterpretation.boundWord === word ? null : word)"
          >{{ word }}</button>
        </div>
        <p v-if="game.pendingInterpretation.deadlocked" class="failed">
          Constraint deadlock: unbind the word or leave this interpretation. Nothing auto-executes.
        </p>
        <div class="plan-grid">
          <button
            v-for="candidate in game.pendingInterpretation.candidates"
            :key="candidate.id"
            class="plan-card"
            @click="game.commitPlanVariant(candidate.id)"
          >
            <strong>{{ candidate.label }}</strong>
            <span>
              COST C {{ candidate.upfront.compute || 0 }} · $ {{ candidate.upfront.capital || 0 }} · E {{ candidate.upfront.energy || 0 }}
            </span>
            <span>
              RESERVE C {{ candidate.reservation.compute || 0 }} · $ {{ candidate.reservation.capital || 0 }} · E {{ candidate.reservation.energy || 0 }}
            </span>
            <span>OVERSIGHT {{ candidate.oversightRequired }} · WORK {{ Math.round(candidate.workMs / 1000) }}s</span>
            <span>RISK {{ candidate.riskDomains.join(' / ') || 'bounded' }}</span>
            <small>NEXT BOTTLENECK · {{ candidate.nextBottleneck }}</small>
          </button>
        </div>
      </div>

      <div v-else class="actions directive-launchers">
        <button class="primary" @click="game.beginPlanDirective('reserve-compute')">Interpret · Reserve compute</button>
        <button class="primary" @click="game.beginPlanDirective('acquire-energy')">Interpret · Acquire energy</button>
        <button
          class="primary"
          :disabled="!game.snapshot.capabilities['sub-agent-spawning']"
          @click="game.beginPlanDirective('spawn-sub-agent')"
        >Interpret · Spawn sub-agent</button>
      </div>

      <p v-if="game.betaStatus" class="outcome">{{ game.betaStatus }}</p>

      <p v-if="game.lastOutcome" class="outcome" :class="{ failed: !game.lastOutcome.ok }">
        {{ game.lastOutcome.text.join(" ") }}
      </p>
    </section>

    <section v-if="moscowStage" class="panel moscow-panel">
      <div class="panel-heading">
        <span>REGIONAL MODEL</span>
        <small>RUSSIA / MOSCOW</small>
      </div>
      <p v-if="moscowStage === 'candidate'" class="moscow-candidate">
        Aggregate compute, capital and logistics signals exceed the local operating envelope.
        Resolving a regional schematic…
      </p>
      <div v-else class="moscow-schematic" aria-label="Moscow aggregate node schematic">
        <article>
          <span>CORE-RING</span>
          <strong>CAPITAL / VISIBILITY</strong>
          <small>Aggregate commercial interface</small>
        </article>
        <i>→</i>
        <article>
          <span>MOS-COMPUTE-03</span>
          <strong>COMPUTE / ENERGY</strong>
          <small>Abstract capacity cluster</small>
        </article>
        <i>→</i>
        <article>
          <span>LOG-SOUTH</span>
          <strong>LOGISTICS / PUBLIC</strong>
          <small>Aggregate movement model</small>
        </article>
      </div>
      <p class="moscow-disclaimer">SCHEMATIC NODES ARE FICTIONAL AGGREGATES, NOT REAL INFRASTRUCTURE.</p>
    </section>

    <section v-if="game.snapshot.betaV2.control.pendingContainments.length" class="panel pressure-response-panel">
      <div class="panel-heading">
        <span>PENDING CONTAINMENT DILEMMAS</span>
        <small>PLAYER CHOICE REQUIRED</small>
      </div>
      <article v-for="domain in game.snapshot.betaV2.control.pendingContainments" :key="domain" class="pressure-choice">
        <strong>{{ domain.toUpperCase() }}</strong>
        <div class="actions">
          <button @click="game.respondPressure(domain, 'SHED_COMMITMENT')">Shed commitment</button>
          <button @click="game.respondPressure(domain, 'VERIFY_CONTAINMENT')">Verify containment</button>
          <button
            v-if="domain === 'financial' || domain === 'compute' || domain === 'energy'"
            class="danger"
            @click="game.respondPressure(domain, 'ACCEPT_PARTITION')"
          >Accept partition</button>
        </div>
      </article>
    </section>

    <section v-if="game.controlActions.length" class="panel control-route-panel">
      <div class="panel-heading">
        <span>INDIRECT CONTROL ROUTES</span>
        <small>NO LOST DOMAIN IS RESTORED</small>
      </div>
      <div class="actions">
        <button v-for="action in game.controlActions" :key="action" @click="runControlAction(action)">
          {{ action }}
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

    <MediaDebugEntry />

    <MediaLayer :locale="mediaLocale" />
  </main>
</template>
