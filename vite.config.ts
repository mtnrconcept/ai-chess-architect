import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  if (!env.VITE_SUPABASE_URL) {
    console.warn(
      "[Vite] VITE_SUPABASE_URL manquant. Utilisation d'une valeur fictive pour permettre la génération du bundle."
    );
    process.env.VITE_SUPABASE_URL = "https://example.com";
  }

  if (!env.VITE_SUPABASE_ANON_KEY) {
    console.warn(
      "[Vite] VITE_SUPABASE_ANON_KEY manquant. Utilisation d'une clé anonyme fictive pour permettre la génération du bundle."
    );
    process.env.VITE_SUPABASE_ANON_KEY = "supabase-anon-key-placeholder";
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
