import { describe, expect, it } from "vitest";
import { ChessBoardAdapter } from "./chessBoardAdapter";
import { VFXAdapter } from "./vfxAdapter";
import { connectBoardDecalFx } from "./decalBridge";
import { ChessEngine } from "@/lib/chessEngine";
import type { FxIntent, FxPayload } from "@/fx/types";

describe("custom game board decal integration", () => {
  it("renders the authoritative decal changes and stops after disconnect", () => {
    const board = new ChessBoardAdapter(ChessEngine.createEmptyBoard());
    const vfx = new VFXAdapter();
    const calls: Array<{ intents?: FxIntent[]; payload?: FxPayload }> = [];
    vfx.setFxTrigger(async (intents, payload) => {
      calls.push({ intents, payload });
    });
    const unsubscribe = connectBoardDecalFx(board, vfx);
    board.setDecal("e4", "mine");
    board.clearDecal("e4");
    expect(calls).toContainEqual({
      intents: [{ intent: "object.spawn", kind: "mine" }],
      payload: { cell: "e4" },
    });
    expect(calls).toContainEqual({
      intents: [{ intent: "object.clear" }],
      payload: { cell: "e4" },
    });
    unsubscribe();
    const before = calls.length;
    board.setDecal("a1", "mine");
    expect(calls).toHaveLength(before);
  });

  it("replays decal changes after a board rollback or restored match", () => {
    const board = new ChessBoardAdapter(ChessEngine.createEmptyBoard());
    const changes: Array<[string, string | null]> = [];
    board.setDecalChangeListener((tile, sprite) => {
      changes.push([tile, sprite]);
    });
    const base = board.serialize();
    board.setDecal("b2", "mine");
    const withMine = board.serialize();
    board.clearDecal("b2");
    board.deserialize(withMine);
    expect(changes.at(-1)).toEqual(["b2", "mine"]);
    board.deserialize(base);
    expect(changes.at(-1)).toEqual(["b2", null]);
  });
});
