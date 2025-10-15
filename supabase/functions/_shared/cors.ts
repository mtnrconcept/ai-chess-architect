// Minimal, robuste, et sans dépendances externes
export const ALLOWED_ORIGINS = [
  "https://preview--ai-chess-architect.lovable.app",
  "https://ai-chess-architect.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

export function getOrigin(request: Request): string {
  return request.headers.get("origin") ?? "";
}

export function resolveAllowOrigin(request: Request): string {
  const origin = getOrigin(request);
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  // Par défaut on peut mettre '*' si tu n’envoies pas de credentials.
  // Ici on préfère être strict.
  return "https://preview--ai-chess-architect.lovable.app";
}

export function corsHeaders(request: Request): HeadersInit {
  const allowOrigin = resolveAllowOrigin(request);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function okPreflight(request: Request): Response {
  return new Response("ok", { headers: corsHeaders(request) });
}

export function withCors(request: Request, init?: ResponseInit): ResponseInit {
  return {
    ...(init ?? {}),
    headers: {
      ...(init?.headers ?? {}),
      ...corsHeaders(request),
    },
  };
}
