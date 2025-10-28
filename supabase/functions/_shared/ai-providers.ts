// supabase/functions/_shared/ai-providers.ts
// Unifier l'appel LLM avec options "forceJson"

export type AiProviderName = "openai" | "gemini" | "groq" | "lovable";

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
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  lovable: "LOVABLE_API_KEY",
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
};

type InvokeResult = { content: string };

const DEFAULT_MAX_TOKENS = 1200;

const FALLBACK_PROVIDERS: AiProviderName[] = ["openai", "gemini", "groq"];

function hasEnvVar(name: string): boolean {
  return (Deno.env.get(name) ?? "").trim().length > 0;
}

function providerFromEnv(): AiProviderName {
  const p = (Deno.env.get("AI_PROVIDER") || "").toLowerCase();
  if (p === "openai" || p === "gemini" || p === "groq") {
    return p;
  }

  const lovableKeyPresent = hasEnvVar(PROVIDER_ENV_VARS.lovable);

  if (p === "lovable" || !p) {
    if (lovableKeyPresent) {
      return "lovable";
    }
    const fallback = FALLBACK_PROVIDERS.find((provider) => hasEnvVar(PROVIDER_ENV_VARS[provider]));
    if (fallback) {
      return fallback;
    }
    throw new MissingApiKeyError("lovable", PROVIDER_ENV_VARS.lovable);
  }

  // défaut : lovable => routeur géré côté Lovable
  if (lovableKeyPresent) {
    return "lovable";
  }
  const fallback = FALLBACK_PROVIDERS.find((provider) => hasEnvVar(PROVIDER_ENV_VARS[provider]));
  if (fallback) {
    return fallback;
  }
  throw new MissingApiKeyError("lovable", PROVIDER_ENV_VARS.lovable);
}

export async function invokeChatCompletion(args: InvokeArgs): Promise<InvokeResult> {
  const provider = providerFromEnv();
  const model = args.preferredModels?.[provider];
  const forceJson = !!args.forceJson;

  const temperature = args.temperature ?? 0.6;
  const maxTokens = args.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

  // Helpers
  const join = (ms: Message[]) => ms.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

  // Per-provider calls (pseudo-implémentations — branche selon tes SDKs réels)
  if (provider === "openai") {
    // JSON mode (responses as single JSON object)
    const body = {
      model: model ?? "gpt-4o",
      messages: args.messages,
      temperature,
      max_tokens: maxTokens,
      ...(forceJson ? { response_format: { type: "json_object" as const } } : {}),
    };
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new AiProviderHTTPError("openai", res.status, t);
    }
    const json = await res.json();
    return { content: json.choices?.[0]?.message?.content ?? "" };
  }

  if (provider === "gemini") {
    // Gemini JSON: utiliser "responseMimeType"
    const body = {
      contents: [
        ...args.messages.map((m) => ({
          role: m.role,
          parts: [{ text: m.content }],
        })),
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(forceJson ? { responseMimeType: "application/json" } : {}),
      },
      // Ajoute si utile: safetySettings…
    };
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model ?? "gemini-1.5-pro")}:generateContent?key=${Deno.env.get("GEMINI_API_KEY") ?? ""}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new AiProviderHTTPError("gemini", res.status, t);
    }
    const json = await res.json();
    const text = Array.isArray(json.candidates)
      ? (json.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part?.text ?? "").join("") ?? "")
      : "";
    return { content: text };
  }

  if (provider === "groq") {
    // Groq n'a pas de JSON-mode strict → prompt-guard
    const guarded = forceJson
      ? [
          {
            role: "system",
            content: `Tu dois répondre EXCLUSIVEMENT avec un JSON valide, sans markdown, sans texte additionnel.`,
          },
          ...args.messages,
        ]
      : args.messages;

    const body = {
      model: model ?? "llama-3.1-8b-instant",
      messages: guarded,
      temperature,
      max_tokens: maxTokens,
      // stop: ["```"], // optionnel
    };

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new AiProviderHTTPError("groq", res.status, t);
    }
    const json = await res.json();
    return { content: json.choices?.[0]?.message?.content ?? "" };
  }

  // lovable (routeur)
  {
    const apiKey = (Deno.env.get("LOVABLE_API_KEY") ?? "").trim();
    if (!apiKey) {
      throw new MissingApiKeyError("lovable", PROVIDER_ENV_VARS.lovable);
    }

    const guarded = forceJson
      ? [
          {
            role: "system",
            content: `Réponds UNIQUEMENT en JSON valide. Aucune prose, aucun code fence.`,
          },
          ...args.messages,
        ]
      : args.messages;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? "google/gemini-2.5-flash",
        messages: guarded,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`[lovable] API error ${res.status}:`, t.slice(0, 500));
      throw new AiProviderHTTPError("lovable", res.status, t);
    }
    const json = await res.json();
    return { content: json.choices?.[0]?.message?.content ?? "" };
  }
}
