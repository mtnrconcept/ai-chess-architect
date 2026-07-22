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

const requiredRuntimeFiles = [
  "src/engine/bootstrap.ts",
  "src/engine/engine.ts",
  "src/engine/registry.ts",
  "src/engine/builtins/conditions.ts",
  "src/hooks/useRuleEngine.ts",
  "src/pages/RuleArchitect.tsx",
  "src/pages/RuleLobby.tsx",
  "supabase/functions/compile-chess-rule/index.ts",
  "supabase/functions/publish-rule-version/index.ts",
  "supabase/functions/create-rule-lobby-v2/index.ts",
  "supabase/functions/join-rule-lobby-v2/index.ts",
  "supabase/migrations/20260719230000_rule_architect_v2.sql",
  "supabase/migrations/20260722120000_rule_version_coverage_gate.sql",
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
