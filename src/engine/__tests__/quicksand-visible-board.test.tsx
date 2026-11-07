import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChessBoard from "../../components/ChessBoard";
import type { ChessPiece } from "../../types/chess";

describe("visible persistent traps on the actual chess board", () => {
  const emptyBoard = Array.from({ length: 8 }, () =>
    Array<ChessPiece | null>(8).fill(null),
  );

  it("shows a visually marked sand trap on e3 with a stable test selector", () => {
    const html = renderToStaticMarkup(
      <ChessBoard
        board={emptyBoard}
        selected={null}
        validMoves={[]}
        decorations={{ e3: "quicksand" }}
        onSquareClick={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="quicksand-e3"');
    expect(html).toContain('data-rule-trap="quicksand"');
    expect(html).toContain("piège de sables mouvants visible");
    expect(html).toContain("motion-safe:animate-spin");
    expect(html).not.toContain('data-testid="quicksand-e4"');
  });

  it("removes the trap marker as soon as the authoritative decal disappears", () => {
    const html = renderToStaticMarkup(
      <ChessBoard
        board={emptyBoard}
        selected={null}
        validMoves={[]}
        decorations={{}}
        onSquareClick={() => undefined}
      />,
    );
    expect(html).not.toContain('data-rule-trap="quicksand"');
    expect(html).not.toContain('data-testid="quicksand-e3"');
  });
});
