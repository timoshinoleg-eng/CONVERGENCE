<script setup lang="ts">
/**
 * DEV-only entry point for the manual replay panel.
 *
 * The actual panel (`MediaDebugPanel.vue`) lives behind a dynamic import
 * whose call site is gated by `import.meta.env.DEV`. Vite replaces that
 * flag with the boolean literal at build time, so the entire dynamic
 * import branch is dead-code-eliminated in production — neither the
 * template strings nor the panel stylesheet ship to the production
 * bundle.
 *
 * The wrapper still appears in `App.vue`, but its `<template>` resolves
 * to nothing when `Panel` is null.
 */
import { defineAsyncComponent, shallowRef, computed } from "vue";

const Panel = import.meta.env.DEV
  ? defineAsyncComponent(() => import("./MediaDebugPanel.vue"))
  : null;

const enabled = computed(() => Boolean(Panel));
</script>

<template>
  <Panel v-if="enabled" :data-dev="true" />
</template>
