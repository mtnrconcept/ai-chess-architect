/// <reference types="vite/client" />

declare const __SUPABASE_BUILD_FALLBACK__: Readonly<{
  url: string;
  projectId: string;
  publishableKey: string;
  configurationSource: "vercel-preview-fallback" | "vercel-production-fallback";
}> | null;
