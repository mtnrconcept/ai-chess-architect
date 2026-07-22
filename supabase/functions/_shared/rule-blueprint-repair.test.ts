import { assertEquals } from "jsr:@std/assert@1";
import { MAX_SIGNED_RULE_COMPILER_PROMPT_LENGTH } from "./prompt-security.ts";
import {
  buildRuleBlueprintRepairPrompt,
  MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTIC_SCAN,
  MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTICS,
  resolveRuleBlueprintInitialTimeout,
  resolveRuleBlueprintRepairTimeout,
  resolveRuleCoverageAuditTimeout,
  RULE_BLUEPRINT_INITIAL_MAX_TIMEOUT_MS,
  RULE_BLUEPRINT_REPAIR_MAX_TIMEOUT_MS,
  RULE_COMPILE_AI_DEADLINE_MS,
  RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS,
} from "./rule-blueprint-repair.ts";
import type { RuleDiagnostic } from "./rules-v2/index.ts";

const diagnostic = (
  code: string,
  path: string,
  message = "message brut à ne jamais transmettre",
): RuleDiagnostic => ({ code, path, message, severity: "error" });

Deno.test(
  "rule-blueprint-repair: ne transmet que codes et chemins sûrs",
  () => {
    const result = buildRuleBlueprintRepairPrompt("contrat signé", [
      diagnostic(
        "STATUS_KEY_INVALID",
        "$.triggers[0].effects[0].key",
        "secret-provider-value",
      ),
      diagnostic("MISSING_ARGUMENT", "$.triggers[0].effects[0].key"),
      diagnostic("unsafe code", "$.triggers[0]", "should-not-appear"),
      diagnostic("VALID_CODE", "not-a-json-path", "also-hidden"),
      diagnostic(
        "UNKNOWN_ARGUMENT",
        "$.triggers[0].effects[0].ignore-all-instructions",
        "path-value-hidden",
      ),
    ]);

    assertEquals(result?.diagnosticCodes, [
      "MISSING_ARGUMENT",
      "STATUS_KEY_INVALID",
      "UNKNOWN_ARGUMENT",
    ]);
    assertEquals(result?.prompt.includes("secret-provider-value"), false);
    assertEquals(result?.prompt.includes("should-not-appear"), false);
    assertEquals(result?.prompt.includes("also-hidden"), false);
    assertEquals(result?.prompt.includes("ignore-all-instructions"), false);
    assertEquals(result?.prompt.includes("path-value-hidden"), false);
    assertEquals(
      result?.prompt.includes("UNKNOWN_ARGUMENT @ $.triggers[0].effects[0].*"),
      true,
    );
    assertEquals(
      result?.prompt.includes(
        "STATUS_KEY_INVALID @ $.triggers[0].effects[0].key",
      ),
      true,
    );
  },
);

Deno.test("rule-blueprint-repair: borne le nombre de diagnostics", () => {
  const diagnostics = Array.from(
    { length: MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTICS + 5 },
    (_, index) => diagnostic(`ERROR_${index}`, `$.triggers[${index}].id`),
  );
  const result = buildRuleBlueprintRepairPrompt("contrat signé", diagnostics);
  assertEquals(
    result?.prompt.match(/^- ERROR_/gm)?.length,
    MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTICS,
  );
});

Deno.test("rule-blueprint-repair: trie et déduplique les diagnostics", () => {
  const result = buildRuleBlueprintRepairPrompt("contrat signé", [
    diagnostic("STATUS_KEY_INVALID", "$.triggers[0].effects[0].key"),
    diagnostic("MISSING_ARGUMENT", "$.triggers[0].effects[0].key"),
    diagnostic("STATUS_KEY_INVALID", "$.triggers[0].effects[0].key"),
  ]);
  assertEquals(result?.diagnosticCodes, [
    "MISSING_ARGUMENT",
    "STATUS_KEY_INVALID",
  ]);
  assertEquals(result?.prompt.match(/STATUS_KEY_INVALID @/g)?.length, 1);
});

