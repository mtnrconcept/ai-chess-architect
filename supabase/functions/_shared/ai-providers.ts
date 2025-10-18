// supabase/functions/_shared/ai-providers.ts
// Unifier l'appel LLM avec options "forceJson"

export type AiProviderName = "openai" | "gemini" | "groq" | "lovable";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
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

function providerFromEnv(): AiProviderName {
  const p = (Deno.env.get("AI_PROVIDER") || "").toLowerCase();
  if (p === "openai" || p === "gemini" || p === "groq" || p === "lovable") return p as AiProviderName;
  // défaut : lovable => routeur géré côté Lovable
  return "lovable";
}

export async function invokeChatCompletion(args: InvokeArgs): Promise<InvokeResult> {
  const provider = providerFromEnv();
  const model = args.preferredModels?.[provider];
  const forceJson = !!args.forceJson;

  const temperature = args.temperature ?? 0.6;
  const maxTokens   = args.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

  // Helpers
  const join = (ms: Message[]) =>
    ms.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

  // Per-provider calls (pseudo-implémentations — branche selon tes SDKs réels)
  if (provider === "openai") {
    // JSON mode (responses as single JSON object)
    const body: any = {
      model: model ?? "gpt-4o",
      messages: args.messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (forceJson) {
      body.response_format = { type: "json_object" }; // << JSON MODE
    }
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
      throw new Error(`[openai] ${res.status} ${t}`);
    }
    const json = await res.json();
    return { content: json.choices?.[0]?.message?.content ?? "" };
  }

  if (provider === "gemini") {
    // Gemini JSON: utiliser "responseMimeType"
    const body = {
      contents: [
        ...args.messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
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
      throw new Error(`[gemini] ${res.status} ${t}`);
    }
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return { content: text };
  }

  if (provider === "groq") {
    // Groq n'a pas de JSON-mode strict → prompt-guard
    const guarded = forceJson
      ? [
          { role: "system", content: `Tu dois répondre EXCLUSIVEMENT avec un JSON valide, sans markdown, sans texte additionnel.` },
          ...args.messages,
        ]
      : args.messages;

    const body: any = {
      model: model ?? "llama-3.1-70b-versatile",
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
      throw new Error(`[groq] ${res.status} ${t}`);
    }
    const json = await res.json();
    return { content: json.choices?.[0]?.message?.content ?? "" };
  }

  // lovable (routeur)
  {
    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    if (!apiKey) {
      throw new Error("[lovable] Missing LOVABLE_API_KEY in environment");
    }

    const guarded = forceJson
      ? [
          { role: "system", content: `Réponds UNIQUEMENT en JSON valide. Aucune prose, aucun code fence.` },
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
      throw new Error(`[lovable] ${res.status} ${t}`);
    }
    const json = await res.json();
    return { content: json.choices?.[0]?.message?.content ?? "" };
  }
}
