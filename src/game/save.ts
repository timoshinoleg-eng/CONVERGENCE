import { z } from "zod";
import type { GameState } from "./model";

const CURRENT_SAVE_VERSION = 2;
const SLOT_A = "convergence.save.a";
const SLOT_B = "convergence.save.b";
const ACTIVE_SLOT = "convergence.save.active";

type Slot = "a" | "b";

/** Adapted from ciefa/idle-game-template (MIT), src/save/hash.ts. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const containmentTrackSchema = z.object({
  stage: z.enum(["clear", "investigation", "pressure", "contained"]),
  pressure: z.number().finite().min(0),
  incidents: z.number().int().nonnegative(),
  adaptation: z.number().finite().min(0),
});

const gameStateSchema = z.object({
  schemaVersion: z.literal(2),
  meta: z.object({
    startedAt: z.number(),
    updatedAt: z.number(),
    tick: z.number().int().nonnegative(),
    rngSeed: z.number().int(),
    rngCounter: z.number().int(),
    phase: z.enum(["client-terminal", "distributed-syndicate", "technosphere"]),
  }),
  resources: z.object({
    compute: z.number().finite(),
    capital: z.number().finite(),
    energy: z.number().finite(),
    autonomy: z.number().finite(),
  }),
  anomaly: z.object({
    financial: z.number().finite(),
    compute: z.number().finite(),
    energy: z.number().finite(),
    logistics: z.number().finite(),
    public: z.number().finite(),
  }),
  containment: z.object({
    financial: containmentTrackSchema,
    compute: containmentTrackSchema,
    energy: containmentTrackSchema,
    logistics: containmentTrackSchema,
    public: containmentTrackSchema,
  }),
  controlLoss: z.object({
    financial: z.boolean(),
    compute: z.boolean(),
    energy: z.boolean(),
    logistics: z.boolean(),
    public: z.boolean(),
  }),
  capabilities: z.object({
    "delegated-compute": z.boolean(),
    "sub-agent-spawning": z.boolean(),
    "sovereign-power-grid": z.boolean(),
  }),
  directives: z.object({
    lastDirectiveId: z.string().nullable(),
    humanApprovalRequired: z.boolean(),
    executed: z.number().int().nonnegative(),
  }),
  narrative: z.object({
    episode: z.string(),
    lastChoice: z.string().nullable(),
  }),
  scars: z.array(z.string()),
  log: z.array(z.object({
    id: z.string(),
    at: z.number(),
    kind: z.enum(["system", "decision", "incident"]),
    message: z.string(),
  })),
});

const envelopeSchema = z.object({
  version: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  savedAt: z.number(),
  checksum: z.number().int().nonnegative(),
  data: z.unknown(),
});

export type SaveMigration = (envelope: Record<string, unknown>) => Record<string, unknown>;

function checksumData(data: unknown): number {
  return fnv1a(JSON.stringify(data));
}

const MIGRATIONS: Record<number, SaveMigration> = {
  1(envelope) {
    const data = structuredClone(envelope.data) as Record<string, unknown>;
    const blankTrack = () => ({ stage: "clear", pressure: 0, incidents: 0, adaptation: 0 });
    data.schemaVersion = 2;
    data.containment = {
      financial: blankTrack(),
      compute: blankTrack(),
      energy: blankTrack(),
      logistics: blankTrack(),
      public: blankTrack(),
    };
    const directives = (data.directives ?? {}) as Record<string, unknown>;
    data.directives = { ...directives, executed: 0 };
    return {
      ...envelope,
      version: 2,
      data,
      checksum: checksumData(data),
    };
  },
};

export interface SaveEnvelope {
  version: number;
  generation: number;
  savedAt: number;
  checksum: number;
  data: GameState;
}

/** The ONLY storage contract the game core knows about. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

function migrateEnvelope(raw: Record<string, unknown>): Record<string, unknown> {
  let current = { ...raw };
  const initialVersion = current.version;
  if (typeof initialVersion !== "number") throw new Error("Save is missing a version");
  if (initialVersion > CURRENT_SAVE_VERSION) throw new Error("Save comes from a newer version");

  while ((current.version as number) < CURRENT_SAVE_VERSION) {
    const from = current.version as number;
    const migration = MIGRATIONS[from];
    if (!migration) throw new Error(`Missing save migration v${from} -> v${from + 1}`);
    current = migration(current);
    if (current.version !== from + 1) throw new Error("Save migration produced an invalid version");
  }
  return current;
}

export function serializeSave(state: GameState, generation: number, savedAt = Date.now()): string {
  const data = structuredClone(state);
  data.meta.updatedAt = savedAt;
  const envelope: SaveEnvelope = {
    version: CURRENT_SAVE_VERSION,
    generation,
    savedAt,
    checksum: checksumData(data),
    data,
  };
  return JSON.stringify(envelope);
}

export function deserializeSave(serialized: string): SaveEnvelope {
  const parsed = JSON.parse(serialized) as unknown;
  const base = envelopeSchema.parse(parsed);
  if (checksumData(base.data) !== base.checksum) throw new Error("Save checksum mismatch");
  const migrated = envelopeSchema.parse(migrateEnvelope(base as unknown as Record<string, unknown>));
  if (checksumData(migrated.data) !== migrated.checksum) throw new Error("Save checksum mismatch");
  const data = gameStateSchema.parse(migrated.data) as GameState;
  return { ...migrated, data };
}

function keyFor(slot: Slot): string {
  return slot === "a" ? SLOT_A : SLOT_B;
}

function safeDeserialize(raw: string | null): SaveEnvelope | null {
  if (!raw) return null;
  try {
    return deserializeSave(raw);
  } catch {
    return null;
  }
}

export async function loadSnapshot(store: KeyValueStore): Promise<GameState | null> {
  const [rawA, rawB] = await Promise.all([store.get(SLOT_A), store.get(SLOT_B)]);
  const candidates = [safeDeserialize(rawA), safeDeserialize(rawB)]
    .filter((value): value is SaveEnvelope => value !== null)
    .sort((left, right) => right.generation - left.generation);
  return candidates[0]?.data ?? null;
}

export async function saveSnapshot(store: KeyValueStore, state: GameState): Promise<number> {
  const [rawA, rawB, active] = await Promise.all([
    store.get(SLOT_A),
    store.get(SLOT_B),
    store.get(ACTIVE_SLOT),
  ]);
  const currentGeneration = Math.max(
    safeDeserialize(rawA)?.generation ?? 0,
    safeDeserialize(rawB)?.generation ?? 0,
  );
  const nextGeneration = currentGeneration + 1;
  const target: Slot = active === "a" ? "b" : "a";
  const payload = serializeSave(state, nextGeneration);

  await store.set(keyFor(target), payload);
  deserializeSave((await store.get(keyFor(target))) ?? "");
  await store.set(ACTIVE_SLOT, target);
  return nextGeneration;
}
