import { Side } from "../types";

export class MatchAdapter {
  private currentTurn: Side;
  private ply: number = 1;
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
    });
  }

  deserialize(payload: string): void {
    const value = JSON.parse(payload) as {
      currentTurn?: unknown;
      ply?: unknown;
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
  }
}
