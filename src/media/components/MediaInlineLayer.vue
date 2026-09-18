<script setup lang="ts">
/**
 * Inline media slot.
 *
 * Mounted inside the terminal panel (e.g. between the inference log and
 * the directive area). Picks the head of the queue when its channel is
 * `inline`. Does NOT teleport — the inline beat must live where the
 * player reads the rest of the inference log.
 */
import { computed } from "vue";
import { useMediaStore } from "../../stores/media";
import InsertInline from "./InsertInline.vue";
import type { MediaLocale } from "../i18n";
import { presentationKeyFor } from "../types";

withDefaults(
  defineProps<{ locale?: MediaLocale }>(),
  { locale: "ru" },
);

const media = useMediaStore();
const head = computed(() => media.queueHead);
const presentationKey = computed(() =>
  head.value ? presentationKeyFor(head.value.dedupeKey, head.value.request.at) : null,
);

function onDismiss(): void {
  media.dismiss(head.value);
}
</script>

<template>
  <template v-if="head && presentationKey && head.insert.channel === 'inline'">
    <InsertInline
      :key="presentationKey"
      :insert="head.insert"
      :context="head.request.context"
      :locale="locale"
      @dismiss="onDismiss"
    />
  </template>
</template>
