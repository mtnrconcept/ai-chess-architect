import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { resolvePreviewSupabaseFallback } from "./configs/deployment/previewSupabaseFallback";
import { defaultPermissionsPolicyHeader } from "./configs/security/permissionsPolicy";

const sharedSecurityHeaders = Object.freeze({
  "Permissions-Policy": defaultPermissionsPolicyHeader,
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const publicEnvironment = loadEnv(mode, process.cwd(), "VITE_");
  const previewSupabaseFallback = resolvePreviewSupabaseFallback({
    ...publicEnvironment,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
    VERCEL_GIT_REPO_OWNER: process.env.VERCEL_GIT_REPO_OWNER,
    VERCEL_GIT_REPO_SLUG: process.env.VERCEL_GIT_REPO_SLUG,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  });

  return {
    define: {
      __SUPABASE_PREVIEW_FALLBACK__: JSON.stringify(previewSupabaseFallback),
    },
    server: {
      host: "::",
      port: 8080,
      headers: sharedSecurityHeaders,
    },
    preview: {
      headers: sharedSecurityHeaders,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(
      Boolean,
    ),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        packages: path.resolve(__dirname, "./packages"),
        apps: path.resolve(__dirname, "./apps"),
      },
    },
  };
});
