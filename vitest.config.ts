import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      packages: path.resolve(__dirname, "./packages"),
      apps: path.resolve(__dirname, "./apps"),
    },
  },
  test: {
    environment: "node",
    setupFiles: [path.resolve(__dirname, "./configs/quality/vitest.setup.ts")],
    exclude: [
      ...configDefaults.exclude,
      "supabase/functions/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
  },
});
