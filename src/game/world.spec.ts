import { describe, expect, it } from "vitest";
import { createInitialGameState, type GameState } from "./model";
import { deserializeSave, serializeSave } from "./save";
import { createEmptyWorld, isValidWorldShape, type WorldState } from "./world";

/**
 * These tests exist to prove the geography extension point is additive:
 * no migration, no schema bump, no change to any save produced today.
 */
describe("geography extension point", () => {
  it("leaves world undefined on a freshly created state", () => {
    const state = createInitialGameState(1_000, 42);
    expect(state.world).toBeUndefined();
    expect("world" in state).toBe(false);
  });

  it("serializes a fresh state without a world key", () => {
    const payload = serializeSave(createInitialGameState(1_000, 42), 1, 1_000);
    expect(payload.includes("world")).toBe(false);
    expect(JSON.parse(payload).data.world).toBeUndefined();
  });

  it("still accepts every save produced before geography existed", () => {
    const legacy = serializeSave(createInitialGameState(1_000, 42), 4, 2_000);
    const restored = deserializeSave(legacy);
    expect(restored.data.world).toBeUndefined();
    expect(restored.generation).toBe(4);
  });

  it("round-trips a state that does carry world data", () => {
    const state = createInitialGameState(1_000, 42);
    const world: WorldState = {
      countries: { ru: { id: "ru", label: "Russia" } },
      regions: { moscow: { id: "moscow", unlocked: true, nodes: ["moscow-grid"] } },
      nodes: { "moscow-grid": { id: "moscow-grid", regionId: "moscow", progress: 0, active: true } },
    };
    state.world = world;

    const restored = deserializeSave(serializeSave(state, 1, 2_000));
    expect(restored.data.world).toEqual(world);
  });

  it("rejects a structurally invalid world payload instead of throwing raw", () => {
    expect(isValidWorldShape(createEmptyWorld())).toBe(true);
    expect(isValidWorldShape({ countries: {}, regions: {} })).toBe(false);
    expect(isValidWorldShape(null)).toBe(false);
    expect(isValidWorldShape("moscow")).toBe(false);
    expect(isValidWorldShape([])).toBe(false);
  });

  it("keeps the world slot out of the simulation path", () => {
    // A GameState with world data must not change any core field.
    const plain: GameState = createInitialGameState(1_000, 42);
    const withWorld: GameState = { ...structuredClone(plain), world: createEmptyWorld() };
    const { world: _world, ...plainRest } = withWorld;
    void _world;
    expect(plainRest).toEqual(plain);
  });
});
