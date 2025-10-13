import { UIAPI, UIActionSpec } from '../types';
import { toast } from '@/hooks/use-toast';

export class UIAdapter implements UIAPI {
  private actionRegistry: Map<string, UIActionSpec>;

  constructor() {
    this.actionRegistry = new Map();
  }

  toast(msg: string): void {
    toast({
      title: msg,
      duration: 3000
    });
  }

  registerAction(actionSpec: UIActionSpec): void {
    this.actionRegistry.set(actionSpec.id, actionSpec);
  }

  getAction(actionId: string): UIActionSpec | undefined {
    return this.actionRegistry.get(actionId);
  }

  getAllActions(): UIActionSpec[] {
    return Array.from(this.actionRegistry.values());
  }
}
