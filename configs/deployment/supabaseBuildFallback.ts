export type SupabaseBuildFallbackSource =
  | "vercel-preview-fallback"
  | "vercel-production-fallback";

export type SupabaseBuildFallback = Readonly<{
  url: string;
  projectId: string;
  publishableKey: string;
  configurationSource: SupabaseBuildFallbackSource;
}>;

type BuildEnvironment = Readonly<Record<string, string | undefined>>;

const sharedVercelGuards = Object.freeze({
  VERCEL: "1",
  VERCEL_PROJECT_ID: "prj_Wz5JuoKmuWzZEJE6VWLaKy5zss9j",
  VERCEL_GIT_REPO_OWNER: "mtnrconcept",
  VERCEL_GIT_REPO_SLUG: "ai-chess-architect",
} as const);

export const ruleArchitectPreviewGuards = Object.freeze({
  ...sharedVercelGuards,
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feat/rule-architect-v2",
} as const);

export const ruleArchitectProductionGuards = Object.freeze({
  ...sharedVercelGuards,
  VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
} as const);

// Publishable keys are intentionally public client credentials. Privileged
// service-role, sb_secret_* and OpenAI keys never belong in these targets.
export const ruleArchitectStagingSupabase = Object.freeze({
  url: "https://hxlqmsutvhsxqydpcybj.supabase.co",
  projectId: "hxlqmsutvhsxqydpcybj",
  publishableKey: "sb_publishable_lT5PJuUQ6cUFhQT0peYXIA_v_ecqCyC",
  configurationSource: "vercel-preview-fallback",
} satisfies SupabaseBuildFallback);

export const ruleArchitectProductionSupabase = Object.freeze({
  url: "https://ucaqbhmyutlnitnedowk.supabase.co",
  projectId: "ucaqbhmyutlnitnedowk",
  publishableKey: "sb_publishable_hOLHA7zjNCtCx1bSsvlGXA_aYKJivYg",
  configurationSource: "vercel-production-fallback",
} satisfies SupabaseBuildFallback);

const hasNonEmptyValue = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const hasAnyExplicitSupabaseValue = (environment: BuildEnvironment): boolean =>
  Object.entries(environment).some(
    ([key, value]) =>
      key.startsWith("VITE_SUPABASE_") && hasNonEmptyValue(value),
  );

const matchesGuards = (
  environment: BuildEnvironment,
  guards: Readonly<Record<string, string>>,
): boolean =>
  Object.entries(guards).every(
    ([key, expectedValue]) => environment[key] === expectedValue,
  );

/**
 * Resolves a public Supabase target only for this exact Vercel project and Git
 * source. Any partial explicit VITE_SUPABASE_* configuration stays fail-closed
 * so credentials from different projects can never be mixed.
 */
export const resolveSupabaseBuildFallback = (
  environment: BuildEnvironment,
): SupabaseBuildFallback | null => {
  if (hasAnyExplicitSupabaseValue(environment)) return null;

  if (matchesGuards(environment, ruleArchitectPreviewGuards)) {
    return ruleArchitectStagingSupabase;
  }

  if (matchesGuards(environment, ruleArchitectProductionGuards)) {
    return ruleArchitectProductionSupabase;
  }

  return null;
};
