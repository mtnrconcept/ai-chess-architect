import type { RuleJSON } from "@/engine/types";
import { parseIntent, type IntentParseWarning } from "./nlp/intentParser";
import { compileIntentToRule, type CompilationWarning } from "./compiler";
import { validateRule, type ValidationIssue } from "./validation/ruleValidator";
import { dryRunRule, type DryRunResult } from "./simulation/dryRun";
import { buildExecutionPlan, type ExecutionPlan } from "./plan/buildPlan";
import {
  buildFallbackProvider,
  type FallbackProvider,
} from "./fallback/providerGenerator";

export type PipelineOptions = {
  forceFallback?: boolean;
};

export type PipelineResult = {
  intent: ReturnType<typeof parseIntent>["intent"];
  intentWarnings: IntentParseWarning[];
  rule: RuleJSON;
  compilationWarnings: CompilationWarning[];
  validation: { issues: ValidationIssue[]; isValid: boolean };
  dryRun: DryRunResult;
  plan: ExecutionPlan[];
  fallbackProvider?: FallbackProvider;
};

export const generateRulePipeline = (
  instruction: string,
  options: PipelineOptions = {},
): PipelineResult => {
  const { intent, warnings: intentWarnings } = parseIntent(instruction);
  const { rule, warnings: compilationWarnings } = compileIntentToRule(intent);
  const validation = validateRule(intent, rule);
  const dryRun = dryRunRule(intent, rule);
  const plan = buildExecutionPlan(rule);

  let fallbackProvider: FallbackProvider | undefined;
  const needsFallback =
    options.forceFallback ||
    compilationWarnings.some((warning) => warning.code === "missing_compiler");

  if (needsFallback) {
    fallbackProvider = buildFallbackProvider(intent);
  }

  return {
    intent,
    intentWarnings,
    rule,
    compilationWarnings,
    validation,
    dryRun,
    plan,
    fallbackProvider,
  };
};
