import { ActionStep } from "./types";

type Context = Record<string, unknown>;
type EffectParams = Record<string, unknown>;
type LogicalOperator = "not" | "and" | "or";
type LogicalConditionNode = [LogicalOperator, ...ConditionDescriptor[]];
type ParameterizedConditionNode = [string, ...unknown[]];
export type ConditionDescriptor =
  | string
  | LogicalConditionNode
  | ParameterizedConditionNode;

export type ConditionFn = (ctx: Context, ...args: unknown[]) => boolean;
export type EffectFn = (ctx: Context, params?: EffectParams) => void;

export class Registry {
  conditions = new Map<string, ConditionFn>();
  effects = new Map<string, EffectFn>();
  providers = new Map<string, (ctx: Context, ...args: unknown[]) => unknown>();

  registerCondition(id: string, fn: ConditionFn) {
    this.conditions.set(id, fn);
  }

  registerEffect(id: string, fn: EffectFn) {
    this.effects.set(id, fn);
  }

  registerProvider(
    id: string,
    fn: (ctx: Context, ...args: unknown[]) => unknown,
  ) {
    this.providers.set(id, fn);
  }

  runCondition(id: ConditionDescriptor, ctx: Context): boolean {
    if (Array.isArray(id)) {
      const [op, ...args] = id as ParameterizedConditionNode;

      if (op === "not" || op === "and" || op === "or") {
        const logicalArgs = args as ConditionDescriptor[];

        if (op === "not") {
          const target = logicalArgs[0];
          return target ? !this.runCondition(target, ctx) : true;
        }

        if (op === "and") {
          return logicalArgs.every((cond) => this.runCondition(cond, ctx));
        }

        if (op === "or") {
          return logicalArgs.some((cond) => this.runCondition(cond, ctx));
        }
      }

      const fn = this.conditions.get(op);
      if (!fn) {
        console.warn(`Condition missing: ${op}`);
        return true;
      }
      try {
        return fn(ctx, ...args);
      } catch (error) {
        console.error(`Error running condition ${op}:`, error);
        return false;
      }
    }

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

  runEffect(step: ActionStep, ctx: Context) {
    const fn = this.effects.get(step.action);
    if (!fn) {
      console.warn(`Effect missing: ${step.action}`);
      return;
    }
    try {
      const resolvedParams = step.params
        ? this.resolveParams(step.params, ctx)
        : undefined;
      fn(ctx, resolvedParams);
    } catch (error) {
      console.error(`Error running effect ${step.action}:`, error);
    }
  }

  private resolveParams(params: unknown, ctx: Context): unknown {
    if (Array.isArray(params)) {
      return params.map((p) => this.resolveParams(p, ctx));
    }

    if (params && typeof params === "object") {
      const entries = Object.entries(params as Record<string, unknown>).map(
        ([key, value]) => [key, this.resolveParams(value, ctx)],
      );
      return Object.fromEntries(entries);
    }

    if (typeof params === "string") {
      return this.resolveToken(params, ctx);
    }

    return params;
  }

  private resolveToken(token: string, ctx: Context): unknown {
    if (token === "$ctx") {
      return ctx;
    }

    if (token.startsWith("$ctx.")) {
      const path = token.slice(5);
      const segments = path.split(".");
      let current: unknown = ctx;

      for (const segment of segments) {
        if (current == null) {
          return undefined;
        }
        if (typeof current !== "object") {
          return undefined;
        }
        current = (current as Record<string, unknown>)[segment];
      }

      return current;
    }

    return token;
  }

  runProvider(id: string, ctx: Context, ...args: unknown[]) {
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
