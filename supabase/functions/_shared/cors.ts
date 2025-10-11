export type CorsOptions = {
  methods?: string[];
  headers?: string[];
  maxAge?: number;
  credentials?: boolean;
};

const DEFAULT_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "accept",
];

const DEFAULT_METHODS = ["GET", "POST", "OPTIONS"];

const normalizeHeaderList = (headers: string[]) =>
  headers
    .map(header => header.trim())
    .filter(header => header.length > 0)
    .join(", ");

const mergeHeaders = (base: HeadersInit | undefined, cors: Record<string, string>): Headers => {
  const merged = new Headers(base);
  for (const [key, value] of Object.entries(cors)) {
    merged.set(key, value);
  }
  return merged;
};

export const createCorsHeaders = (req: Request, options: CorsOptions = {}): Record<string, string> => {
  const originHeader = req.headers.get("Origin") ?? req.headers.get("origin");
  const allowOrigin = originHeader && originHeader !== "null" ? originHeader : "*";

  const requestedHeaders = req.headers.get("Access-Control-Request-Headers")
    ?? req.headers.get("access-control-request-headers");

  const allowHeaders = requestedHeaders && requestedHeaders.trim().length > 0
    ? requestedHeaders
    : normalizeHeaderList(options.headers ?? DEFAULT_HEADERS);

  const allowMethods = normalizeHeaderList([
    ...new Set([
      ...DEFAULT_METHODS,
      ...(options.methods ?? []),
      "OPTIONS",
    ]),
  ]);

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": allowMethods,
    "Access-Control-Max-Age": String(options.maxAge ?? 86400),
    "Vary": "Origin",
  };

  const shouldAllowCredentials = (options.credentials ?? true) && allowOrigin !== "*";
  if (shouldAllowCredentials) {
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  }

  return corsHeaders;
};

export const handleOptions = (req: Request, options?: CorsOptions): Response =>
  new Response("ok", {
    status: 200,
    headers: createCorsHeaders(req, options),
  });

export const corsResponse = (
  req: Request,
  body: BodyInit,
  init: ResponseInit = {},
  options?: CorsOptions,
): Response => {
  const headers = mergeHeaders(init.headers, createCorsHeaders(req, options));
  return new Response(body, { ...init, headers });
};

export const jsonResponse = (
  req: Request,
  body: unknown,
  init: ResponseInit = {},
  options?: CorsOptions,
): Response => {
  const headers = mergeHeaders(init.headers, createCorsHeaders(req, options));
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
};
