import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceRoot = path.join(root, "src", "rules-v2");
const edgeRoot = path.join(
  root,
  "supabase",
  "functions",
  "_shared",
  "rules-v2",
);

const names = [
  "types.ts",
  "catalog.ts",
  "schema.ts",
  "compiler.ts",
  "hash.ts",
  "deterministic-rng.ts",
  "runtime-budget.ts",
  "index.ts",
];

const normaliseEdgeImports = (value) =>
  value
    .replace(/from "(\.\/[^"]+)\.ts"/g, 'from "$1"')
    .replace(/export \* from "(\.\/[^"]+)\.ts"/g, 'export * from "$1"');

for (const name of names) {
  const sourcePath = path.join(sourceRoot, name);
  const edgePath = path.join(edgeRoot, name);

  if (!fs.existsSync(sourcePath) || !fs.existsSync(edgePath)) {
    throw new Error(`Module Rule Architect manquant: ${name}`);
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  const edge = normaliseEdgeImports(fs.readFileSync(edgePath, "utf8"));

  if (source !== edge) {
    throw new Error(
      `Le module Edge ${name} n'est plus synchronisé avec src/rules-v2.`,
    );
  }
}

const conditions = fs.readFileSync(
  path.join(root, "src", "engine", "builtins", "conditions.ts"),
  "utf8",
);

if (conditions.includes("Math.random(")) {
  throw new Error(
    "Math.random() ne doit pas être utilisé par les conditions du moteur.",
  );
}

const registry = fs.readFileSync(
  path.join(root, "src", "engine", "registry.ts"),
  "utf8",
);

if (/Condition inconnue[\s\S]{0,200}return true/.test(registry)) {
  throw new Error("Le registre semble encore accepter une condition inconnue.");
}

console.log("Rule Architect V2 : invariants vérifiés.");

const guidanceSource = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "functions",
    "generate-rule-questions",
    "index.ts",
  ),
  "utf8",
);
const architectPromptSource = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "functions",
    "_shared",
    "rule-architect-prompt.ts",
  ),
  "utf8",
);

for (const invariant of [
  "RULE_ACTION_SEMANTICS",
  "cooldownTurns=N",
  'feasibility="direct"',
  'adaptation=""',
  "Le champ racine sides est le périmètre autoritaire",
  'toutes les actions et tous les triggers. sides=["white","black"] réalise',
  "directement une règle disponible pour les deux camps.",
]) {
  if (!architectPromptSource.includes(invariant)) {
    throw new Error(`Contrat natif d'action manquant: ${invariant}`);
  }
}
if (
  !guidanceSource.includes("import { RULE_ACTION_SEMANTICS }") ||
  !guidanceSource.includes("${RULE_ACTION_SEMANTICS}")
) {
  throw new Error(
    "Le guidage IA n'intègre plus le contrat autoritaire des actions UI.",
  );
}

for (const invariant of [
  '"evidenceKind"',
  '"expectedSides"',
  'schemaName: "rule_guidance_v2"',
]) {
  if (!guidanceSource.includes(invariant)) {
    throw new Error(`Contrat de guidage V2 manquant: ${invariant}`);
  }
}

const coverageSource = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "functions",
    "_shared",
    "rule-coverage.ts",
  ),
  "utf8",
);
for (const invariant of [
  "version: 2",
  '"$.sides"',
  "COVERAGE_EVIDENCE_CONTRACT_INVALID",
  "COVERAGE_LOGIC_EVIDENCE_REQUIRED",
  "COVERAGE_SIDE_SCOPE_EVIDENCE_REQUIRED",
  "COVERAGE_SIDE_SCOPE_MISMATCH",
]) {
  if (!coverageSource.includes(invariant)) {
    throw new Error(`Contrat de preuve V2 manquant: ${invariant}`);
  }
}

const guidanceValidationSource = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "functions",
    "_shared",
    "rule-guidance-validation.ts",
  ),
  "utf8",
);
if (!guidanceValidationSource.includes("GUIDANCE_CHOICE_SCOPE_MISMATCH")) {
  throw new Error("Le validateur ne protège plus l'homogénéité des camps.");
}

const compileSource = fs.readFileSync(
  path.join(root, "supabase", "functions", "compile-chess-rule", "index.ts"),
  "utf8",
);
for (const invariant of [
  'schemaName: "rule_coverage_audit_v2"',
  "coverageContractVersion: intentContract.version",
]) {
  if (!compileSource.includes(invariant)) {
    throw new Error(`Audit de couverture V2 manquant: ${invariant}`);
  }
}

const requiredRuntimeFiles = [
  "src/engine/bootstrap.ts",
  "src/engine/engine.ts",
  "src/engine/registry.ts",
  "src/engine/builtins/conditions.ts",
  "src/hooks/useRuleEngine.ts",
  "src/pages/RuleArchitect.tsx",
  "src/pages/RuleLobby.tsx",
  "supabase/functions/compile-chess-rule/index.ts",
  "supabase/functions/_shared/guidance-failure.ts",
  "supabase/functions/_shared/legacy-guidance-compat.ts",
  "supabase/functions/_shared/rule-blueprint-repair.ts",
  "supabase/functions/publish-rule-version/index.ts",
  "supabase/functions/create-rule-lobby-v2/index.ts",
  "supabase/functions/join-rule-lobby-v2/index.ts",
  "supabase/functions/integration-health/index.ts",
  "supabase/migrations/20260719230000_rule_architect_v2.sql",
  "supabase/migrations/20260722120000_rule_version_coverage_gate.sql",
  "supabase/migrations/20260722130000_harden_rule_version_coverage_gate.sql",
  "supabase/migrations/20260722140000_fail_closed_custom_pvp_runtime.sql",
  "supabase/migrations/20260722150000_secure_api_registry_for_integration_health.sql",
  "supabase/migrations/20260722160000_legacy_guidance_compat_sessions.sql",
  "supabase/migrations/20260722161000_harden_legacy_guidance_compat_session_grants.sql",
  "supabase/rollbacks/20260722140000_fail_closed_custom_pvp_runtime.down.sql",
  "supabase/rollbacks/20260722150000_secure_api_registry_for_integration_health.down.sql",
  "supabase/rollbacks/20260722160000_legacy_guidance_compat_sessions.down.sql",
  "supabase/rollbacks/20260722161000_harden_legacy_guidance_compat_session_grants.down.sql",
  "supabase/tests/api_registry_integration_health.sql",
  "supabase/tests/rule_version_coverage_gate.sql",
  "supabase/tests/legacy_guidance_compat_sessions.sql",
];

for (const relative of requiredRuntimeFiles) {
  if (!fs.existsSync(path.join(root, relative))) {
    throw new Error(`Fichier Rule Architect V2 manquant: ${relative}`);
  }
}

const migration = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260719230000_rule_architect_v2.sql",
  ),
  "utf8",
);

for (const invariant of [
  "publish_rule_compilation_v2",
  "create_rule_lobby_v2",
  "join_rule_lobby_v2",
  "get_rule_lobby_runtime_v2",
  "protect_versioned_chess_rule",
  "DEDUPLICATED_PUBLICATION",
]) {
  if (!migration.includes(invariant)) {
    throw new Error(`Invariant SQL manquant: ${invariant}`);
  }
}

console.log("Runtime, fonctions Edge et migration V2 : présents.");
