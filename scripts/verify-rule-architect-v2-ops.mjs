import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const requireText = (source, expected, label) => {
  if (!source.includes(expected)) {
    throw new Error(`${label}: invariant manquant: ${expected}`);
  }
};

const runtimeTargets = [
  "src/integrations/supabase/client.ts",
  "scripts/supabase-db-push.mjs",
  "scripts/run-supabase-migrations.mjs",
  "scripts/sync-tournaments.mjs",
  "scripts/migrate-legacy-rules-to-db.mjs",
  "scripts/fix-tournaments.mjs",
  "scripts/refresh-postgrest-schema.mjs",
  "supabase/config.toml",
];

for (const relativePath of runtimeTargets) {
  const source = read(relativePath);
  if (source.includes("pfcaolibtgvynnwaxvol")) {
    throw new Error(
      `${relativePath}: une référence Supabase distante est codée en dur.`,
    );
  }
}

const sourceTargets = ["src", "scripts", ".github/workflows"];
const forbiddenVariable = /VITE_[A-Z0-9_]*(?:SERVICE_ROLE|OPENAI_API_KEY)/;

const visit = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  for (const entry of fs.readdirSync(absolutePath, {
    withFileTypes: true,
  })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      visit(child);
      continue;
    }
    if (!/\.(?:[cm]?[jt]sx?|ya?ml)$/.test(entry.name)) {
      continue;
    }
    if (forbiddenVariable.test(read(child))) {
      throw new Error(`${child}: secret serveur exposé par un nom VITE_.`);
    }
  }
};

sourceTargets.forEach(visit);

const client = read("src/integrations/supabase/client.ts");
requireText(client, "VITE_SUPABASE_URL", "client Supabase");
requireText(client, "sb_secret_", "client Supabase");
requireText(client, 'readJwtRole(value) === "anon"', "client Supabase");
if (/EXPECTED_PROJECT|EFFECTIVE_PROJECT/.test(client)) {
  throw new Error(
    "client Supabase: aucun projet distant par défaut n'est autorisé.",
  );
}

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.scripts?.build !== "vite build --mode production" ||
  packageJson.scripts?.postbuild
) {
  throw new Error(
    "package.json: le build doit rester pur, sans synchronisation ni webhook postbuild.",
  );
}
requireText(
  packageJson.scripts?.["deploy:lovable"] ?? "",
  "trigger-lovable-deploy.mjs",
  "package.json",
);
requireText(
  read("scripts/run-supabase-migrations.mjs"),
  "supabase-db-push.mjs",
  "alias db:migrate",
);

const exampleEnv = read(".env.example");
if (/ngrok-free|^OPENAI_API_KEY=/m.test(exampleEnv)) {
  throw new Error(
    ".env.example: URL temporaire ou secret OpenAI actif interdit.",
  );
}

const lovableHook = read("scripts/trigger-lovable-deploy.mjs");
requireText(lovableHook, "parsedHookUrl.origin", "webhook Lovable");
if (/response\.text\(|\$\{hookUrl\}/.test(lovableHook)) {
  throw new Error(
    "webhook Lovable: l'URL complète ou le corps de réponse ne doit jamais être journalisé.",
  );
}
if (/catch\s*\([^)]*\)[\s\S]{0,180}LOVABLE_DEPLOY_HEADERS/.test(lovableHook)) {
  throw new Error(
    "webhook Lovable: l'erreur de parsing des headers doit rester constante.",
  );
}

const edgeAuth = read("supabase/functions/_shared/auth-v2.ts");
requireText(edgeAuth, "npm:@supabase/supabase-js@2.110.7", "auth Edge V2");

