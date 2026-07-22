import { Side } from "../types";

export class MatchAdapter {
  private currentTurn: Side;
  private ply: number = 1;
  private committedMoveCount = 0;
  private turnEndCallback?: () => void;

  constructor(currentTurn: Side) {
    this.currentTurn = currentTurn;
  }

  setTurnEndCallback(callback: () => void): void {
    this.turnEndCallback = callback;
  }

  getCurrentTurn(): Side {
    return this.currentTurn;
  }

  setCurrentTurn(side: Side): void {
    this.currentTurn = side;
  }

  /**
   * Synchronizes normal chess moves without double-counting React effects.
   * Turn-consuming rule actions still advance `ply` through `endTurn()`.
   */
  syncCommittedMoves(moveCount: number): void {
    if (!Number.isInteger(moveCount) || moveCount < 0) {
      throw new Error("Invalid committed move count.");
    }

    if (moveCount < this.committedMoveCount) {
      this.committedMoveCount = moveCount;
      this.ply = moveCount + 1;
      return;
    }

    this.ply += moveCount - this.committedMoveCount;
    this.committedMoveCount = moveCount;
  }

  get() {
    return {
      ply: this.ply,
      turnSide: this.currentTurn,
    };
  }

  setTurn(side: Side): void {
    this.currentTurn = side;
  }

  endTurn(): void {
    this.ply++;
    if (this.turnEndCallback) {
      this.turnEndCallback();
    }
  }

  serialize(): string {
    return JSON.stringify({
      currentTurn: this.currentTurn,
      ply: this.ply,
      committedMoveCount: this.committedMoveCount,
    });
  }

  deserialize(payload: string): void {
    const value = JSON.parse(payload) as {
      currentTurn?: unknown;
      ply?: unknown;
      committedMoveCount?: unknown;
    };
    if (
      (value.currentTurn !== "white" && value.currentTurn !== "black") ||
      typeof value.ply !== "number" ||
      !Number.isInteger(value.ply) ||
      value.ply < 0
    ) {
      throw new Error("Invalid match snapshot.");
    }
    this.currentTurn = value.currentTurn;
    this.ply = value.ply;
    this.committedMoveCount =
      typeof value.committedMoveCount === "number" &&
      Number.isInteger(value.committedMoveCount) &&
      value.committedMoveCount >= 0
        ? value.committedMoveCount
        : Math.max(0, value.ply - 1);
  }
}
