// supabase/functions/_shared/cors.ts
// CORS utilities robustes pour Edge Functions Supabase (Deno)

type CorsOptions = {
  methods?: string[]; // ex: ["GET","POST"]
  allowCredentials?: boolean;
  maxAgeSeconds?: number;
  extraAllowedHeaders?: string[]; // headers additionnels à whitelister
};

const DEFAULT_METHODS = ["GET", "POST", "OPTIONS"];
const DEFAULT_MAX_AGE = 86400;

// Liste blanche minimale pour Supabase + fetch navigateur
const BASE_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "apikey",
  "x-client-info",
  "X-Requested-With",
  "Prefer",
  "x-csrf-token",
  "Range",
  "Accept",
  "Accept-Language",
  "Accept-Encoding",
  "Origin",
];

function normalizeHeaderList(list: string[]): string {
  // Unifie + déduplique en conservant la casse canonique
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of list) {
    const key = h.trim();
    if (!key) continue;
    const lc = key.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    // Capitalisation naïve (cosmétique)
    out.push(
      key
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("-"),
    );
  }
  return out.join(", ");
}

function buildCorsHeaders(req: Request, opts?: CorsOptions): Headers {
  const origin = req.headers.get("Origin") ?? "*";
  const requestedHeaders =
    req.headers.get("Access-Control-Request-Headers") ?? "";

  const allowed = [
    ...BASE_ALLOWED_HEADERS,
    ...(opts?.extraAllowedHeaders ?? []),
    // On **reflète** proprement les headers demandés par le navigateur
    ...requestedHeaders
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  ];

  const hdrs = new Headers();
  hdrs.set("Access-Control-Allow-Origin", origin);
  hdrs.set(
    "Access-Control-Allow-Methods",
    (opts?.methods ?? DEFAULT_METHODS).join(", "),
  );
  hdrs.set("Access-Control-Allow-Headers", normalizeHeaderList(allowed));
  hdrs.set(
    "Access-Control-Allow-Credentials",
    String(opts?.allowCredentials ?? true),
  );
  hdrs.set(
    "Access-Control-Max-Age",
    String(opts?.maxAgeSeconds ?? DEFAULT_MAX_AGE),
  );
  // Pour caches/proxies : les réponses varient selon ces en-têtes
  hdrs.append("Vary", "Origin");
  hdrs.append("Vary", "Access-Control-Request-Headers");

  // Sécurité/anti-cache
  hdrs.set("Cache-Control", "no-store");

  return hdrs;
}

export function handleOptions(
  req: Request,
  opts?: CorsOptions,
): Response {
  // Toujours répondre 204 **sans corps** pour preflight
  const headers = buildCorsHeaders(req, opts);
  return new Response(null, { status: 204, headers });
}

export function corsResponse(
  req: Request,
  body: BodyInit | null,
  init?: ResponseInit,
  opts?: CorsOptions,
): Response {
  const base = init ?? {};
  const headers = buildCorsHeaders(req, opts);
  // Content-Type si on renvoie du texte
  if (typeof body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "text/plain; charset=utf-8");
  }
  return new Response(body, { ...base, headers });
}

export function jsonResponse(
  req: Request,
  data: unknown,
  init?: ResponseInit,
  opts?: CorsOptions,
): Response {
  const headers = buildCorsHeaders(req, opts);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers,
  });
}

export type { CorsOptions };
