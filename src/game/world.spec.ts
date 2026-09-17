import { describe, expect, it } from "vitest";
import {
  createEmptyWorld,
  isValidWorldShape,
  type CountryDefinition,
  type NodeDefinition,
  type RegionDefinition,
  type WorldState,
} from "./world";

describe("geography extension contract", () => {
  it("creates an empty data-driven world container", () => {
    expect(createEmptyWorld()).toEqual({ countries: {}, regions: {}, nodes: {} });
  });

  it("models Russia -> Moscow -> node without touching GameState", () => {
    const country: CountryDefinition = { id: "ru", label: "Russia" };
    const region: RegionDefinition = { id: "moscow", countryId: country.id, label: "Moscow" };
    const node: NodeDefinition = {
      id: "mos-compute-03",
      regionId: region.id,
      label: "MOS-COMPUTE-03",
      channel: "compute",
    };

    expect(region.countryId).toBe("ru");
    expect(node.regionId).toBe("moscow");
  });

  it("accepts a structurally valid future world payload", () => {
    const world: WorldState = {
      countries: { ru: { id: "ru", label: "Russia" } },
      regions: { moscow: { id: "moscow", unlocked: true, nodes: ["mos-compute-03"] } },
      nodes: {
        "mos-compute-03": {
          id: "mos-compute-03",
          regionId: "moscow",
          progress: 0,
          active: true,
        },
      },
    };
    expect(isValidWorldShape(world)).toBe(true);
  });

  it("rejects malformed future world payloads", () => {
    expect(isValidWorldShape({ countries: {}, regions: {} })).toBe(false);
    expect(isValidWorldShape(null)).toBe(false);
    expect(isValidWorldShape("moscow")).toBe(false);
    expect(isValidWorldShape([])).toBe(false);
  });
});
