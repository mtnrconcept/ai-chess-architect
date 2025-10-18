// /supabase/functions/_shared/cors.ts

const ALLOW_ORIGIN = Deno.env.get("CORS_ORIGIN") ?? "*";

const baseHeaders = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(baseHeaders)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export function preflightIfOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }
  return null;
}

// Additional helper exports for backward compatibility
export function handleOptions(req: Request): Response | null {
  return preflightIfOptions(req);
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseHeaders, "Content-Type": "application/json" },
  });
}

export function corsResponse(body: BodyInit | null, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(baseHeaders)) headers.set(k, v);
  return new Response(body, { ...init, headers });
}

export function okPreflight(): Response {
  return new Response(null, { status: 204, headers: baseHeaders });
}
