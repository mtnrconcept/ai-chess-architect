import type { ActionStep, EngineContracts, Piece, RuleJSON } from "./types";
import {
  RuntimeBudget,
  RuntimeBudgetExceededError,
} from "../rules-v2/runtime-budget";
import { STATE_PATH_PATTERN } from "../rules-v2/catalog";

export interface EngineContext extends Record<string, unknown> {
  engine: EngineContracts;
  match?: unknown;
  piece?: Piece;
  pieceId?: string;
  rule?: RuleJSON;
  scope?: unknown;
  state: Record<string, unknown>;
  params?: Record<string, unknown>;
  targetTile?: unknown;
  targetPieceId?: string;
  baseActionId?: string;
  random?: () => number;
  budget?: RuntimeBudget;
  turnEnded?: boolean;
  statePersistenceValid?: boolean;
  /** Side effects that must run only after the logical transaction commits. */
  postCommit?: Array<() => void>;
}

type EffectParams = Record<string, unknown> | undefined;
type LogicalOperator = "not" | "and" | "or";
type LogicalConditionNode = [LogicalOperator, ...ConditionDescriptor[]];
type ParameterizedConditionNode = [string, ...unknown[]];

export type ConditionDescriptor =
  | string
  | LogicalConditionNode
  | ParameterizedConditionNode;

export type ConditionFn = (ctx: EngineContext, ...args: unknown[]) => boolean;

export type EffectFn = (
  ctx: EngineContext,
  params?: EffectParams,
) => void | boolean;

export type ProviderFn = (ctx: EngineContext, ...args: unknown[]) => unknown;

