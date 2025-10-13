import { MatchAPI, Side } from '../types';

export class MatchAdapter implements MatchAPI {
  private currentTurn: Side;
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

  endTurn(): void {
    if (this.turnEndCallback) {
      this.turnEndCallback();
    }
  }
}
