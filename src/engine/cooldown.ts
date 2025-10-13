import { CooldownAPI, PieceID } from "./types";

export class Cooldown implements CooldownAPI {
  private store = new Map<string, number>();

  set(pieceId: PieceID, actionId: string, turns: number) {
    this.store.set(`${pieceId}|${actionId}`, turns);
  }

  isReady(pieceId: PieceID, actionId: string) {
    const k = `${pieceId}|${actionId}`;
    return !this.store.has(k) || (this.store.get(k)! <= 0);
  }

  tickAll() {
    this.store.forEach((v, k) => this.store.set(k, Math.max(0, v - 1)));
  }

  clear() {
    this.store.clear();
  }

  serialize() {
    return JSON.stringify(Array.from(this.store.entries()));
  }

  deserialize(data: string) {
    try {
      const entries = JSON.parse(data);
      this.store = new Map(entries);
    } catch (error) {
      console.warn('Failed to deserialize cooldown data:', error);
    }
  }
}
