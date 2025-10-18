import { ActionStep } from "./types";

export type ConditionFn = (ctx: any) => boolean;
export type EffectFn = (ctx: any, params?: Record<string, any>) => void;

export class Registry {
  conditions = new Map<string, ConditionFn>();
  effects = new Map<string, EffectFn>();
  providers = new Map<string, (ctx: any, ...args: any[]) => any>();

  registerCondition(id: string, fn: ConditionFn) {
    this.conditions.set(id, fn);
  }

  registerEffect(id: string, fn: EffectFn) {
    this.effects.set(id, fn);
  }

  registerProvider(id: string, fn: (ctx: any, ...args: any[]) => any) {
    this.providers.set(id, fn);
  }

  runCondition(id: string | any[], ctx: any): boolean {
    // Phase 4: Support des opérateurs logiques
    if (Array.isArray(id)) {
      const [op, ...args] = id;
      
      if (op === "not") {
        return !this.runCondition(args[0], ctx);
      }
      
      if (op === "and") {
        return args.every(cond => this.runCondition(cond, ctx));
      }
      
      if (op === "or") {
        return args.some(cond => this.runCondition(cond, ctx));
      }
    }
    
    // Condition simple (existant)
    const fn = this.conditions.get(id as string);
    if (!fn) {
      console.warn(`Condition missing: ${id}`);
      return true;
    }
    try {
      return fn(ctx);
    } catch (error) {
      console.error(`Error running condition ${id}:`, error);
      return false;
    }
  }

  runEffect(step: ActionStep, ctx: any) {
    const fn = this.effects.get(step.action);
    if (!fn) {
      console.warn(`Effect missing: ${step.action}`);
      return;
    }
    try {
      fn(ctx, step.params);
    } catch (error) {
      console.error(`Error running effect ${step.action}:`, error);
    }
  }

  runProvider(id: string, ctx: any, ...args: any[]) {
    const fn = this.providers.get(id);
    if (!fn) {
      console.warn(`Provider missing: ${id}`);
      return [];
    }
    try {
      return fn(ctx, ...args);
    } catch (error) {
      console.error(`Error running provider ${id}:`, error);
      return [];
    }
  }

  listConditions() {
    return Array.from(this.conditions.keys());
  }

  listEffects() {
    return Array.from(this.effects.keys());
  }

  listProviders() {
    return Array.from(this.providers.keys());
  }
}
