import { describe, expect, it } from "vitest";
import {
  resolveSupabaseBuildFallback,
  ruleArchitectPreviewGuards,
  ruleArchitectProductionGuards,
  ruleArchitectProductionSupabase,
  ruleArchitectStagingSupabase,
  type SupabaseBuildFallback,
} from "./supabaseBuildFallback";

const assertPublicTarget = (target: SupabaseBuildFallback) => {
  expect(target.publishableKey).toMatch(/^sb_publishable_/);
  expect(target.publishableKey).not.toMatch(/service_role|sb_secret_/i);
  expect(new URL(target.url).hostname).toBe(`${target.projectId}.supabase.co`);
  expect(Object.isFrozen(target)).toBe(true);
};

describe("resolveSupabaseBuildFallback", () => {
  const currentPullRequestPreview = {
    ...ruleArchitectPreviewGuards,
    VERCEL_GIT_COMMIT_REF: "codex/universal-rule-engine-skills-20260722",
  } as const;

  it("selects staging for the current Rule Architect pull request preview", () => {
    expect(resolveSupabaseBuildFallback(currentPullRequestPreview)).toEqual(
      ruleArchitectStagingSupabase,
    );
    assertPublicTarget(ruleArchitectStagingSupabase);
  });

  it("selects the isolated staging branch for every non-main preview of this repository", () => {
    expect(
      resolveSupabaseBuildFallback({
        ...ruleArchitectPreviewGuards,
        VERCEL_GIT_COMMIT_REF: "fix/another-safe-preview",
      }),
    ).toEqual(ruleArchitectStagingSupabase);
  });

  it("selects production only for the exact main production deployment", () => {
    expect(resolveSupabaseBuildFallback(ruleArchitectProductionGuards)).toEqual(
      ruleArchitectProductionSupabase,
    );
    assertPublicTarget(ruleArchitectProductionSupabase);
  });

  it.each([
    ["preview", currentPullRequestPreview, ruleArchitectPreviewGuards],
    [
      "production",
      ruleArchitectProductionGuards,
      ruleArchitectProductionGuards,
    ],
  ] as const)(
    "stays disabled when any %s identity guard differs",
    (_name, environment, guards) => {
      for (const guardName of Object.keys(guards)) {
        expect(
          resolveSupabaseBuildFallback({
            ...environment,
            [guardName]: "unexpected",
          }),
        ).toBeNull();
      }
    },
  );

  it.each([
    {
      ...ruleArchitectPreviewGuards,
      VERCEL_GIT_COMMIT_REF: "main",
    },
    {
      ...ruleArchitectPreviewGuards,
      VERCEL_GIT_COMMIT_REF: "   ",
    },
    {
      ...ruleArchitectPreviewGuards,
    },
    {
      ...ruleArchitectProductionGuards,
      VERCEL_GIT_COMMIT_REF: "feat/rule-architect-v2",
    },
    {
      ...ruleArchitectProductionGuards,
      VERCEL_TARGET_ENV: "preview",
    },
  ])("rejects hybrid deployment identities", (environment) => {
    expect(resolveSupabaseBuildFallback(environment)).toBeNull();
  });

  it.each([
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PROJECT_ID",
    "VITE_SUPABASE_PROJECT_REF",
    "VITE_SUPABASE_PROJECT_NAME",
    "VITE_SUPABASE_CUSTOM_HOST",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
    "VITE_SUPABASE_FUTURE_PUBLIC_KEY",
  ])("does not complete an explicit configuration containing %s", (key) => {
    expect(
      resolveSupabaseBuildFallback({
        ...ruleArchitectProductionGuards,
        [key]: "configured",
      }),
    ).toBeNull();
  });

  it("ignores empty explicit public values", () => {
    expect(
      resolveSupabaseBuildFallback({
        ...ruleArchitectProductionGuards,
        VITE_SUPABASE_URL: "   ",
      }),
    ).toEqual(ruleArchitectProductionSupabase);
  });
});
