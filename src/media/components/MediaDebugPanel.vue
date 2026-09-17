<script setup lang="ts">
/**
 * DEV-only manual replay panel.
 *
 * Each REPLAY button pushes a synthetic request through the runtime's
 * `pushPreview` path, which bypasses seen / cooldown / contextFilter and
 * does NOT update dismissed state on dismiss. Designers can therefore
 * re-watch any built-in insert without polluting production history.
 *
 * For inserts with a `contextFilter` that requires `domain`, the panel
 * supplies a safe fictitious `financial` context so the request is valid.
 * The fictitious domain is identical for every replay — it never reaches
 * the production media history, so no semantic drift is possible.
 */
import { listInserts } from "../manifest";
import { useMediaStore } from "../../stores/media";
import type { MediaContext } from "../types";

const media = useMediaStore();
const inserts = listInserts();

function replay(id: string): void {
  const insert = inserts.find((entry) => entry.id === id);
  if (!insert) return;
  // Build a safe context. If the manifest expects a domain (control-loss),
  // supply a fictitious but valid `financial`. Otherwise the request is
  // sent without context.
  const needsDomain = typeof insert.contextFilter === "function";
  const context: MediaContext | undefined = needsDomain
    ? { domain: "financial" }
    : undefined;
  media.previewEnqueue([{ insertId: id, at: Date.now(), context }]);
}
</script>

<template>
  <section class="cv-media-debug" v-if="$attrs['data-dev'] === true">
    <header>MEDIA · MANUAL TRIGGERS</header>
    <ul>
      <li v-for="insert in inserts" :key="insert.id">
        <code>{{ insert.id }}</code>
        <span>{{ insert.copy.label ?? insert.trigger }}</span>
        <button @click="replay(insert.id)">REPLAY</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.cv-media-debug {
  border: 1px dashed #513836;
  background: #0a0606;
  padding: 10px 12px;
  margin-top: 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #d6948f;
}
.cv-media-debug header {
  font-size: 10px;
  letter-spacing: 0.16em;
  margin-bottom: 8px;
}
.cv-media-debug ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.cv-media-debug li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  font-size: 10px;
  align-items: center;
  min-height: 32px;
}
.cv-media-debug code { color: #75f7d3; }
.cv-media-debug button {
  font-size: 9px;
  padding: 6px 8px;
  min-height: 32px;
}
</style>
