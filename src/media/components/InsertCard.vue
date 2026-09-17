<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { MediaInsert, MediaContext } from "../types";
import { lookupCopy, resolveHeadline, type MediaLocale } from "../i18n";
import { getPoster } from "../poster";
import { useMediaStore } from "../../stores/media";
import { resolveAssetMode, effectiveDurationMs } from "../assetPolicy";
import { TimerController } from "../timer";

const props = defineProps<{
  insert: MediaInsert;
  context?: MediaContext;
  locale: MediaLocale;
}>();

const emit = defineEmits<{ dismiss: [] }>();

const media = useMediaStore();

const poster = computed(() => getPoster(props.insert.asset.poster));
const title = computed(() => lookupCopy(props.insert.copy, props.locale, "title"));
const caption = computed(() => lookupCopy(props.insert.copy, props.locale, "caption"));
const label = computed(
  () => resolveHeadline(props.insert.copy, props.locale) ?? props.insert.copy.label ?? props.insert.id,
);

const mode = computed(() => resolveAssetMode({
  insert: props.insert,
  tier: media.tier,
  prefersReducedMotion: media.prefersReducedMotion,
}));

const durationMs = computed(() => effectiveDurationMs(props.insert, mode.value));

const videoErrored = ref(false);

function onVideoError(): void {
  videoErrored.value = true;
}

const showVideo = computed(() => mode.value === "video" && !videoErrored.value && Boolean(props.insert.asset.src));

const elapsedSeconds = ref(0);
let timer: TimerController | null = null;
let raf: ReturnType<typeof requestAnimationFrame> | null = null;
let autoTimer: ReturnType<typeof setTimeout> | null = null;

function startTimer(): void {
  if (timer) timer.reset();
  else timer = new TimerController({ durationMs: durationMs.value });
  timer.start();
  if (props.insert.dismissMode === "auto") {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => emit("dismiss"), durationMs.value);
  }
  if (mode.value !== "static") {
    const loop = (): void => {
      const elapsed = timer?.tick();
      if (timer?.isFinished()) {
        elapsedSeconds.value = durationMs.value / 1000;
        return;
      }
      elapsedSeconds.value = (elapsed ?? 0) / 1000;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  } else {
    elapsedSeconds.value = 0;
  }
}

function stopTimer(): void {
  if (raf) cancelAnimationFrame(raf);
  if (autoTimer) clearTimeout(autoTimer);
  raf = null;
  autoTimer = null;
  timer = null;
}

watch(
  () => props.insert,
  () => {
    videoErrored.value = false;
    stopTimer();
    startTimer();
  },
  { immediate: false },
);

onMounted(startTimer);
onBeforeUnmount(stopTimer);

function onBackdrop(): void {
  emit("dismiss");
}
function onTap(): void {
  if (props.insert.dismissMode === "tap") emit("dismiss");
}
</script>

<template>
  <div class="cv-media-card-overlay" role="dialog" aria-modal="true" @click.self="onBackdrop">
    <article class="cv-media-card" :data-severity="insert.severity" @click="onTap">
      <header>
        <span class="cv-media-card__label">{{ label }}</span>
        <span v-if="insert.copy.stamp" class="cv-media-card__stamp">{{ insert.copy.stamp }}</span>
      </header>
      <div class="cv-media-card__visual" :class="{ motion: mode === 'motion' && !showVideo }">
        <div v-if="poster" class="cv-media-card__poster" v-html="poster.svg" />
        <video
          v-if="showVideo && insert.asset.src"
          class="cv-media-card__video"
          :src="insert.asset.src"
          autoplay
          muted
          playsinline
          preload="metadata"
          @error="onVideoError"
        />
        <span v-if="mode !== 'static'" class="cv-media-card__duration">
          {{ Math.max(0, Math.round(durationMs / 1000 - elapsedSeconds)) }}s
        </span>
      </div>
      <div class="cv-media-card__copy">
        <h2 v-if="title" class="cv-media-card__title">{{ title }}</h2>
        <p v-if="caption" class="cv-media-card__caption">{{ caption }}</p>
      </div>
      <footer>
        <small>{{ insert.dismissMode === "auto" ? "AUTO" : "TAP TO CONTINUE" }}</small>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.cv-media-card-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(2, 8, 9, 0.66);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  display: grid;
  align-items: center;
  justify-items: center;
  padding: max(16px, var(--cv-safe-top, 0px)) 16px max(24px, var(--cv-safe-bottom, 0px));
  touch-action: manipulation;
}
.cv-media-card {
  width: min(420px, 100%);
  max-height: calc(var(--cv-viewport-height, 100vh) - 32px);
  overflow: auto;
  border: 1px solid #28534f;
  background: linear-gradient(180deg, rgba(7, 21, 22, 0.96), rgba(5, 14, 15, 0.94));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #d8f7ef;
  padding: 14px;
  display: grid;
  gap: 10px;
}
.cv-media-card[data-severity="critical"] { border-color: #8b4943; }
.cv-media-card[data-severity="incident"] { border-color: #5b4630; }
.cv-media-card[data-severity="signal"] { border-color: #3a8d83; }
.cv-media-card[data-severity="ambient"] { border-color: #214a45; }
.cv-media-card header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: #6faaa3;
}
.cv-media-card__label { color: #75f7d3; }
.cv-media-card__stamp { color: #3e8078; }
.cv-media-card__visual {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 12;
  border: 1px solid #183334;
  overflow: hidden;
  background: #02080a;
}
.cv-media-card__poster,
.cv-media-card__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cv-media-card__visual.motion .cv-media-card__poster {
  animation: cv-card-drift 12s linear infinite;
}
@keyframes cv-card-drift {
  0% { transform: translate3d(0, 0, 0) scale(1.02); }
  50% { transform: translate3d(-1.5%, -1%, 0) scale(1.04); }
  100% { transform: translate3d(0, 0, 0) scale(1.02); }
}
.cv-media-card__duration {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: #bce8df;
  background: rgba(5, 14, 15, 0.7);
  border: 1px solid #28534f;
  padding: 2px 6px;
}
.cv-media-card__title { margin: 0; font-size: 16px; font-weight: 540; letter-spacing: -0.01em; }
.cv-media-card__caption { margin: 4px 0 0; font-size: 12px; line-height: 1.55; color: #a5c8c2; }
.cv-media-card footer { display: flex; justify-content: flex-end; font-size: 9px; letter-spacing: 0.18em; color: #4d8a82; }

@media (prefers-reduced-motion: reduce) {
  .cv-media-card__visual.motion .cv-media-card__poster { animation: none; }
}
</style>
