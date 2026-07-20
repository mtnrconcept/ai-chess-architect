import { describe, expect, it } from "vitest";
import {
  createDeterministicIdGenerator,
  createDeterministicRandom,
} from "../deterministic-rng";

describe("createDeterministicRandom", () => {
  it("rejoue exactement la même séquence avec le même seed", () => {
    const first = createDeterministicRandom("match-42:event-7");
    const second = createDeterministicRandom("match-42:event-7");

    const a = Array.from({ length: 10 }, () => first());
    const b = Array.from({ length: 10 }, () => second());

    expect(a).toEqual(b);
  });

  it("produit une autre séquence avec un autre seed", () => {
    const first = createDeterministicRandom("seed-a");
    const second = createDeterministicRandom("seed-b");

    expect(first()).not.toBe(second());
  });

  it("génère les mêmes identifiants dans le même ordre", () => {
    const first = createDeterministicIdGenerator("match-42");
    const second = createDeterministicIdGenerator("match-42");

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });
});
