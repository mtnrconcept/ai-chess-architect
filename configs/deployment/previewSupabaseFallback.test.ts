import { describe, expect, it } from "vitest";
import {
  resolvePreviewSupabaseFallback,
  ruleArchitectPreviewGuards,
  ruleArchitectStagingSupabase,
} from "./previewSupabaseFallback";

const exactPreviewEnvironment = {
  ...ruleArchitectPreviewGuards,
};

describe("resolvePreviewSupabaseFallback", () => {
  it("selects the staging project for the exact PR #306 Preview", () => {
    expect(resolvePreviewSupabaseFallback(exactPreviewEnvironment)).toEqual(
      ruleArchitectStagingSupabase,
    );
    expect(ruleArchitectStagingSupabase.publishableKey).toMatch(
      /^sb_publishable_/,
    );
  });

  it.each(Object.keys(ruleArchitectPreviewGuards))(
    "stays disabled when %s does not match",
    (guardName) => {
      expect(
        resolvePreviewSupabaseFallback({
          ...exactPreviewEnvironment,
          [guardName]: "unexpected",
        }),
      ).toBeNull();
    },
  );

  it.each([
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PROJECT_ID",
    "VITE_SUPABASE_PROJECT_REF",
    "VITE_SUPABASE_CUSTOM_HOST",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  ])(
    "does not complete a partial explicit configuration containing %s",
    (key) => {
      expect(
        resolvePreviewSupabaseFallback({
          ...exactPreviewEnvironment,
          [key]: "configured",
        }),
      ).toBeNull();
    },
  );

  it("ignores empty public values", () => {
    expect(
      resolvePreviewSupabaseFallback({
        ...exactPreviewEnvironment,
        VITE_SUPABASE_URL: "   ",
      }),
    ).toEqual(ruleArchitectStagingSupabase);
  });
});
