import { MAX_SIGNED_RULE_COMPILER_PROMPT_LENGTH } from "./prompt-security.ts";
import {
  CONDITION_CATALOG,
  EFFECT_CATALOG,
  type RuleDiagnostic,
} from "./rules-v2/index.ts";

export const MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTICS = 12;
export const MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTIC_SCAN = 256;
export const RULE_COMPILE_AI_DEADLINE_MS = 135_000;
export const RULE_BLUEPRINT_INITIAL_MAX_TIMEOUT_MS = 55_000;
export const RULE_BLUEPRINT_REPAIR_MAX_TIMEOUT_MS = 40_000;
export const RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS = 30_000;
const MIN_STRUCTURED_RESPONSE_TIMEOUT_MS = 10_000;

const DIAGNOSTIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_PATH_SEGMENTS = new Set([
  "schemaVersion",
  "ruleKey",
  "title",
  "summary",
  "category",
  "tags",
  "affectedPieces",
  "sides",
  "stateNamespace",
  "initialStateJson",
  "actions",
  "triggers",
  "balance",
  "explanation",
  "id",
  "label",
  "description",
  "targetingMode",
  "validTilesProvider",
  "consumesTurn",
  "cooldownTurns",
  "maxPerPiece",
  "requiresSelection",
  "pieceTypes",
  "event",
  "actionId",
  "conditions",
  "effects",
  "negate",
  "op",
  "arguments",
  "kind",
  "stringValue",
  "numberValue",
  "booleanValue",
  "stringListValue",
  "plainLanguage",
  "examples",
  "powerLevel",
  "counterplay",
  "limitations",
  ...Object.values(CONDITION_CATALOG).flatMap((spec) => Object.keys(spec.args)),
  ...Object.values(EFFECT_CATALOG).flatMap((spec) => Object.keys(spec.args)),
]);

const canonicalizeDiagnosticPath = (value: string): string | null => {
  if (!value.startsWith("$")) return null;
  if (value === "$") return "$";
  let cursor = 1;
  let tokens = 0;
  let result = "$";

  while (cursor < value.length && tokens < 20) {
    const remaining = value.slice(cursor);
    const segment = /^\.([A-Za-z][A-Za-z0-9_-]{0,63})/.exec(remaining);
    if (segment) {
      result += SAFE_PATH_SEGMENTS.has(segment[1]) ? segment[0] : ".*";
      cursor += segment[0].length;
      tokens += 1;
      continue;
    }
    const index = /^\[([0-9]{1,3})\]/.exec(remaining);
    if (index) {
      result += `[${Number(index[1])}]`;
      cursor += index[0].length;
      tokens += 1;
      continue;
    }
    return null;
  }

  return cursor === value.length && tokens > 0 ? result : null;
};

export interface RuleBlueprintRepairPrompt {
  prompt: string;
  diagnosticCodes: string[];
}

const boundedRemaining = (elapsedMs: number, reserveMs: number): number => {
  const elapsed = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.trunc(elapsedMs))
    : RULE_COMPILE_AI_DEADLINE_MS;
  return RULE_COMPILE_AI_DEADLINE_MS - elapsed - reserveMs;
};

export const resolveRuleBlueprintRepairTimeout = (
  elapsedMs: number,
): number | null => {
  const available = Math.min(
    RULE_BLUEPRINT_REPAIR_MAX_TIMEOUT_MS,
    boundedRemaining(elapsedMs, RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS),
  );
  return available >= MIN_STRUCTURED_RESPONSE_TIMEOUT_MS ? available : null;
};

export const resolveRuleBlueprintInitialTimeout = (
  elapsedMs: number,
): number | null => {
  const available = Math.min(
    RULE_BLUEPRINT_INITIAL_MAX_TIMEOUT_MS,
    boundedRemaining(elapsedMs, RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS),
  );
  return available >= MIN_STRUCTURED_RESPONSE_TIMEOUT_MS ? available : null;
};

export const resolveRuleCoverageAuditTimeout = (
  elapsedMs: number,
): number | null => {
  const available = Math.min(
    RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS,
    boundedRemaining(elapsedMs, 0),
  );
  return available >= MIN_STRUCTURED_RESPONSE_TIMEOUT_MS ? available : null;
};

/**
 * Gives the model one bounded chance to regenerate a structurally invalid
 * blueprint. Only compiler-owned codes and JSON paths cross the boundary: raw
 * values, messages and the rejected blueprint are deliberately excluded.
 */
export const buildRuleBlueprintRepairPrompt = (
  signedCompilerPrompt: string,
  diagnostics: readonly RuleDiagnostic[],
): RuleBlueprintRepairPrompt | null => {
  const safeByKey = new Map<string, { code: string; path: string }>();
  const scanLength = Math.min(
    diagnostics.length,
    MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTIC_SCAN,
  );
  for (
    let index = 0;
    index < scanLength &&
    safeByKey.size < MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTICS;
    index += 1
  ) {
    const diagnostic = diagnostics[index];
    if (diagnostic.severity !== "error") continue;
    const path = canonicalizeDiagnosticPath(diagnostic.path);
    if (!DIAGNOSTIC_CODE_PATTERN.test(diagnostic.code) || !path) continue;
    safeByKey.set(`${diagnostic.code}\u0000${path}`, {
      code: diagnostic.code,
      path,
    });
  }

  const safeDiagnostics = Array.from(safeByKey.values()).sort((left, right) => {
    const leftKey = `${left.code}\u0000${left.path}`;
    const rightKey = `${right.code}\u0000${right.path}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  if (safeDiagnostics.length === 0) return null;

  const suffix = [
    "<DIAGNOSTICS_COMPILATEUR_SERVEUR>",
    ...safeDiagnostics.map(
      (diagnostic) => `- ${diagnostic.code} @ ${diagnostic.path}`,
    ),
    "</DIAGNOSTICS_COMPILATEUR_SERVEUR>",
    "Le blueprint précédent a été refusé. Régénère l’objet complet depuis le cahier des charges ci-dessus.",
    "Pour chaque RuleArgument, utilise le kind attendu et place la valeur dans le champ correspondant : stringValue, numberValue, booleanValue ou stringListValue. Laisse les autres champs à leur valeur neutre.",
    "Ne modifie jamais l’intention signée et n’invente aucune opération hors catalogue.",
  ].join("\n");
  const prompt = `${signedCompilerPrompt.trim()}\n\n${suffix}`;

  if (prompt.length > MAX_SIGNED_RULE_COMPILER_PROMPT_LENGTH) return null;

  return {
    prompt,
    diagnosticCodes: Array.from(
      new Set(safeDiagnostics.map((diagnostic) => diagnostic.code)),
    ),
  };
};
