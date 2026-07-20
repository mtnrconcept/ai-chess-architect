import { describe, expect, it } from "vitest";
import {
  STANDARD_START_FEN,
  buildMoveUci,
  canonicalFenFromMoves,
  parseFenBoard,
  squaresForPerspective,
} from "../fen";

describe("canonical multiplayer FEN", () => {
  it("parses the standard server position without inventing pieces", () => {
    const board = parseFenBoard(STANDARD_START_FEN);

    expect(board.e1).toMatchObject({ color: "white", kind: "king" });
    expect(board.e8).toMatchObject({ color: "black", kind: "king" });
    expect(board.e4).toBeUndefined();
  });

  it("fails closed on malformed server positions", () => {
    expect(() => parseFenBoard("8/8/8/8/8/8/8")).toThrow(/huit rangées/);
    expect(() => parseFenBoard("9/8/8/8/8/8/8/8 w - - 0 1")).toThrow(
      /pièce ou colonne|rangée incomplète/,
    );
  });

  it("uses only the latest committed FEN and otherwise the standard start", () => {
    expect(canonicalFenFromMoves([])).toBe(STANDARD_START_FEN);
    expect(
      canonicalFenFromMoves([
        {
          ply: 1,
          side: "white",
          from: "e2",
          to: "e4",
          uci: "e2e4",
          positionHash: "position-1",
          fenAfter: "server-fen-after",
        },
      ]),
    ).toBe("server-fen-after");
  });

  it("orients the board for each participant", () => {
    expect(squaresForPerspective("white")[0]).toBe("a8");
    expect(squaresForPerspective("white")[63]).toBe("h1");
    expect(squaresForPerspective("black")[0]).toBe("h1");
    expect(squaresForPerspective("black")[63]).toBe("a8");
  });

  it("defaults server promotion intents to a queen", () => {
    const board = parseFenBoard("8/P7/8/8/8/8/7p/8 w - - 0 1");
    expect(buildMoveUci("a7", "a8", board.a7!)).toBe("a7a8q");
    expect(buildMoveUci("h2", "h1", board.h2!)).toBe("h2h1q");
  });
});
