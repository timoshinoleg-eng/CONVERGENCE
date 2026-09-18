<script setup lang="ts">
/**
 * Overlay layer.
 *
 * Renders fullscreen + card inserts only. Inline inserts are mounted
 * separately via `<MediaInlineLayer />` inside the terminal panel — they
 * must NOT live at the document body, otherwise the inline beat no longer
 * sits in the inference log where the player expects it.
 *
 * `:key` uses `presentationKeyFor` so a fresh component lifecycle starts
 * for every QueueEntry. Same insert definition with a different
 * dedupeKey / request timestamp gets a distinct key — important for
 * repeating contextual inserts that re-arm after cooldown expiry.
 */
import { computed } from "vue";
import { useMediaStore } from "../../stores/media";
import InsertCard from "./InsertCard.vue";
import InsertFullscreen from "./InsertFullscreen.vue";
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
  <Teleport to="body">
    <template v-if="head && presentationKey && (head.insert.channel === 'fullscreen' || head.insert.channel === 'card')">
      <InsertFullscreen
        v-if="head.insert.channel === 'fullscreen'"
        :key="presentationKey"
        :insert="head.insert"
        :context="head.request.context"
        :locale="locale"
        @dismiss="onDismiss"
      />
      <InsertCard
        v-else
        :key="presentationKey"
        :insert="head.insert"
        :context="head.request.context"
        :locale="locale"
        @dismiss="onDismiss"
      />
    </template>
  </Teleport>
</template>
