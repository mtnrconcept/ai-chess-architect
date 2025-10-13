import { PersistenceAPI } from "./types";

export class StateStore implements PersistenceAPI {
  private root: Record<string, any> = {};
  private undoStack: string[] = [];
  private maxUndoStack = 50;

  getOrInit(namespace: string, initial: any) {
    if (!this.root[namespace]) {
      this.root[namespace] = structuredClone(initial);
    }
    return this.root[namespace];
  }

  serialize() {
    return JSON.stringify(this.root);
  }

  deserialize(payload: string) {
    try {
      this.root = JSON.parse(payload ?? "{}");
    } catch (error) {
      console.warn('Failed to deserialize state:', error);
      this.root = {};
    }
  }

  pushUndo() {
    const snapshot = JSON.stringify(this.root);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxUndoStack) {
      this.undoStack.shift();
    }
  }

  undo() {
    const last = this.undoStack.pop();
    if (last) {
      try {
        this.root = JSON.parse(last);
      } catch (error) {
        console.warn('Failed to undo:', error);
      }
    }
  }

  clear() {
    this.root = {};
    this.undoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }
}
