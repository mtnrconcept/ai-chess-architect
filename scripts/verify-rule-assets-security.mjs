import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) {
    throw new Error(`${label}: invariant manquant: ${expected}`);
  }
};

const resolver = read("supabase/functions/resolve-rule-assets/index.ts");
for (const invariant of [
  'const OPENVERSE_API = "https://api.openverse.org/v1/images/"',
  'const OPENVERSE_HOST = "api.openverse.org"',
  'redirect: "error"',
  "MAX_RULE_ASSET_BYTES",
  "isAllowedRuleAssetMimeType",
  "sha256Bytes",
  'from(STORAGE_BUCKET)',
  "createSignedUrl",
  "extractRuleSceneIds",
]) {
  requireText(resolver, invariant, "resolve-rule-assets");
}
if (/eval\s*\(|new\s+Function|Deno\.Command|\.html\s*=|innerHTML/.test(resolver)) {
  throw new Error(
    "resolve-rule-assets: exécution dynamique ou rendu HTML interdit.",
  );
}
if (/fetch\s*\(\s*(?:body|prompt|sceneId|candidate\.(?:url|thumbnail))/.test(resolver)) {
  throw new Error(
    "resolve-rule-assets: une valeur non fiable ne doit jamais devenir directement une URL fetch.",
  );
}

const parser = read("supabase/functions/_shared/rule-assets.ts");
for (const invariant of [
  "RULE_SCENE_ID_PATTERN",
  'new Set(["cc0", "pdm", "by"])',
  'new Set(["png", "webp", "jpg", "jpeg"])',
  '"image/png"',
  '"image/webp"',
  '"image/jpeg"',
  "MAX_RULE_SCENES = 4",
]) {
  requireText(parser, invariant, "garde-fous assets");
}
if (/svg|text\/html|javascript:/i.test(parser)) {
  throw new Error(
    "garde-fous assets: aucun format actif ne doit être autorisé.",
  );
}

const migration = read(
  "supabase/migrations/20260720203000_rule_scene_assets.sql",
).toLowerCase();
for (const invariant of [
  "public.rule_scene_assets",
  "public.rule_compilation_scene_assets",
  "enable row level security",
  "revoke all on table public.rule_scene_assets from anon, authenticated",
  "'rule-assets'",
  "false",
  "4194304",
  "image/png",
  "image/webp",
  "image/jpeg",
]) {
  requireText(migration, invariant, "migration assets");
}
if (/create\s+policy[\s\S]{0,160}storage\.objects/.test(migration)) {
  throw new Error(
    "migration assets: le navigateur ne doit recevoir aucune policy directe sur le bucket privé.",
  );
}

const config = read("supabase/config.toml");
requireText(config, "[functions.resolve-rule-assets]", "config Supabase");
requireText(
  config.slice(config.indexOf("[functions.resolve-rule-assets]")),
  "verify_jwt = true",
  "config Supabase",
);

const deployment = read(".github/workflows/deploy-edge-functions.yml");
requireText(deployment, "resolve-rule-assets", "workflow Edge protégé");
const legacyDeployment = read("supabase/scripts/deploy-edge-functions.sh");
requireText(legacyDeployment, "resolve-rule-assets", "helper Edge protégé");

const prompt = read("supabase/functions/_shared/rule-architect-prompt.ts");
for (const invariant of [
  "scene.<slug-anglais>",
  "N'y place jamais d'URL",
  "purement visuelle et non autoritaire",
  "quatre scènes uniques",
]) {
  requireText(prompt, invariant, "prompt Rule Architect");
}

const catalog = read("src/fx/ruleAssetCatalog.ts");
for (const invariant of [
  "/storage/v1/object/sign/rule-assets/",
  'parsed.hostname !== "openverse.org"',
  "ALLOWED_MIME_TYPES",
]) {
  requireText(catalog, invariant, "catalogue client assets");
}

console.log(
  "Rule assets : fournisseur fermé, formats passifs, stockage privé et repli procédural vérifiés.",
);
