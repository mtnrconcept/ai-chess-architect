const normalizeOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.origin !== value
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);

  return new Set(configured);
}

const baseHeaders = (): Headers =>
  new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });

const forbiddenCorsHeaders = (): Headers => baseHeaders();

function appendCorsHeaders(headers: Headers, origin: string): Headers {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type",
  );
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function corsHeaders(request: Request): Headers | null {
  const origin = request.headers.get("origin");
  const headers = baseHeaders();

  if (!origin) {
    return headers;
  }

  return allowedOrigins().has(origin)
    ? appendCorsHeaders(headers, origin)
    : null;
}

export function handlePreflight(request: Request): Response | null {
  const headers = corsHeaders(request);

  if (!headers) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Origin non autorisée.",
      }),
      {
        status: 403,
        headers: forbiddenCorsHeaders(),
      },
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers,
    });
  }

  return null;
}

export function jsonResponse(
  request: Request,
  status: number,
  payload: unknown,
): Response {
  const headers = corsHeaders(request) ?? forbiddenCorsHeaders();

  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}
