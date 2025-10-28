// supabase/functions/generate-chess-rule/index.ts
// Mode A : cette fonction n’est plus responsable de l’inférence.
// On la garde pour compat / healthcheck éventuel, mais elle explique le changement.

Deno.serve((_req) => {
  const body = {
    ok: false,
    error: "moved_to_client_inference",
    message:
      "Le générateur de règles IA utilise désormais le modèle OSS en local depuis le navigateur (Mode A). " +
      "Ouvrez la page Variantes IA et configurez l'URL http://127.0.0.1:1234/v1/chat/completions.",
  };
  return new Response(JSON.stringify(body), {
    status: 501,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
