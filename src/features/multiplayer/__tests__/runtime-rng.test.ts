import { describe, expect, it } from "vitest";
import { ChessEngine } from "@/lib/chessEngine";
import {
  applyDeterministicSecretSetup,
  createMatchRandom,
} from "../runtime-rng";
import { identity } from "./fixtures";

describe("matchSeed deterministic runtime", () => {
  it("gives both clients the exact same secret setup", () => {
    const first = applyDeterministicSecretSetup(
      ChessEngine.initializeBoard(),
      identity,
    );
    const second = applyDeterministicSecretSetup(
      ChessEngine.initializeBoard(),
      identity,
    );
    expect(first).toEqual(second);
    expect(ChessEngine.getBoardSignature(first)).toBe(
      ChessEngine.getBoardSignature(second),
    );
  });

  it("provides independent deterministic RNG scopes", () => {
    const first = createMatchRandom(identity, "hazards-v1");
    const second = createMatchRandom(identity, "hazards-v1");
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("fails closed when an injected RNG violates its contract", () => {
    expect(() =>
      ChessEngine.applySecretSetup(ChessEngine.initializeBoard(), () => 1),
    ).toThrow("[0, 1)");
  });
});