const FORBIDDEN_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const isBudgetError = (error: unknown): error is RuntimeBudgetExceededError =>
  error instanceof RuntimeBudgetExceededError;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export class Registry {
  readonly conditions = new Map<string, ConditionFn>();
  readonly effects = new Map<string, EffectFn>();
  readonly providers = new Map<string, ProviderFn>();

  registerCondition(id: string, fn: ConditionFn): void {
    this.conditions.set(id, fn);
  }

  registerEffect(id: string, fn: EffectFn): void {
    this.effects.set(id, fn);
  }

  registerProvider(id: string, fn: ProviderFn): void {
    this.providers.set(id, fn);
  }

  runCondition(descriptor: ConditionDescriptor, ctx: EngineContext): boolean {
    let entered = false;
    try {
      ctx.budget?.charge();
      ctx.budget?.enter();
      entered = Boolean(ctx.budget);

      if (Array.isArray(descriptor)) {
        const [operation, ...rawArgs] = descriptor;

        if (operation === "not" || operation === "and" || operation === "or") {
          const logicalArgs = rawArgs as ConditionDescriptor[];

          if (operation === "not") {
            return logicalArgs.length === 1
              ? !this.runCondition(logicalArgs[0], ctx)
              : false;
          }

          if (logicalArgs.length === 0) {
            return false;
          }

          if (operation === "and") {
            return logicalArgs.every((condition) =>
              this.runCondition(condition, ctx),
            );
          }

          return logicalArgs.some((condition) =>
            this.runCondition(condition, ctx),
          );
        }

        if (typeof operation !== "string") {
          return false;
        }

        const fn = this.conditions.get(operation);
        if (!fn) {
          console.error(`[RuleEngine] Condition inconnue: ${operation}`);
          return false;
        }

        const args = rawArgs.map((argument) =>
          this.resolveParams(argument, ctx),
        );
        return Boolean(fn(ctx, ...args));
      }

      const fn = this.conditions.get(descriptor);
      if (!fn) {
        console.error(`[RuleEngine] Condition inconnue: ${descriptor}`);
        return false;
      }

      return Boolean(fn(ctx));
    } catch (error) {
      if (isBudgetError(error)) {
        throw error;
      }
      console.error("[RuleEngine] Erreur dans une condition:", error);
      return false;
    } finally {
      if (entered) {
        ctx.budget?.leave();
      }
    }
  }

  runEffect(step: ActionStep, ctx: EngineContext): boolean {
    const fn = this.effects.get(step.action);
    if (!fn) {
      console.error(`[RuleEngine] Effet inconnu: ${step.action}`);
      return false;
    }

    ctx.budget?.charge();
    ctx.budget?.enter();

    try {
      let resolvedParams: EffectParams = undefined;
      if (step.params) {
        const resolved = this.resolveParams(step.params, ctx);
        if (!isRecord(resolved)) {
          console.error(
            `[RuleEngine] Paramètres non structurés refusés pour ${step.action}.`,
          );
          return false;
        }
        resolvedParams = resolved;
      }

      if (resolvedParams && !this.areResolvedParamsSafe(resolvedParams)) {
        console.error(
          `[RuleEngine] Paramètres dangereux refusés pour ${step.action}.`,
        );
        return false;
      }

      const result = fn(ctx, resolvedParams);
      const succeeded = result !== false;

      if (succeeded && step.action === "turn.end") {
        ctx.turnEnded = true;
      }

      return succeeded;
    } catch (error) {
      if (isBudgetError(error)) {
        throw error;
      }
      console.error(`[RuleEngine] Erreur dans l'effet ${step.action}:`, error);
      return false;
    } finally {
      ctx.budget?.leave();
    }
  }

  runProvider(id: string, ctx: EngineContext, ...args: unknown[]): unknown {
    const fn = this.providers.get(id);
    if (!fn) {
      console.error(`[RuleEngine] Provider inconnu: ${id}`);
      return [];
    }

    let entered = false;
    try {
      ctx.budget?.charge();
      ctx.budget?.enter();
      entered = Boolean(ctx.budget);
      const resolvedArgs = args.map((argument) =>
        this.resolveParams(argument, ctx),
      );
      return fn(ctx, ...resolvedArgs);
    } catch (error) {
      if (isBudgetError(error)) {
        throw error;
      }
      console.error(`[RuleEngine] Erreur dans le provider ${id}:`, error);
      return [];
    } finally {
      if (entered) {
        ctx.budget?.leave();
      }
    }
  }

  private areResolvedParamsSafe(
    value: unknown,
    parentKey = "",
    depth = 0,
  ): boolean {
    if (depth > 12) {
      return false;
    }

    if (Array.isArray(value)) {
      return (
        value.length <= 256 &&
        value.every((item) =>
          this.areResolvedParamsSafe(item, parentKey, depth + 1),
        )
      );
    }

    if (value !== null && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).every(
        ([key, item]) => {
          if (FORBIDDEN_PATH_SEGMENTS.has(key)) {
            return false;
          }
          return this.areResolvedParamsSafe(item, key, depth + 1);
        },
      );
    }

    if (
      parentKey === "path" &&
      (typeof value !== "string" || !STATE_PATH_PATTERN.test(value))
    ) {
      return false;
    }

    if (
      parentKey === "key" &&
      typeof value === "string" &&
      FORBIDDEN_PATH_SEGMENTS.has(value)
    ) {
      return false;
    }

    return true;
  }

  private resolveParams(params: unknown, ctx: EngineContext): unknown {
    if (Array.isArray(params)) {
      return params.map((item) => this.resolveParams(item, ctx));
    }

    if (params && typeof params === "object") {
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, value] of Object.entries(
        params as Record<string, unknown>,
      )) {
        if (FORBIDDEN_PATH_SEGMENTS.has(key)) {
          throw new Error(`Clé interdite dans les paramètres: ${key}`);
        }
        result[key] = this.resolveParams(value, ctx);
      }
      return result;
    }

    if (typeof params === "string") {
      return this.resolveToken(params, ctx);
    }

    return params;
  }

  private resolveToken(token: string, ctx: EngineContext): unknown {
    if (token === "$ctx") {
      return {
        pieceId: ctx.pieceId,
        targetPieceId: ctx.targetPieceId,
        targetTile: ctx.targetTile,
        baseActionId: ctx.baseActionId,
      };
    }

    if (token.startsWith("$ctx.")) {
      return this.readSafePath(ctx, token.slice(5));
    }

    if (token === "$params") {
      return ctx.params ? { ...ctx.params } : {};
    }

    if (token.startsWith("$params.")) {
      return this.readSafePath(ctx.params ?? {}, token.slice(8));
    }

    const variables: Record<string, unknown> = {
      $pieceId: ctx.piece?.id ?? ctx.pieceId,
      $targetPieceId: ctx.targetPieceId,
      $targetTile: ctx.targetTile,
      $sourceTile: ctx.piece?.tile,
    };

    return Object.prototype.hasOwnProperty.call(variables, token)
      ? variables[token]
      : token;
  }

  private readSafePath(source: unknown, path: string): unknown {
    if (!path) {
      return undefined;
    }

    const segments = path.split(".");
    if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) {
      return undefined;
    }

    let current = source;
    for (const segment of segments) {
      if (current === null || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  listConditions(): string[] {
    return Array.from(this.conditions.keys()).sort();
  }

  listEffects(): string[] {
    return Array.from(this.effects.keys()).sort();
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys()).sort();
  }
}
