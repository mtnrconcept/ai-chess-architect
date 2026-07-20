import { Chess } from "npm:chess.js@1.4.0";

import type { ChessSide } from "./clock.ts";
import { MoveProcessingError, parseUci } from "./protocol.ts";

export const CHESS_JS_VERSION = "1.4.0";
export const STANDARD_PLATFORM_ENGINE_VERSION = "2.0.0";
export const STANDARD_VALIDATOR_ID = `chess.js@${CHESS_JS_VERSION}`;

export type StandardTermination =
  | "checkmate"
  | "fifty-move-rule"
  | "insufficient-material"
  | "stalemate";

export interface StandardTerminalState {
  result: "1-0" | "0-1" | "1/2-1/2";
  termination: StandardTermination;
}

export interface ValidatedStandardMove {
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  nextSide: ChessSide;
  isCheck: boolean;
  terminal: StandardTerminalState | null;
}

export const chessColorToSide = (color: "w" | "b"): ChessSide =>
  color === "w" ? "white" : "black";

function terminalState(chess: Chess): StandardTerminalState | null {
  if (chess.isCheckmate()) {
    return {
      result: chess.turn() === "w" ? "0-1" : "1-0",
      termination: "checkmate",
    };
  }
  if (chess.isStalemate()) {
    return { result: "1/2-1/2", termination: "stalemate" };
  }
  if (chess.isInsufficientMaterial()) {
    return { result: "1/2-1/2", termination: "insufficient-material" };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { result: "1/2-1/2", termination: "fifty-move-rule" };
  }

  // Threefold repetition cannot be proven from a single FEN. The validator
  // deliberately does not infer it without an authoritative position history.
  return null;
}

export function inspectStandardPosition(fen: string): {
  sideToMove: ChessSide;
  terminal: StandardTerminalState | null;
} {
  try {
    const chess = new Chess(fen);
    return {
      sideToMove: chessColorToSide(chess.turn()),
      terminal: terminalState(chess),
    };
  } catch {
    throw new MoveProcessingError("INVALID_AUTHORITATIVE_POSITION");
  }
}

export function validateStandardMove(
  fen: string,
  uci: string,
): ValidatedStandardMove {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    throw new MoveProcessingError("INVALID_AUTHORITATIVE_POSITION");
  }

  const parsed = parseUci(uci);
  let move;
  try {
    move = chess.move(parsed);
  } catch {
    throw new MoveProcessingError("ILLEGAL_MOVE");
  }

  return {
    uci,
    san: move.san,
    fenBefore: move.before,
    fenAfter: move.after,
    nextSide: chessColorToSide(chess.turn()),
    isCheck: chess.isCheck(),
    terminal: terminalState(chess),
  };
}
