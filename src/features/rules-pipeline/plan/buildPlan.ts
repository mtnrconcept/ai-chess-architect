import type { ActionStep, LogicStep, RuleJSON } from "@/engine/types";

export type ExecutionPlan = {
  effectId: string;
  trigger: string;
  guards: string[];
  actions: ActionStep[];
};

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value ? (Array.isArray(value) ? value : [value]) : [];

const stringifyGuard = (guard: unknown): string => {
  if (typeof guard === "string") {
    return guard;
  }
  if (Array.isArray(guard)) {
    return JSON.stringify(guard);
  }
  return JSON.stringify(guard ?? {});
};

const collectPlanForEffect = (effect: LogicStep): ExecutionPlan => ({
  effectId: effect.id,
  trigger: effect.when,
  guards: asArray(effect.if).map(stringifyGuard),
  actions: asArray<ActionStep>(effect.do ?? []),
});

export const buildExecutionPlan = (rule: RuleJSON): ExecutionPlan[] => {
  const effects = rule.logic?.effects ?? [];
  return effects.map(collectPlanForEffect);
};
