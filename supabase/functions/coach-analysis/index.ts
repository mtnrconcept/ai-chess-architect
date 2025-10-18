// Fonction temporairement désactivée - nécessite refactoring des dépendances pg et stockfish
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  return new Response(
    JSON.stringify({
      error: "CoachAnalysisTemporarilyDisabled",
      message: "Cette fonction nécessite une mise à jour des dépendances"
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
});