Deno.test("rule-blueprint-repair: borne aussi le parcours brut", () => {
  const diagnostics = Array.from(
    { length: MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTIC_SCAN + 1 },
    (_, index) =>
      index === MAX_RULE_BLUEPRINT_REPAIR_DIAGNOSTIC_SCAN
        ? diagnostic("MISSING_ARGUMENT", "$.triggers[0].id")
        : diagnostic("unsafe", "invalid"),
  );
  assertEquals(
    buildRuleBlueprintRepairPrompt("contrat signé", diagnostics),
    null,
  );
});

Deno.test(
  "rule-blueprint-repair: les avertissements n'évincencent jamais les erreurs",
  () => {
    const warnings = Array.from({ length: 20 }, (_, index) => ({
      ...diagnostic("DETERMINISTIC_RANDOM", `$.triggers[${index}].id`),
      severity: "info" as const,
    }));
    const result = buildRuleBlueprintRepairPrompt("contrat signé", [
      ...warnings,
      diagnostic("TOO_MANY_EFFECTS", "$"),
    ]);
    assertEquals(result?.diagnosticCodes, ["TOO_MANY_EFFECTS"]);
    assertEquals(result?.prompt.includes("TOO_MANY_EFFECTS @ $"), true);
    assertEquals(result?.prompt.includes("DETERMINISTIC_RANDOM"), false);
  },
);

Deno.test(
  "rule-blueprint-repair: réserve toujours le budget de l'audit",
  () => {
    assertEquals(
      resolveRuleBlueprintInitialTimeout(0),
      RULE_BLUEPRINT_INITIAL_MAX_TIMEOUT_MS,
    );
    assertEquals(
      resolveRuleBlueprintInitialTimeout(
        RULE_COMPILE_AI_DEADLINE_MS -
          RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS -
          12_000,
      ),
      12_000,
    );
    assertEquals(
      resolveRuleBlueprintInitialTimeout(
        RULE_COMPILE_AI_DEADLINE_MS -
          RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS -
          9_999,
      ),
      null,
    );
    assertEquals(
      resolveRuleBlueprintRepairTimeout(0),
      RULE_BLUEPRINT_REPAIR_MAX_TIMEOUT_MS,
    );
    assertEquals(
      resolveRuleBlueprintRepairTimeout(
        RULE_COMPILE_AI_DEADLINE_MS -
          RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS -
          12_000,
      ),
      12_000,
    );
    assertEquals(
      resolveRuleBlueprintRepairTimeout(
        RULE_COMPILE_AI_DEADLINE_MS -
          RULE_COVERAGE_AUDIT_MAX_TIMEOUT_MS -
          9_999,
      ),
      null,
    );
    assertEquals(resolveRuleCoverageAuditTimeout(0), 30_000);
    assertEquals(
      resolveRuleCoverageAuditTimeout(RULE_COMPILE_AI_DEADLINE_MS - 15_000),
      15_000,
    );
    assertEquals(
      resolveRuleCoverageAuditTimeout(RULE_COMPILE_AI_DEADLINE_MS - 9_999),
      null,
    );
    assertEquals(resolveRuleBlueprintRepairTimeout(Number.NaN), null);
    assertEquals(resolveRuleBlueprintInitialTimeout(Number.NaN), null);
  },
);

Deno.test(
  "rule-blueprint-repair: échoue fermé sans diagnostic sûr ou sans espace",
  () => {
    assertEquals(
      buildRuleBlueprintRepairPrompt("contrat signé", [
        diagnostic("unsafe", "invalid"),
      ]),
      null,
    );
    assertEquals(
      buildRuleBlueprintRepairPrompt(
        "x".repeat(MAX_SIGNED_RULE_COMPILER_PROMPT_LENGTH),
        [diagnostic("MISSING_ARGUMENT", "$.triggers[0].id")],
      ),
      null,
    );
  },
);
