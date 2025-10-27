// /supabase/functions/_shared/cors.ts

type CorsOverrides = {
  methods?: string[];
  headers?: string[];
  origin?: string;
  allowCredentials?: boolean;
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://1e794698-feca-4fca-ab3b-11990c0b270d.lovableproject.com",
  "http://localhost:5173",
];

const envOrigins = Deno.env
  .get("CORS_ORIGIN")
  ?.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const normalisedEnvOrigins = envOrigins?.length ? envOrigins : undefined;

export const ALLOWED_ORIGINS = normalisedEnvOrigins ?? DEFAULT_ALLOWED_ORIGINS;

const DEFAULT_ALLOW_METHODS = ["GET", "POST", "OPTIONS"] as const;
const DEFAULT_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "apikey",
  "Prefer",
  "X-Client-Info",
  "x-client-info",
] as const;

const DEFAULT_ALLOW_CREDENTIALS = true;

const resolveAllowedOrigin = (
  requestOrigin?: string | null,
  override?: string,
) => {
  if (override) return override;
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  return ALLOWED_ORIGINS[0] ?? "*";
};

const buildCorsHeaders = (overrides?: CorsOverrides, request?: Request) => {
  const requestedHeaders = request?.headers
    .get("access-control-request-headers")
    ?.split(",")
    .map((header) => header.trim())
    .filter((header) => header.length > 0);
  const requestOrigin = request?.headers.get("origin");

const allowHeaders = Array.from(
    new Set(overrides?.headers ?? DEFAULT_ALLOW_HEADERS),
  )
    .map((header) => header.trim())
    .filter((header) => header.length > 0)
    .join(",");

  const allowOrigin = resolveAllowedOrigin(requestOrigin, overrides?.origin);

  const headers = new Headers({
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": (
      overrides?.methods ?? DEFAULT_ALLOW_METHODS
    ).join(","),
    "Access-Control-Allow-Headers": allowHeaders,
  });

  if (allowOrigin !== "*") {
    headers.set("Vary", "Origin");
  }

  if (overrides?.allowCredentials ?? DEFAULT_ALLOW_CREDENTIALS) {
    if (allowOrigin !== "*") {
      headers.set("Access-Control-Allow-Credentials", "true");
    }
  }

  return headers;
};

const baseHeaders = buildCorsHeaders();

const isRequest = (value: unknown): value is Request =>
  typeof value === "object" && value !== null && "method" in value;

const asResponseInit = (value: unknown): ResponseInit =>
  typeof value === "object" && value !== null ? (value as ResponseInit) : {};

const asCorsOverrides = (value: unknown): CorsOverrides | undefined =>
  typeof value === "object" && value !== null
    ? (value as CorsOverrides)
    : undefined;

export function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of baseHeaders.entries()) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export function preflightIfOptions(
  req: Request,
  overrides?: CorsOverrides,
): Response | null {
  if (req.method === "OPTIONS") {
    const headers = buildCorsHeaders(overrides, req);
    return new Response(null, { status: 204, headers });
  }
  return null;
}

// Helper qui combine JSON + CORS automatiquement
// Supporte deux signatures pour rétrocompatibilité :
// - Nouvelle : jsonResponse(data, status)
// - Ancienne : jsonResponse(req, data, options, ...)
export function jsonResponse(...args: unknown[]): Response {
  if (!isRequest(args[0])) {
    const data = args[0];
    let status = 200;
    let req: Request | undefined;

    for (let i = 1; i < args.length; i++) {
      const candidate = args[i];
      if (typeof candidate === "number") {
        status = candidate;
      } else if (isRequest(candidate)) {
        req = candidate;
      }
    }

    const headers = buildCorsHeaders(undefined, req);
    headers.set("Content-Type", "application/json");

    return new Response(JSON.stringify(data), { status, headers });
  }

  const req = args[0] as Request;
  const data = args[1];
  const options = asResponseInit(args[2]);
  const overrides = asCorsOverrides(args[3]);
  const status = options.status ?? 200;
  const corsHeaders = buildCorsHeaders(overrides, req);
  const headers = new Headers(options.headers);

  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(data), { ...options, status, headers });
}

// Backward compatibility aliases
export function handleOptions(...args: unknown[]): Response | null {
  // Accepte handleOptions(req) ou handleOptions(req, corsOptions)
  const req = args[0];
  if (!isRequest(req)) return null;
  const overrides = asCorsOverrides(args[1]);
  return preflightIfOptions(req, overrides);
}

export function corsResponse(...args: unknown[]): Response {
  if (!isRequest(args[0])) {
    const body = args[0];
    const init = asResponseInit(args[1]);
    let req: Request | undefined;

    for (let i = 2; i < args.length; i++) {
      const candidate = args[i];
      if (isRequest(candidate)) {
        req = candidate;
        break;
      }
    }

    const headers = new Headers(init.headers);
    const corsHeaders = buildCorsHeaders(undefined, req);
    for (const [key, value] of corsHeaders.entries()) {
      headers.set(key, value);
    }

    return new Response(body, { ...init, headers });
  }

  const req = args[0] as Request;
  const body = args[1];
  const init = asResponseInit(args[2]);
  const overrides = asCorsOverrides(args[3]);
  const headers = new Headers(init?.headers);
  const corsHeaders = buildCorsHeaders(overrides, req);
  for (const [key, value] of corsHeaders.entries()) headers.set(key, value);
  return new Response(body, { ...init, headers });
}

export function okPreflight(
  overrides?: CorsOverrides,
  req?: Request,
): Response {
  const headers =
    overrides || req
      ? buildCorsHeaders(overrides, req)
      : new Headers(baseHeaders);
  return new Response(null, { status: 204, headers });
}
