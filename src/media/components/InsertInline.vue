<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import type { MediaInsert, MediaContext } from "../types";
import { lookupCopy, resolveHeadline, type MediaLocale } from "../i18n";
import { getPoster } from "../poster";
import { createAutoDismiss } from "../autoDismiss";
import { effectiveDurationMs } from "../assetPolicy";

const props = defineProps<{
  insert: MediaInsert;
  context?: MediaContext;
  locale: MediaLocale;
}>();

const emit = defineEmits<{ dismiss: [] }>();

const poster = computed(() => getPoster(props.insert.asset.poster));
const title = computed(() => lookupCopy(props.insert.copy, props.locale, "title"));
const caption = computed(() => lookupCopy(props.insert.copy, props.locale, "caption"));
const label = computed(
  () => resolveHeadline(props.insert.copy, props.locale) ?? props.insert.copy.label ?? props.insert.id,
);

// Inline inserts are always rendered in `static` mode (asset policy:
// `minimal` tier / reduced motion / inline channel all collapse to static).
// The duration is therefore read from the static-mode effective duration
// helper — a single source of truth shared with fullscreen and card.
const durationMs = computed(() => effectiveDurationMs(props.insert, "static"));

const autoDismiss = createAutoDismiss({
  get durationMs() { return durationMs.value; },
  get dismissMode() { return props.insert.dismissMode; },
  onDismiss: () => emit("dismiss"),
});

watch(
  () => props.insert,
  () => {
    autoDismiss.stop();
    autoDismiss.start();
  },
);

onMounted(autoDismiss.start);
onBeforeUnmount(autoDismiss.stop);

function onTap(): void {
  emit("dismiss");
}
</script>

<template>
  <aside
    class="cv-media-inline"
    :data-channel="insert.channel"
    role="status"
    aria-live="polite"
    @click="onTap"
  >
    <span v-if="insert.copy.stamp" class="cv-media-inline__stamp">{{ insert.copy.stamp }}</span>
    <span class="cv-media-inline__label">{{ label }}</span>
    <span v-if="title" class="cv-media-inline__title">{{ title }}</span>
    <span v-if="caption" class="cv-media-inline__caption">{{ caption }}</span>
    <span v-if="poster" class="cv-media-inline__badge" aria-hidden="true">▸</span>
  </aside>
</template>

<style scoped>
.cv-media-inline {
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: 10px;
  row-gap: 2px;
  align-items: center;
  padding: 11px 14px;
  min-height: 44px;
  border: 1px solid #2a5853;
  background: rgba(7, 24, 25, 0.92);
  border-left-width: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #bce8df;
  cursor: pointer;
  margin: 10px 0;
}
.cv-media-inline[data-channel="card"] { border-color: #3a8d83; }
.cv-media-inline[data-channel="fullscreen"] { border-color: #4da99d; }
.cv-media-inline__stamp {
  grid-column: 1 / -1;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: #4d8a82;
}
.cv-media-inline__label {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: #6faaa3;
}
.cv-media-inline__title {
  grid-column: 2;
  font-size: 12px;
  color: #d8f7ef;
}
.cv-media-inline__caption {
  grid-column: 1 / -1;
  font-size: 11px;
  color: #91ddd1;
}
.cv-media-inline__badge {
  font-size: 14px;
  color: #75f7d3;
  align-self: center;
}
</style>
