import { Side } from '../types';

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
      turnSide: this.currentTurn
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
}
