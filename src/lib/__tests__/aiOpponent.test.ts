import { describe, expect, it } from "vitest";
import { ChessEngine } from "@/lib/chessEngine";
import { chooseAiMove } from "@/lib/aiOpponent";
import { applyMoveToGameState } from "@/lib/gameMoveState";
import type { GameState } from "@/types/chess";

const createState = (currentPlayer: "white" | "black" = "white"): GameState => {
  const board = ChessEngine.initializeBoard();
  return {
    board,
    currentPlayer,
    turnNumber: 1,
    movesThisTurn: 0,
    selectedPiece: null,
    validMoves: [],
    gameStatus: "active",
    capturedPieces: [],
    moveHistory: [],
    activeRules: [],
    extraMoves: 0,
    pendingExtraMoves: { white: 0, black: 0 },
    freezeEffects: [],
    freezeUsage: { white: false, black: false },
    positionHistory: { [ChessEngine.getBoardSignature(board)]: 1 },
    pendingTransformations: { white: false, black: false },
    specialAttacks: [],
    visualEffects: [],
    lastMoveByColor: { white: null, black: null },
  } as GameState;
};

describe("shared move transition", () => {
  it("applies a legal human move and advances the turn", () => {
    const state = createState("white");
    const pawn = state.board[6][4];
    expect(pawn?.type).toBe("pawn");
    const result = applyMoveToGameState(state, pawn!, { row: 4, col: 4 });
    expect(result).not.toBeNull();
    expect(result?.state.currentPlayer).toBe("black");
    expect(result?.state.moveHistory).toHaveLength(1);
    expect(result?.state.board[4][4]?.color).toBe("white");
  });

  it("rejects an illegal move", () => {
    const state = createState("white");
    const pawn = state.board[6][4]!;
    expect(applyMoveToGameState(state, pawn, { row: 3, col: 4 })).toBeNull();
  });

  it("allows the human player to answer a check", () => {
    const state = { ...createState("white"), gameStatus: "check" } as GameState;
    const pawn = state.board[6][4]!;

    expect(
      applyMoveToGameState(state, pawn, { row: 5, col: 4 }),
    ).not.toBeNull();
  });

  it("treats an active V2 frozen status as a legality constraint", () => {
    const state = createState("white");
    const pawn = state.board[6][4]!;
    pawn.specialState = {
      frozen: { active: true, duration: 2 },
    };

    expect(ChessEngine.getValidMoves(state.board, pawn, state)).toEqual([]);
    expect(applyMoveToGameState(state, pawn, { row: 5, col: 4 })).toBeNull();

    pawn.specialState.frozen = { active: true, duration: 0 };
    expect(ChessEngine.getValidMoves(state.board, pawn, state)).not.toEqual([]);
  });
});

describe("deterministic AI opponent", () => {
  it("returns only a legal move for the current side", () => {
    const state = createState("black");
    const choice = chooseAiMove(state, 1, 1);
    expect(choice).not.toBeNull();
    expect(choice?.piece.color).toBe("black");
    const legalMoves = ChessEngine.getValidMoves(state.board, choice!.piece, {
      ...state,
      selectedPiece: choice!.piece,
    });
    expect(
      legalMoves.some(
        (move) => move.row === choice!.to.row && move.col === choice!.to.col,
      ),
    ).toBe(true);
  });

  it("is reproducible for the same position", () => {
    const first = chooseAiMove(createState("black"), 2, 2);
    const second = chooseAiMove(createState("black"), 2, 2);
    expect(first?.piece.position).toEqual(second?.piece.position);
    expect(first?.to).toEqual(second?.to);
  });

  it("does not move after game over", () => {
    const state = {
      ...createState("black"),
      gameStatus: "checkmate",
    } as GameState;
    expect(chooseAiMove(state, 3, 1)).toBeNull();
  });
});
