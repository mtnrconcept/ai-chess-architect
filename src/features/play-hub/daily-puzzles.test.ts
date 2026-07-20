import { describe, expect, it } from "vitest";

import {
  chessBoardFromFen,
  puzzleUciFromSquares,
  sideToMoveFromFen,
  toLocalDateKey,
  toUtcDateKey,
} from "./daily-puzzles";

describe("daily puzzles", () => {
  it("parses all 64 squares from a FEN", () => {
    const squares = chessBoardFromFen("7k/6pp/8/8/8/8/5QPP/6K1 w - - 0 1");

    expect(squares).toHaveLength(64);
    expect(squares.find((square) => square.square === "h8")?.pieceLabel).toBe(
      "Roi noir",
    );
    expect(squares.find((square) => square.square === "f2")?.pieceLabel).toBe(
      "Dame blanche",
    );
  });

  it("rotates the board for the black perspective", () => {
    const fen = "8/8/8/8/8/5k2/5q2/7K b - - 0 1";
    const white = chessBoardFromFen(fen, "white");
    const black = chessBoardFromFen(fen, "black");

    expect(black[0].square).toBe(white[63].square);
    expect(black[63].square).toBe(white[0].square);
  });

  it("rejects malformed FEN input", () => {
    expect(() => chessBoardFromFen("8/8/8")).toThrow(/huit rangées/);
    expect(() => chessBoardFromFen("8/8/8/8/8/8/8/7x")).toThrow(
      /symbole de pièce/,
    );
  });

  it("builds generic from/to UCI input without a server-solution map", () => {
    const standardMoveFen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
    const promotionFen = "7k/P7/8/8/8/8/8/7K w - - 0 1";

    expect(sideToMoveFromFen(standardMoveFen)).toBe("white");
    expect(puzzleUciFromSquares(standardMoveFen, "e2", "e4")).toBe("e2e4");
    expect(puzzleUciFromSquares(promotionFen, "a7", "a8")).toBe("a7a8q");
    expect(puzzleUciFromSquares(standardMoveFen, "e8", "e7")).toBeNull();
  });

  it("formats the browser-local day sent to the daily puzzle RPC", () => {
    expect(toLocalDateKey(new Date(2026, 6, 20, 23, 59))).toBe("2026-07-20");
    expect(toUtcDateKey(new Date("2026-07-20T23:59:59.000Z"))).toBe(
      "2026-07-20",
    );
  });
});
