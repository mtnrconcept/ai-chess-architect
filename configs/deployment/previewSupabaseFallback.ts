export type PreviewSupabaseFallback = Readonly<{
  url: string;
  projectId: string;
  publishableKey: string;
}>;

type BuildEnvironment = Readonly<Record<string, string | undefined>>;

export const ruleArchitectPreviewGuards = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_Wz5JuoKmuWzZEJE6VWLaKy5zss9j",
  VERCEL_GIT_REPO_OWNER: "mtnrconcept",
  VERCEL_GIT_REPO_SLUG: "ai-chess-architect",
  VERCEL_GIT_COMMIT_REF: "feat/rule-architect-v2",
} as const);

// Supabase publishable keys are designed for browser clients. This fallback is
// nevertheless limited to the disposable PR #306 staging project and can never
// be selected for a production build.
export const ruleArchitectStagingSupabase = Object.freeze({
  url: "https://hxlqmsutvhsxqydpcybj.supabase.co",
  projectId: "hxlqmsutvhsxqydpcybj",
  publishableKey: "sb_publishable_lT5PJuUQ6cUFhQT0peYXIA_v_ecqCyC",
} satisfies PreviewSupabaseFallback);

const hasNonEmptyValue = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const hasAnyExplicitSupabaseValue = (environment: BuildEnvironment): boolean =>
  Object.entries(environment).some(
    ([key, value]) =>
      key.startsWith("VITE_SUPABASE_") && hasNonEmptyValue(value),
  );

/**
 * Returns the public staging target only for the exact PR #306 Vercel Preview.
 * A partial explicit Supabase configuration deliberately stays fail-closed so
 * that a URL, project reference and key from different projects are never mixed.
 */
export const resolvePreviewSupabaseFallback = (
  environment: BuildEnvironment,
): PreviewSupabaseFallback | null => {
  const matchesExpectedPreview = Object.entries(
    ruleArchitectPreviewGuards,
  ).every(([key, expectedValue]) => environment[key] === expectedValue);

  if (!matchesExpectedPreview || hasAnyExplicitSupabaseValue(environment)) {
    return null;
  }

  return ruleArchitectStagingSupabase;
};
