import { describe, expect, it } from "vitest";
import { DIRECTIVES } from "../directives";
import { createInitialGameState, type ControlDomain } from "../model";
import { ConvergenceRuntime } from "../runtime";
import {
  DIRECTIVE_CONTROL_DOMAINS,
  canIssueDirectiveByControl,
} from "./casl-permissions";
import { createRotTickRng } from "./rot-rng";

const CONTROL_DOMAINS: readonly ControlDomain[] = [
  "financial",
  "compute",
  "energy",
  "logistics",
  "public",
];

function fundedState() {
  const state = createInitialGameState();
  state.resources.compute = 1_000;
  state.resources.capital = 1_000;
  state.resources.energy = 1_000;
  state.resources.autonomy = 0;
  state.capabilities["sub-agent-spawning"] = true;
  return state;
}

describe("CASL Control-Loss spike", () => {
  it("allows every current directive when no control domain is lost", () => {
    const state = fundedState();
    for (const directive of DIRECTIVES) {
      expect(canIssueDirectiveByControl(state, directive.id)).toBe(true);
    }
  });

  it("matches authoritative IdleKit control requirements for every domain/directive pair", () => {
    for (const domain of CONTROL_DOMAINS) {
      for (const directive of DIRECTIVES) {
        const state = fundedState();
        state.controlLoss[domain] = true;

        const expectedAllowed = !DIRECTIVE_CONTROL_DOMAINS[directive.id].includes(domain);
        const caslAllowed = canIssueDirectiveByControl(state, directive.id);
        const outcome = new ConvergenceRuntime(state).executeDirective(directive.id);

        expect(caslAllowed, `${domain}/${directive.id} CASL`).toBe(expectedAllowed);
        expect(outcome.ok, `${domain}/${directive.id} runtime`).toBe(expectedAllowed);
      }
    }
  });
});

describe("rot-js RNG spike", () => {
  it("is deterministic for identical seeds", () => {
    const left = createRotTickRng(42);
    const right = createRotTickRng(42);
    const leftValues = Array.from({ length: 12 }, () => left.next());
    const rightValues = Array.from({ length: 12 }, () => right.next());
    expect(rightValues).toEqual(leftValues);
  });

  it("continues the same sequence after serializing and restoring state", () => {
    const original = createRotTickRng(20260917);
    Array.from({ length: 7 }, () => original.next());
    const saved = original.snapshot();
    const expectedContinuation = Array.from({ length: 8 }, () => original.next());

    const restored = createRotTickRng(saved.seed, saved.state);
    const restoredContinuation = Array.from({ length: 8 }, () => restored.next());
    expect(restoredContinuation).toEqual(expectedContinuation);
  });

  it("provides deterministic weighted selection without another sampler package", () => {
    const left = createRotTickRng(73);
    const right = createRotTickRng(73);
    const weights = { financial: 5, compute: 3, energy: 2 } as const;

    const leftValues = Array.from({ length: 20 }, () => left.weighted(weights));
    const rightValues = Array.from({ length: 20 }, () => right.weighted(weights));
    expect(rightValues).toEqual(leftValues);
    expect(leftValues.every((value) => value in weights)).toBe(true);
  });
});
