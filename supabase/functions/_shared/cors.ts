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

// Helper qui combine JSON + CORS automatiquement
// Supporte deux signatures pour rétrocompatibilité :
// - Nouvelle : jsonResponse(data, status)
// - Ancienne : jsonResponse(req, data, options, ...)
export function jsonResponse(...args: any[]): Response {
  // Nouvelle signature : jsonResponse(data, status?)
  if (args.length <= 2 && (typeof args[0] !== 'object' || !('method' in args[0]))) {
    const [data, status = 200] = args;
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...baseHeaders, "Content-Type": "application/json" },
    });
  }
  
  // Ancienne signature : jsonResponse(req, data, options?, corsOptions?)
  // On ignore req et corsOptions, on extrait data et options
  const data = args[1];
  const options = args[2] || {};
  const status = options.status || 200;
  
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseHeaders, "Content-Type": "application/json", ...options.headers },
  });
}

// Backward compatibility aliases
export function handleOptions(...args: any[]): Response | null {
  // Accepte handleOptions(req) ou handleOptions(req, corsOptions)
  const req = args[0];
  return preflightIfOptions(req);
}

export function corsResponse(...args: any[]): Response {
  // Nouvelle signature : corsResponse(body, init?)
  if (args.length <= 2 && (typeof args[0] !== 'object' || !('method' in args[0]))) {
    const [body, init] = args;
    const headers = new Headers(init?.headers);
    for (const [k, v] of Object.entries(baseHeaders)) headers.set(k, v);
    return new Response(body, { ...init, headers });
  }
  
  // Ancienne signature : corsResponse(req, body, init?, corsOptions?)
  const body = args[1];
  const init = args[2] || {};
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(baseHeaders)) headers.set(k, v);
  return new Response(body, { ...init, headers });
}

export function okPreflight(): Response {
  return new Response(null, { status: 204, headers: baseHeaders });
}