for (const functionName of [
  "compile-chess-rule",
  "publish-rule-version",
  "create-rule-lobby-v2",
  "join-rule-lobby-v2",
  "process-chess-move",
  "integration-health",
]) {
  const handler = read(`supabase/functions/${functionName}/index.ts`);
  if (/console\.error\([^\n]*message/.test(handler)) {
    throw new Error(
      `${functionName}: les messages d'erreur bruts ne doivent pas être journalisés.`,
    );
  }
}

const deploymentWorkflow = read(".github/workflows/deploy-edge-functions.yml");
requireText(deploymentWorkflow, "workflow_dispatch:", "workflow Edge");
requireText(deploymentWorkflow, "2.109.1", "workflow Edge");
requireText(
  deploymentWorkflow,
  "database_migration_confirmed",
  "workflow Edge",
);
requireText(deploymentWorkflow, "retention_cron_confirmed", "workflow Edge");
if (/^\s{2}push:/m.test(deploymentWorkflow)) {
  throw new Error(
    "workflow Edge: le déploiement automatique sur push est interdit.",
  );
}
if (
  /^\s{6}SUPABASE_ACCESS_TOKEN:/m.test(deploymentWorkflow) ||
  deploymentWorkflow.includes("supabase/setup-cli@")
) {
  throw new Error(
    "workflow Edge: le token ne doit pas être global et le CLI doit être invoqué à une version npm exacte.",
  );
}
requireText(deploymentWorkflow, "persist-credentials: false", "workflow Edge");
requireText(
  deploymentWorkflow,
  'npx --offline --yes "supabase@${SUPABASE_CLI_VERSION}"',
  "workflow Edge",
);

const validationWorkflow = read(".github/workflows/rule-architect-v2-ci.yml");
if (/^\s+paths:/m.test(validationWorkflow)) {
  throw new Error(
    "workflow CI V2: aucun filtre paths ne doit pouvoir éviter les contrôles.",
  );
}
requireText(
  validationWorkflow,
  "pnpm install --frozen-lockfile --ignore-scripts",
  "workflow CI V2",
);

for (const testPath of [
  "src/engine/adapters/matchAdapter.test.ts",
  "src/contexts/auth-session.test.ts",
  "src/features/rule-architect/lobby-launch-policy.test.ts",
  "src/lib/__tests__/aiOpponent.test.ts",
  "src/routing/route-error.test.ts",
]) {
  requireText(validationWorkflow, testPath, "workflow CI V2");
}

const denoCheckBlock = validationWorkflow.match(
  /deno check --node-modules-dir=manual[\s\S]*?2>&1 \| tee deno-check\.log/,
)?.[0];
if (!denoCheckBlock) {
  throw new Error(
    "workflow CI V2: le bloc de typecheck Deno protégé est introuvable.",
  );
}

for (const edgeEntrypoint of [
  "supabase/functions/create-rule-lobby-v2/index.ts",
  "supabase/functions/join-rule-lobby-v2/index.ts",
  "supabase/functions/integration-health/index.ts",
]) {
  requireText(
    denoCheckBlock,
    edgeEntrypoint,
    "typecheck Edge du runtime PvP personnalisé",
  );
}

for (const forbiddenBootstrap of [
  ".rule-architect-v2",
  "bootstrap-diagnostic.txt",
  ".github/workflows/apply-rule-architect-v2-bootstrap.yml",
]) {
  if (fs.existsSync(path.join(root, forbiddenBootstrap))) {
    throw new Error(`${forbiddenBootstrap}: artefact de bootstrap interdit.`);
  }
}

const deployedFunctionsBlock = deploymentWorkflow.match(
  /functions=\([\s\S]*?\n\s*\)/,
)?.[0];
if (!deployedFunctionsBlock) {
  throw new Error(
    "workflow Edge: la liste explicite des fonctions à déployer est introuvable.",
  );
}

for (const functionName of [
  "compile-chess-rule",
  "publish-rule-version",
  "create-rule-lobby-v2",
  "join-rule-lobby-v2",
  "process-chess-move",
  "integration-health",
]) {
  requireText(
    deployedFunctionsBlock,
    functionName,
    "allowlist du workflow Edge",
  );
}

const generatedSupabaseTypes = read("src/integrations/supabase/types.ts");
const apiRegistryTypes = generatedSupabaseTypes.match(
  /api_registry:\s*\{([\s\S]*?)Relationships:\s*\[\]/,
)?.[1];
if (!apiRegistryTypes) {
  throw new Error("types Supabase: le schéma api_registry est introuvable.");
}

const apiRegistryRow = apiRegistryTypes.match(
  /Row:\s*\{([\s\S]*?)\n\s*};?\s*\n\s*Insert:/,
)?.[1];
const apiRegistryInsert = apiRegistryTypes.match(
  /Insert:\s*\{([\s\S]*?)\n\s*};?\s*\n\s*Update:/,
)?.[1];
const apiRegistryUpdate = apiRegistryTypes.match(
  /Update:\s*\{([\s\S]*?)\n\s*};?\s*$/,
)?.[1];

if (!apiRegistryRow || !apiRegistryInsert || !apiRegistryUpdate) {
  throw new Error(
    "types Supabase: Row, Insert ou Update manque pour api_registry.",
  );
}

const apiCategoryType = '"supabase" | "edge_function" | "coach_api" | "http"';
const expectedApiRegistryShapes = [
  [
    "Row",
    apiRegistryRow,
    [
      "active: boolean",
      `category: ${apiCategoryType}`,
      "config: Json",
      "created_at: string",
      "id: string",
      "method: string | null",
      "notes: string | null",
      "service: string",
      "target: string",
      "updated_at: string",
    ],
  ],
  [
    "Insert",
    apiRegistryInsert,
    [
      "active?: boolean",
      `category: ${apiCategoryType}`,
      "config?: Json",
      "created_at?: string",
      "id?: string",
      "method?: string | null",
      "notes?: string | null",
      "service: string",
      "target: string",
      "updated_at?: string",
    ],
  ],
  [
    "Update",
    apiRegistryUpdate,
    [
      "active?: boolean",
      `category?: ${apiCategoryType}`,
      "config?: Json",
      "created_at?: string",
      "id?: string",
      "method?: string | null",
      "notes?: string | null",
      "service?: string",
      "target?: string",
      "updated_at?: string",
    ],
  ],
];

for (const [shapeName, shapeSource, invariants] of expectedApiRegistryShapes) {
  for (const invariant of invariants) {
    requireText(
      shapeSource,
      invariant,
      `types Supabase api_registry ${shapeName}`,
    );
  }
}

for (const legacyColumn of [
  "api_key_env:",
  "endpoint_url:",
  "is_active:",
  "last_checked_at:",
  "metadata:",
  "service_name:",
  "status:",
]) {
  if (apiRegistryTypes.includes(legacyColumn)) {
    throw new Error(
      `types Supabase api_registry: ancienne colonne encore présente: ${legacyColumn}`,
    );
  }
}

const legacyEdgeDeploy = read("supabase/scripts/deploy-edge-functions.sh");
requireText(
  legacyEdgeDeploy,
  "SUPABASE_PROJECT_REF_CONFIRMATION",
  "helper Edge legacy",
);
requireText(
  legacyEdgeDeploy,
  "must be deployed through the protected GitHub workflow",
  "helper Edge legacy",
);
requireText(
  legacyEdgeDeploy,
  "env -u SUPABASE_ACCESS_TOKEN",
  "helper Edge legacy",
);

const vercel = JSON.parse(read("vercel.json"));
if (
  vercel.framework !== "vite" ||
  !Array.isArray(vercel.rewrites) ||
  vercel.rewrites[0]?.destination !== "/index.html"
) {
  throw new Error("vercel.json: le fallback SPA Vite est absent.");
}

const migration = read(
  "supabase/migrations/20260719230000_rule_architect_v2.sql",
);
const lowerMigration = migration.toLowerCase();
const securityDefinerCount =
  lowerMigration.match(/security\s+definer/g)?.length ?? 0;
const hardenedSearchPathCount =
  lowerMigration.match(/set\s+search_path\s*=\s*''/g)?.length ?? 0;

if (
  securityDefinerCount === 0 ||
  securityDefinerCount !== hardenedSearchPathCount
) {
  throw new Error(
    "migration V2: chaque fonction SECURITY DEFINER doit fixer search_path à une chaîne vide.",
  );
}

if (/set\s+search_path\s*=\s*public/.test(lowerMigration)) {
  throw new Error(
    "migration V2: search_path=public est interdit aux fonctions SECURITY DEFINER.",
  );
}

for (const tableName of [
  "rule_compilations",
  "rule_blueprints",
  "rule_versions",
]) {
  requireText(
    lowerMigration,
    `alter table public.${tableName} enable row level security`,
    "migration V2",
  );
}

for (const invariant of [
  "request_key uuid",
  "published_version_id",
  "expires_at > now()",
  "cleanup_expired_rule_compilations",
  "protect_legacy_lobby_join_update",
  "legacy_lobby_join_fields_forbidden",
  "revoke all on function",
]) {
  requireText(lowerMigration, invariant, "migration V2");
}

if (/drop\s+table/.test(lowerMigration)) {
  throw new Error(
    "migration V2: DROP TABLE est interdit dans cette migration additive.",
  );
}

const earlyChessRulesConstraint = read(
  "supabase/migrations/20250601120000_add_unique_constraint_to_chess_rules_rule_id.sql",
).toLowerCase();
for (const invariant of [
  "pg_catalog.to_regclass('public.chess_rules') is null",
  "execute $deduplicate$",
]) {
  requireText(
    earlyChessRulesConstraint,
    invariant,
    "migration historique chess_rules",
  );
}

const earlyTournamentAiColumns = read(
  "supabase/migrations/20251012190417_add_ai_columns_to_tournament_matches.sql",
).toLowerCase();
requireText(
  earlyTournamentAiColumns,
  "pg_catalog.to_regclass('public.tournament_matches') is null",
  "migration historique tournament_matches",
);

const tournamentAiColumnRepair = read(
  "supabase/migrations/20260722123000_ensure_tournament_match_ai_columns.sql",
).toLowerCase();
for (const columnName of [
  "is_ai_match",
  "ai_opponent_label",
  "ai_opponent_difficulty",
]) {
  requireText(
    tournamentAiColumnRepair,
    `add column if not exists ${columnName}`,
    "migration corrective tournament_matches",
  );
}

const retentionCronMigration = read(
  "supabase/migrations/20260720184000_rule_architect_retention_cron.sql",
).toLowerCase();
requireText(
  retentionCronMigration,
  "create extension if not exists pg_cron",
  "migration de rétention",
);
requireText(retentionCronMigration, "cron.schedule(", "migration de rétention");

const hardenedCoverageGate = read(
  "supabase/migrations/20260722130000_harden_rule_version_coverage_gate.sql",
).toLowerCase();
for (const invariant of [
  "is distinct from 'true'::jsonb",
  "is distinct from 'array'",
  "jsonb_path_exists(",
  "('strict ' ||",
  "rule_version_coverage_evidence_invalid",
  "rule_version_coverage_adaptation_invalid",
  "rule_version_compilation_proof_mismatch",
  "compilation.metrics = new.validation",
  "rule_version_historical_coverage_contract_unsupported",
  "rule_version_legacy_compilation_proof_mismatch",
  "compilation.user_id = version.created_by",
  "compilation.blueprint = version.blueprint_json",
  "compilation.content_hash = version.content_hash",
  "compilation.metrics = version.validation",
  "legacy_precontract_uncertified=%",
  "rule_versions_coverage_historical_audit",
]) {
  requireText(
    hardenedCoverageGate,
    invariant,
    "garde-fou de couverture renforcé",
  );
}

const customPvpRuntimeGate = read(
  "supabase/migrations/20260722140000_fail_closed_custom_pvp_runtime.sql",
).toLowerCase();
for (const invariant of [
  "create or replace function private.enforce_custom_pvp_runtime_availability()",
  "custom_pvp_runtime_not_authoritative",
  "new.rule_set_hash is not null",
  "new.mode = 'player'",
  "tg_op = 'insert'",
  "new.status = 'matched'",
  "new.opponent_id is not null",
  "set search_path = ''",
  "revoke all on function private.enforce_custom_pvp_runtime_availability()",
  "from public, anon, authenticated",
  "lobbies_custom_pvp_runtime_gate",
  "before insert or update of mode, rule_set_hash, status, opponent_id",
]) {
  requireText(
    customPvpRuntimeGate,
    invariant,
    "garde-fou du runtime pvp personnalisé",
  );
}

for (const functionName of ["create-rule-lobby-v2", "join-rule-lobby-v2"]) {
  const handler = read(`supabase/functions/${functionName}/index.ts`);
  for (const invariant of [
    "CUSTOM_PVP_RUNTIME_NOT_AUTHORITATIVE",
    "jsonResponse(request, 409",
  ]) {
    requireText(
      handler,
      invariant,
      `${functionName}: refus fail-closed du runtime PvP personnalisé`,
    );
  }
}

const coverageGateTest = read(
  "supabase/tests/rule_version_coverage_gate.sql",
).toLowerCase();
for (const expectedCase of [
  "empty_coverage_was_accepted",
  "missing_complete_was_accepted",
  "string_contract_version_was_accepted",
  "unknown_engine_was_accepted",
  "invalid_decision_was_accepted",
  "empty_requirement_id_was_accepted",
  "padded_requirement_id_was_accepted",
  "duplicate_requirement_id_was_accepted",
  "mismatched_requirement_id_was_accepted",
  "missing_fidelity_requirement_was_accepted",
  "missing_evidence_was_accepted",
  "description_evidence_was_accepted",
  "lax_jsonpath_structure_was_accepted",
  "nonexistent_evidence_was_accepted",
  "unsupported_status_was_accepted",
  "implemented_status_masked_adaptation",
  "inconsistent_exact_intent_was_accepted",
  "unapproved_adaptation_was_accepted",
  "mismatched_compilation_proof_was_accepted",
  "mismatched_compilation_blueprint_was_accepted",
  "mismatched_compilation_metrics_was_accepted",
  "unvalidated_compilation_was_accepted",
  "valid_coverage_was_rejected",
  "valid_adapted_coverage_was_rejected",
  "valid_historical_replay_was_rejected",
  "valid_legacy_precontract_proof_was_rejected",
  "legacy_precontract_was_certified",
  "legacy_precontract_trigger_bypass_was_accepted",
  "invalid_v1_historical_replay_was_accepted",
  "legacy_proof_mismatch_was_accepted",
  "v1_proof_mismatch_was_accepted",
]) {
  requireText(
    coverageGateTest,
    expectedCase,
    "test SQL du garde-fou de couverture",
  );
}

console.log(
  "Rule Architect V2 : garde-fous frontend, CI, Vercel et SQL vérifiés.",
);
