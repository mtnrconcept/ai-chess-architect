import type { RuleJSON } from "@/engine/types";
import { extractProgram } from "./nlp/programExtractor";
import { buildRuleFromProgram } from "./factory/ruleFactory";
import { compileIntentToRule, type CompilationWarning } from "./compiler";
import { validateRule, type ValidationIssue } from "./validation/ruleValidator";
import { dryRunRule, type DryRunResult } from "./simulation/dryRun";
import { buildExecutionPlan, type ExecutionPlan } from "./plan/buildPlan";
import {
  buildFallbackProvider,
  type FallbackProvider,
} from "./fallback/providerGenerator";
import type { RuleProgram } from "./rule-language/types";
import type { RuleFactoryWarning } from "./factory/ruleFactory";

export type PipelineOptions = {
  forceFallback?: boolean;
};

export type PipelineResult = {
  program: RuleProgram;
  programWarnings: ReturnType<typeof extractProgram>["warnings"];
  intent: ReturnType<typeof buildRuleFromProgram>["intent"];
  factoryWarnings: RuleFactoryWarning[];
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
  const { program, warnings: programWarnings } = extractProgram(instruction);
  const {
    intent,
    warnings: factoryWarnings,
    tests,
    movementOverrides,
  } = buildRuleFromProgram(program);
  const { rule, warnings: compilationWarnings } = compileIntentToRule(intent);
  const validation = validateRule(intent, rule);
  const dryRun = dryRunRule(intent, rule, tests, movementOverrides);
  const plan = buildExecutionPlan(rule);

  let fallbackProvider: FallbackProvider | undefined;
  const needsFallback =
    options.forceFallback ||
    compilationWarnings.some((warning) => warning.code === "missing_compiler");

  if (needsFallback) {
    fallbackProvider = buildFallbackProvider(intent);
  }

  return {
    program,
    programWarnings,
    intent,
    factoryWarnings,
    rule,
    compilationWarnings,
    validation,
    dryRun,
    plan,
    fallbackProvider,
  };
};
