import type { UIAPI, UIActionSpec } from "../types";
import { toast } from "@/hooks/use-toast";

export type UIActionListener = (actions: UIActionSpec[]) => void;

const cloneAction = (action: UIActionSpec): UIActionSpec => ({
  ...action,
  availability: action.availability ? { ...action.availability } : undefined,
  targeting: action.targeting ? { ...action.targeting } : undefined,
  cooldown: action.cooldown ? { ...action.cooldown } : undefined,
});

/** Reactive UI registry used by Rule Architect actions. */
export class UIAdapter implements UIAPI {
  private readonly actionRegistry = new Map<string, UIActionSpec>();
  private readonly listeners = new Set<UIActionListener>();

  toast(message: string): void {
    const safeMessage = String(message ?? "").trim().slice(0, 500);
    if (!safeMessage) return;
    toast({ title: safeMessage, duration: 3000 });
  }

  registerAction(actionSpec: UIActionSpec): void {
    if (!actionSpec?.id || !actionSpec?.label) return;
    this.actionRegistry.set(actionSpec.id, cloneAction(actionSpec));
    this.notify();
  }

  clearActions(notify = true): void {
    this.actionRegistry.clear();
    if (notify) this.notify();
  }

  getAction(actionId: string): UIActionSpec | undefined {
    const action = this.actionRegistry.get(actionId);
    return action ? cloneAction(action) : undefined;
  }

  getAllActions(): UIActionSpec[] {
    return [...this.actionRegistry.values()]
      .map(cloneAction)
      .sort((left, right) => left.label.localeCompare(right.label, "fr"));
  }

  subscribe(listener: UIActionListener): () => void {
    this.listeners.add(listener);
    listener(this.getAllActions());
    return () => {
      this.listeners.delete(listener);
    };
  }

  flush(): void {
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getAllActions();
    for (const listener of this.listeners) listener(snapshot);
  }
}
