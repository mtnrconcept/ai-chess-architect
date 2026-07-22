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

const sourceTargets = [
  "src",
  "scripts",
  ".github/workflows",
];
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
      throw new Error(
        `${child}: secret serveur exposé par un nom VITE_.`,
      );
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
requireText(
  edgeAuth,
  'npm:@supabase/supabase-js@2.110.7',
  "auth Edge V2",
);

for (const functionName of [
  "compile-chess-rule",
  "publish-rule-version",
  "create-rule-lobby-v2",
  "join-rule-lobby-v2",
  "process-chess-move",
]) {
  const handler = read(`supabase/functions/${functionName}/index.ts`);
  if (/console\.error\([^\n]*message/.test(handler)) {
    throw new Error(
      `${functionName}: les messages d'erreur bruts ne doivent pas être journalisés.`,
    );
  }
}

const deploymentWorkflow = read(
  ".github/workflows/deploy-edge-functions.yml",
);
requireText(deploymentWorkflow, "workflow_dispatch:", "workflow Edge");
requireText(deploymentWorkflow, "2.109.1", "workflow Edge");
requireText(
  deploymentWorkflow,
  "database_migration_confirmed",
  "workflow Edge",
);
requireText(
  deploymentWorkflow,
  "retention_cron_confirmed",
  "workflow Edge",
);
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
requireText(
  deploymentWorkflow,
  "persist-credentials: false",
  "workflow Edge",
);
requireText(
  deploymentWorkflow,
  'npx --offline --yes "supabase@${SUPABASE_CLI_VERSION}"',
  "workflow Edge",
);

const validationWorkflow = read(
  ".github/workflows/rule-architect-v2-ci.yml",
);
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

for (const forbiddenBootstrap of [
  ".rule-architect-v2",
  "bootstrap-diagnostic.txt",
  ".github/workflows/apply-rule-architect-v2-bootstrap.yml",
]) {
  if (fs.existsSync(path.join(root, forbiddenBootstrap))) {
    throw new Error(
      `${forbiddenBootstrap}: artefact de bootstrap interdit.`,
    );
  }
}

for (const functionName of [
  "compile-chess-rule",
  "publish-rule-version",
  "create-rule-lobby-v2",
  "join-rule-lobby-v2",
  "process-chess-move",
]) {
  requireText(deploymentWorkflow, functionName, "workflow Edge");
}

const legacyEdgeDeploy = read(
  "supabase/scripts/deploy-edge-functions.sh",
);
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
  throw new Error(
    "vercel.json: le fallback SPA Vite est absent.",
  );
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

console.log(
  "Rule Architect V2 : garde-fous frontend, CI, Vercel et SQL vérifiés.",
);
