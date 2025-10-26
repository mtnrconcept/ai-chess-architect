// /supabase/functions/_shared/cors.ts

const ALLOW_ORIGIN = Deno.env.get("CORS_ORIGIN") ?? "*";

type CorsOverrides = {
  methods?: string[];
  headers?: string[];
  origin?: string;
  allowCredentials?: boolean;
};

const BASE_ALLOW_METHODS = ["GET", "POST", "OPTIONS"];
const BASE_ALLOW_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
];

const buildCorsHeaders = (overrides?: CorsOverrides, request?: Request) => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": overrides?.origin ?? ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": (
      overrides?.methods ?? BASE_ALLOW_METHODS
    ).join(","),
    "Access-Control-Allow-Headers": (
      overrides?.headers ?? BASE_ALLOW_HEADERS
    ).join(","),
  });

  const requestedHeaders = request?.headers.get(
    "access-control-request-headers",
  );

  if (requestedHeaders) {
    headers.set("Access-Control-Allow-Headers", requestedHeaders);
  }

  if (overrides?.allowCredentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
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
  // Nouvelle signature : jsonResponse(data, status?)
  if (args.length <= 2 && !isRequest(args[0])) {
    const data = args[0];
    const status = typeof args[1] === "number" ? args[1] : 200;
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        ...Object.fromEntries(baseHeaders.entries()),
        "Content-Type": "application/json",
      },
    });
  }

  // Ancienne signature : jsonResponse(req, data, options?, corsOptions?)
  // On ignore req et corsOptions, on extrait data et options
  const data = args[1];
  const options = asResponseInit(args[2]);
  const overrides = asCorsOverrides(args[3]);
  const status = options.status ?? 200;
  const corsHeaders = buildCorsHeaders(overrides);

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...Object.fromEntries(corsHeaders.entries()),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
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
  // Nouvelle signature : corsResponse(body, init?)
  if (args.length <= 2 && !isRequest(args[0])) {
    const body = args[0];
    const init = asResponseInit(args[1]);
    const headers = new Headers(init.headers);
    for (const [k, v] of baseHeaders.entries()) headers.set(k, v);
    return new Response(body, { ...init, headers });
  }

  // Ancienne signature : corsResponse(req, body, init?, corsOptions?)
  const body = args[1];
  const init = asResponseInit(args[2]);
  const overrides = asCorsOverrides(args[3]);
  const headers = new Headers(init?.headers);
  const corsHeaders = buildCorsHeaders(overrides);
  for (const [k, v] of corsHeaders.entries()) headers.set(k, v);
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
