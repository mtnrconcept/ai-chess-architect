import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  if (!env.VITE_SUPABASE_URL) {
    throw new Error("[Vite] VITE_SUPABASE_URL est requis pour construire l'application.");
  }

  if (!env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("[Vite] VITE_SUPABASE_ANON_KEY est requis pour construire l'application.");
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
