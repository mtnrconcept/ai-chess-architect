import { describe, expect, it } from "vitest";
import { resolveCapturedTargetPieceId } from "@/engine/capture-context";
import type { ChessMove, ChessPiece } from "@/types/chess";

const piece = (
  row: number,
  col: number,
  engineId?: string,
): ChessPiece & { __engineId?: string } => ({
  type: "pawn",
  color: "black",
  position: { row, col },
  ...(engineId ? { __engineId: engineId } : {}),
});

describe("resolveCapturedTargetPieceId", () => {
  it("expose la pièce capturée au contexte du moteur", () => {
    const move: ChessMove = {
      from: { row: 6, col: 4 },
      to: { row: 5, col: 5 },
      piece: { ...piece(5, 5), color: "white" },
      captured: piece(5, 5, "piece_17"),
    };

    expect(
      resolveCapturedTargetPieceId(move, 12, {
        pieceId: "piece_4",
        from: "e2",
        to: "f3",
      }),
    ).toBe("piece_17");
  });

  it("crée un identifiant opaque lorsque l'ancien moteur n'en fournit pas", () => {
    const move: ChessMove = {
      from: { row: 6, col: 4 },
      to: { row: 5, col: 5 },
      piece: { ...piece(5, 5), color: "white" },
      captured: piece(5, 5),
    };

    expect(
      resolveCapturedTargetPieceId(move, 3, {
        pieceId: "piece_4",
        from: "e2",
        to: "f3",
      }),
    ).toBe("captured_3_f3");
  });

  it("ne signale pas une capture pour un autre mouvement", () => {
    const move: ChessMove = {
      from: { row: 6, col: 4 },
      to: { row: 5, col: 5 },
      piece: { ...piece(5, 5), color: "white" },
      captured: piece(5, 5, "piece_17"),
    };

    expect(
      resolveCapturedTargetPieceId(move, 12, {
        pieceId: "piece_4",
        from: "e2",
        to: "e3",
      }),
    ).toBeUndefined();
  });
});
