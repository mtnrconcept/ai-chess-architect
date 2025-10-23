import {
  getSupabaseServiceRoleClient,
  resolvedServiceRoleKey,
  resolvedSupabaseUrl,
} from "../_shared/auth.ts";
import {
  handleOptions,
  jsonResponse,
  preflightIfOptions,
} from "../_shared/cors.ts";

type ApiCategory = "supabase" | "edge_function" | "coach_api" | "http";

type ApiRegistryRow = {
  id: string;
  service: string;
  category: ApiCategory;
  target: string;
  method: string | null;
  config: Record<string, unknown> | null;
  notes: string | null;
};

type IntegrationHealthResult = {
  id: string;
  service: string;
  category: ApiCategory;
  target: string;
  ok: boolean;
  error: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  details: Record<string, unknown> | null;
  notes: string | null;
  checkedAt: string;
};

type IntegrationHealthResponse = {
  checkedAt: string;
  summary: {
    total: number;
    ok: number;
    failed: number;
  };
  results: IntegrationHealthResult[];
};

type SupabaseClient = ReturnType<typeof getSupabaseServiceRoleClient>;

type SupabaseConfig = {
  table?: string;
  columns?: string;
  filters?: Record<string, unknown>;
};

type HttpConfig = {
  path?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: unknown;
  timeout_ms?: number;
  expect_status?: number;
  owner_id?: string;
  owner_header?: string;
};

type ApiRegistryConfig = SupabaseConfig &
  HttpConfig & {
    method?: string;
    description?: string;
  };

const supabase = getSupabaseServiceRoleClient();
const SUPABASE_URL = resolvedSupabaseUrl;
const SERVICE_ROLE_KEY = resolvedServiceRoleKey;

const DEFAULT_TIMEOUT_MS = 10_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const coerceRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const coerceStringRecord = (value: unknown): Record<string, string> | null => {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value)
    .map(([key, raw]) => {
      if (raw === undefined || raw === null) return null;
      return [key, String(raw)] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);
  return Object.fromEntries(entries);
};

const mergeHeaders = (
  base: Record<string, string>,
  extra: Record<string, string> | null,
): Record<string, string> => ({
  ...base,
  ...(extra ?? {}),
});

const resolvePath = (base: string, path: string | undefined): string => {
  if (!path || path.trim().length === 0) {
    return base;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const trimmedBase = base.replace(/\/$/, "");
  const prefix = path.startsWith("/") ? "" : "/";
  return `${trimmedBase}${prefix}${path}`;
};

const applyQueryParams = (
  url: string,
  query: Record<string, unknown> | null,
): string => {
  if (!query || Object.keys(query).length === 0) {
    return url;
  }
  const resolved = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    resolved.searchParams.set(key, String(value));
  }
  return resolved.toString();
};

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

const truncate = (value: string, length = 480) =>
  value.length > length ? `${value.slice(0, length)}…` : value;

async function checkSupabaseResource(
  client: SupabaseClient,
  entry: ApiRegistryRow,
  config: ApiRegistryConfig,
): Promise<Omit<IntegrationHealthResult, "checkedAt">> {
  const table =
    typeof config.table === "string" && config.table.trim().length > 0
      ? config.table
      : entry.target;
  const columns =
    typeof config.columns === "string" && config.columns.trim().length > 0
      ? config.columns
      : "*";

  if (!client) {
    return {
      id: entry.id,
      service: entry.service,
      category: entry.category,
      target: table,
      ok: false,
      error: "Supabase client unavailable for diagnostics",
      statusCode: null,
      latencyMs: null,
      details: null,
      notes: entry.notes,
    } satisfies Omit<IntegrationHealthResult, "checkedAt">;
  }

  const startedAt = performance.now();
  let query = client.from(table).select(columns).limit(1);

  const filters = coerceRecord(config.filters);
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value as never);
    }
  }

  const { data, error } = await query;
  const latencyMs = Math.round(performance.now() - startedAt);

  if (error) {
    throw new Error(error.message ?? `Échec de la requête sur ${table}`);
  }

  const rowCount = Array.isArray(data) ? data.length : data ? 1 : 0;

  return {
    id: entry.id,
    service: entry.service,
    category: entry.category,
    target: table,
    ok: true,
    error: null,
    statusCode: null,
    latencyMs,
    details: {
      rows: rowCount,
    },
    notes: entry.notes,
  };
}

