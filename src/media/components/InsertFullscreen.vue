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

const autoTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const raf = ref<number | null>(null);
const elapsedSeconds = ref(0);
let timer: TimerController | null = null;

function startTimer(): void {
  if (autoTimer.value) clearTimeout(autoTimer.value);
  if (raf.value !== null) cancelAnimationFrame(raf.value);
  if (timer) timer.reset();
  else timer = new TimerController({ durationMs: durationMs.value });
  timer.start();
  if (props.insert.dismissMode === "auto") {
    autoTimer.value = setTimeout(() => emit("dismiss"), durationMs.value);
  }
  if (mode.value !== "static") {
    const loop = (): void => {
      const elapsed = timer?.tick();
      if (timer?.isFinished()) {
        elapsedSeconds.value = durationMs.value / 1000;
        raf.value = null;
        return;
      }
      elapsedSeconds.value = (elapsed ?? 0) / 1000;
      raf.value = requestAnimationFrame(loop);
    };
    raf.value = requestAnimationFrame(loop);
  } else {
    elapsedSeconds.value = 0;
  }
}

function stopTimer(): void {
  if (autoTimer.value) clearTimeout(autoTimer.value);
  if (raf.value !== null) cancelAnimationFrame(raf.value);
  autoTimer.value = null;
  raf.value = null;
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

function onTap(): void {
  if (props.insert.dismissMode === "tap") {
    emit("dismiss");
  }
}

const showVideo = computed(() => mode.value === "video" && !videoErrored.value && Boolean(props.insert.asset.src));
const showMotionPoster = computed(() => mode.value !== "static" && Boolean(poster.value) && !showVideo.value);
</script>

<template>
  <section
    class="cv-media-fullscreen"
    :data-severity="insert.severity"
    @click="onTap"
    role="dialog"
    aria-modal="true"
  >
    <div class="cv-media-fullscreen__stage" :class="{ motion: showMotionPoster }">
      <div v-if="poster" class="cv-media-fullscreen__poster" v-html="poster.svg" />
      <video
        v-if="showVideo && insert.asset.src"
        class="cv-media-fullscreen__video"
        :src="insert.asset.src"
        autoplay
        muted
        playsinline
        preload="metadata"
        @error="onVideoError"
      />
      <div class="cv-media-fullscreen__veil" />
      <div class="cv-media-fullscreen__scanlines" aria-hidden="true" />
    </div>
    <div class="cv-media-fullscreen__panel">
      <span class="cv-media-fullscreen__label">{{ label }}</span>
      <h1 v-if="title" class="cv-media-fullscreen__title">{{ title }}</h1>
      <p v-if="caption" class="cv-media-fullscreen__caption">{{ caption }}</p>
      <div class="cv-media-fullscreen__meta">
        <span v-if="insert.copy.stamp">{{ insert.copy.stamp }}</span>
        <span>{{ insert.dismissMode === "auto" ? "AUTO" : "TAP TO CONTINUE" }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cv-media-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #020608;
  display: grid;
  grid-template-rows: 1fr auto;
  touch-action: manipulation;
  padding-top: max(0px, var(--cv-safe-top, 0px));
  padding-bottom: max(0px, var(--cv-safe-bottom, 0px));
}
.cv-media-fullscreen__stage {
  position: relative;
  overflow: hidden;
  background: #02080a;
}
.cv-media-fullscreen__poster,
.cv-media-fullscreen__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cv-media-fullscreen__stage.motion .cv-media-fullscreen__poster {
  animation: cv-fs-drift 18s ease-in-out infinite alternate;
  transform-origin: center;
}
@keyframes cv-fs-drift {
  0% { transform: scale(1.05) translate3d(0, 0, 0); }
  100% { transform: scale(1.1) translate3d(-1.2%, -1%, 0); }
}
.cv-media-fullscreen__veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(2, 6, 8, 0.25) 0, rgba(2, 6, 8, 0.65) 60%, rgba(2, 6, 8, 0.95) 100%);
}
.cv-media-fullscreen__scanlines {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 3px);
  pointer-events: none;
  mix-blend-mode: overlay;
  opacity: 0.4;
}
.cv-media-fullscreen__panel {
  padding: 18px 22px max(20px, env(safe-area-inset-bottom, 0px));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #d8f7ef;
  background: linear-gradient(180deg, rgba(2, 6, 8, 0.92), rgba(2, 6, 8, 1));
  border-top: 1px solid #183334;
}
.cv-media-fullscreen__label {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: #75f7d3;
}
.cv-media-fullscreen__title {
  margin: 8px 0 0;
  font-size: clamp(20px, 6vw, 30px);
  font-weight: 540;
  letter-spacing: -0.02em;
}
.cv-media-fullscreen__caption {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #a5c8c2;
}
.cv-media-fullscreen__meta {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: #4d8a82;
}
.cv-media-fullscreen[data-severity="critical"] .cv-media-fullscreen__panel { border-top-color: #8b4943; }
.cv-media-fullscreen[data-severity="incident"] .cv-media-fullscreen__panel { border-top-color: #5b4630; }
.cv-media-fullscreen[data-severity="signal"] .cv-media-fullscreen__panel { border-top-color: #3a8d83; }

@media (prefers-reduced-motion: reduce) {
  .cv-media-fullscreen__stage.motion .cv-media-fullscreen__poster { animation: none; }
  .cv-media-fullscreen__scanlines { display: none; }
}
</style>
