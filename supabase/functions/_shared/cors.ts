// Minimal, robuste, et sans dépendances externes
export const ALLOWED_ORIGINS = [
  "https://preview--ai-chess-architect.lovable.app",
  "https://ai-chess-architect.lovable.app",
  "https://id-preview--1e794698-feca-4fca-ab3b-11990c0b270d.lovable.app",
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


export type PreflightOptions = {
  methods?: readonly string[];
  headers?: readonly string[];
  status?: number;
};

const ensureHeaderList = (values: readonly string[] | undefined, fallback: string) => {
  if (!values || values.length === 0) return fallback;
  const cleaned = Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
  return cleaned.length > 0 ? cleaned.join(',') : fallback;
};

export function handleOptions(request: Request, options?: PreflightOptions): Response {
  const headers = { ...corsHeaders(request) } as Record<string, string>;
  headers['Access-Control-Allow-Methods'] = ensureHeaderList(
    options?.methods,
    headers['Access-Control-Allow-Methods'] ?? 'GET,POST,OPTIONS',
  );
  if (options?.headers) {
    headers['Access-Control-Allow-Headers'] = ensureHeaderList(
      options.headers,
      headers['Access-Control-Allow-Headers'] ?? 'authorization, x-client-info, apikey, content-type',
    );
  }
  const status = typeof options?.status === 'number' ? options.status : 204;
  return new Response(null, { status, headers });
}

export function corsResponse(
  request: Request,
  body: BodyInit | null = null,
  init?: ResponseInit,
): Response {
  const responseInit = withCors(request, init);
  return new Response(body, responseInit);
}

export function jsonResponse(
  request: Request,
  body: unknown,
  init?: ResponseInit,
): Response {
  const responseInit = withCors(request, init);
  const headers = new Headers(responseInit.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Response(payload, { ...responseInit, headers });
}
