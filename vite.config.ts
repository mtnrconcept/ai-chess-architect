import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { defaultPermissionsPolicyHeader } from "./configs/security/permissionsPolicy";

const sharedSecurityHeaders = Object.freeze({
  "Permissions-Policy": defaultPermissionsPolicyHeader,
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
}));