async function checkHttpResource(
  baseUrl: string,
  entry: ApiRegistryRow,
  config: ApiRegistryConfig,
  baseHeaders: Record<string, string>,
): Promise<Omit<IntegrationHealthResult, "checkedAt">> {
  const path = config.path;
  const urlWithPath = resolvePath(baseUrl, path);
  const url = applyQueryParams(urlWithPath, coerceRecord(config.query));
  const method = (config.method ?? entry.method ?? "GET").toUpperCase();
  const timeoutMs =
    typeof config.timeout_ms === "number" && Number.isFinite(config.timeout_ms)
      ? Math.max(0, Math.trunc(config.timeout_ms))
      : DEFAULT_TIMEOUT_MS;
  const headers = mergeHeaders(baseHeaders, coerceStringRecord(config.headers));

  if (config.owner_id && typeof config.owner_id === "string") {
    const ownerHeader =
      typeof config.owner_header === "string" &&
      config.owner_header.trim().length > 0
        ? config.owner_header
        : "x-owner-id";
    headers[ownerHeader] = config.owner_id;
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "HEAD" && config.body !== undefined) {
    init.body = JSON.stringify(config.body);
  }

  const startedAt = performance.now();

  try {
    const response = await fetchWithTimeout(url, init, timeoutMs);
    const latencyMs = Math.round(performance.now() - startedAt);
    const expectStatus =
      typeof config.expect_status === "number" ? config.expect_status : null;
    const ok = expectStatus ? response.status === expectStatus : response.ok;
    const result: Omit<IntegrationHealthResult, "checkedAt"> = {
      id: entry.id,
      service: entry.service,
      category: entry.category,
      target: url,
      ok,
      error: null,
      statusCode: response.status,
      latencyMs,
      details: {
        statusText: response.statusText,
      },
      notes: entry.notes,
    };

    if (!ok) {
      const text = truncate(await response.text());
      result.error = text.length > 0 ? text : `HTTP ${response.status}`;
      result.details = {
        statusText: response.statusText,
        bodyPreview: text,
      };
    }

    return result;
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    return {
      id: entry.id,
      service: entry.service,
      category: entry.category,
      target: url,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      statusCode: null,
      latencyMs,
      details: null,
      notes: entry.notes,
    };
  }
}

async function checkEdgeFunction(
  entry: ApiRegistryRow,
  config: ApiRegistryConfig,
): Promise<Omit<IntegrationHealthResult, "checkedAt">> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase Edge configuration missing");
  }

  const path = config.path ?? entry.target;
  const normalizedPath = path.replace(/^\/+/, "");
  const baseUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${normalizedPath}`;

  const headers = mergeHeaders(
    {
      "content-type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    coerceStringRecord(config.headers),
  );

  const method = (config.method ?? entry.method ?? "POST").toUpperCase();
  const body =
    method !== "GET" && method !== "HEAD"
      ? (config.body ?? { ping: true })
      : config.body;

  return checkHttpResource(
    baseUrl,
    entry,
    {
      ...config,
      path: "",
      method,
      body,
    },
    headers,
  );
}

async function probeEntry(
  entry: ApiRegistryRow,
): Promise<IntegrationHealthResult> {
  const config = (
    entry.config && isRecord(entry.config) ? entry.config : {}
  ) as ApiRegistryConfig;
  const checkedAt = new Date().toISOString();

  try {
    let result: Omit<IntegrationHealthResult, "checkedAt">;
    switch (entry.category) {
      case "supabase":
        result = await checkSupabaseResource(supabase, entry, config);
        break;
      case "edge_function":
        result = await checkEdgeFunction(entry, config);
        break;
      case "coach_api":
        result = await checkHttpResource(
          entry.target,
          entry,
          { ...config, path: config.path ?? "/health" },
          {
            "content-type": "application/json",
          },
        );
        break;
      case "http":
      default:
        result = await checkHttpResource(entry.target, entry, config, {
          "content-type": "application/json",
        });
        break;
    }

    return { ...result, checkedAt };
  } catch (error) {
    return {
      id: entry.id,
      service: entry.service,
      category: entry.category,
      target: entry.target,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      statusCode: null,
      latencyMs: null,
      details: null,
      notes: entry.notes,
      checkedAt,
    } satisfies IntegrationHealthResult;
  }
}

Deno.serve(async (req: Request) => {
  const preflight = preflightIfOptions(req);
  if (preflight) return preflight;

  const missingConfig: string[] = [];
  if (!SERVICE_ROLE_KEY) missingConfig.push("SERVICE_ROLE_KEY");
  if (!SUPABASE_URL) missingConfig.push("SUPABASE_URL");
  if (!supabase) missingConfig.push("service_role_client");

  if (missingConfig.length > 0) {
    return jsonResponse(
      req,
      {
        error:
          "Supabase service role configuration missing for integration diagnostics",
        missing: missingConfig,
      },
      { status: 503 },
    );
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(
      req,
      { error: "Method not allowed" },
      { status: 405, headers: { allow: "GET, POST" } },
    );
  }
  if (!supabase) {
    return jsonResponse(req, { error: "backend_unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("api_registry")
    .select("id, service, category, target, method, config, notes")
    .eq("active", true)
    .order("service", { ascending: true });

  if (error) {
    return jsonResponse(
      req,
      { error: error.message ?? "Unable to load API registry" },
      { status: 500 },
    );
  }

  const results = await Promise.all(data.map(probeEntry));
  const okCount = results.filter((result) => result.ok).length;
  const response: IntegrationHealthResponse = {
    checkedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      ok: okCount,
      failed: results.length - okCount,
    },
    results,
  };

  return jsonResponse(req, response);
});
