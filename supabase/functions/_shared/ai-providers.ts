// supabase/functions/_shared/ai-providers.ts
// Unifier l'appel LLM avec options "forceJson"

export type AiProviderName = "openrouter";

export class AiProviderHTTPError extends Error {
  readonly code = "ai_provider_http_error" as const;
  constructor(
    public readonly provider: AiProviderName,
    public readonly status: number,
    public readonly responseText: string,
  ) {
    const label = responseText.trim().slice(0, 200) || "<empty>";
    super(`[${provider}] HTTP ${status}: ${label}`);
    this.name = "AiProviderHTTPError";
  }
}

const PROVIDER_ENV_VARS: Record<AiProviderName, string> = {
  openrouter: "OPENROUTER_API_KEY",
};

export class MissingApiKeyError extends Error {
  readonly code = "missing_api_key" as const;
  constructor(
    public readonly provider: AiProviderName,
    public readonly envVar: string,
  ) {
    super(`[${provider}] Missing ${envVar} in environment`);
    this.name = "MissingApiKeyError";
  }
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
type Message = ChatMessage;

type InvokeArgs = {
  messages: Message[];
  temperature?: number;
  maxOutputTokens?: number;
  preferredModels?: Partial<Record<AiProviderName, string>>;
  forceJson?: boolean; // << NEW
  overrides?: InvokeOverrides;
};

type ApiKeyOverrides = Partial<Record<AiProviderName, string>>;

export type InvokeOverrides = {
  provider?: AiProviderName;
  apiKeys?: ApiKeyOverrides;
};

type InvokeResult = {
  content: string;
  provider: AiProviderName;
  model: string | null;
};

const DEFAULT_MAX_TOKENS = 1200;

const FALLBACK_PROVIDERS: AiProviderName[] = ["openrouter"];

const OPENROUTER_SITE_URL = (Deno.env.get("OPENROUTER_SITE_URL") ?? "").trim();
const OPENROUTER_APP_NAME = (Deno.env.get("OPENROUTER_APP_NAME") ?? "").trim();
const OPENROUTER_DEFAULT_MODEL_RAW = (
  Deno.env.get("OPENROUTER_DEFAULT_MODEL") ?? ""
).trim();
const DEFAULT_OPENROUTER_MODEL =
  OPENROUTER_DEFAULT_MODEL_RAW || "openai/gpt-oss-20b";
const normaliseCompletionsUrl = (raw: string | undefined, fallback: string) => {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  const withoutTrailing = trimmed.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(withoutTrailing)) {
    return withoutTrailing;
  }
  if (/\/v1$/i.test(withoutTrailing)) {
    return `${withoutTrailing}/chat/completions`;
  }
  return `${withoutTrailing}/v1/chat/completions`;
};

const OPENROUTER_BASE_URL = normaliseCompletionsUrl(
  Deno.env.get("OPENROUTER_BASE_URL"),
  "http://127.0.0.1:1234/v1/chat/completions",
);

const resolveOverrideKey = (
  provider: AiProviderName,
  overrides?: InvokeOverrides,
): string | null => {
  const candidate = overrides?.apiKeys?.[provider];
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  const envValue = (Deno.env.get(PROVIDER_ENV_VARS[provider]) ?? "").trim();
  return envValue.length > 0 ? envValue : null;
};

const hasProviderKey = (
  provider: AiProviderName,
  overrides?: InvokeOverrides,
): boolean => resolveOverrideKey(provider, overrides) !== null;

const normaliseProvider = (value: string | undefined | null) => {
  if (!value) {
    return undefined;
  }
  const normalised = value.toLowerCase();
  if (normalised === "openrouter") {
    return normalised as AiProviderName;
  }
  return undefined;
};

function providerFromEnv(overrides?: InvokeOverrides): AiProviderName {
  const forcedProvider = overrides?.provider;
  if (forcedProvider && hasProviderKey(forcedProvider, overrides)) {
    return forcedProvider;
  }

  const p = normaliseProvider(Deno.env.get("AI_PROVIDER") ?? undefined);
  if (p && hasProviderKey(p, overrides)) {
    return p;
  }

  const fallback = FALLBACK_PROVIDERS.find((provider) =>
    hasProviderKey(provider, overrides),
  );
  if (fallback) {
    return fallback;
  }
  throw new MissingApiKeyError("openrouter", PROVIDER_ENV_VARS.openrouter);
}

export async function invokeChatCompletion(
  args: InvokeArgs,
): Promise<InvokeResult> {
  const provider = providerFromEnv(args.overrides);
  const model = args.preferredModels?.[provider];
  const forceJson = !!args.forceJson;

  const temperature = args.temperature ?? 0.6;
  const maxTokens = args.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

  // Per-provider calls (pseudo-implémentations — branche selon tes SDKs réels)
  if (provider === "openrouter") {
    const body = {
      model: model ?? DEFAULT_OPENROUTER_MODEL,
      messages: args.messages,
      temperature,
      max_tokens: maxTokens,
      ...(forceJson
        ? { response_format: { type: "json_object" as const } }
        : {}),
    } satisfies Record<string, unknown>;

    const apiKey = resolveOverrideKey("openrouter", args.overrides);
    if (!apiKey) {
      throw new MissingApiKeyError("openrouter", PROVIDER_ENV_VARS.openrouter);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (OPENROUTER_SITE_URL) {
      headers["HTTP-Referer"] = OPENROUTER_SITE_URL;
    }
    if (OPENROUTER_APP_NAME) {
      headers["X-Title"] = OPENROUTER_APP_NAME;
    }

    const res = await fetch(OPENROUTER_BASE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new AiProviderHTTPError("openrouter", res.status, t);
    }
    const json = await res.json();
    const resolvedModel =
      typeof json?.model === "string" ? json.model : body.model;
    return {
      content: json.choices?.[0]?.message?.content ?? "",
      provider,
      model: resolvedModel ?? null,
    } satisfies InvokeResult;
  }

  throw new MissingApiKeyError("openrouter", PROVIDER_ENV_VARS.openrouter);
}
