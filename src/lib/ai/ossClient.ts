// src/lib/ai/ossClient.ts
// Client OpenAI-compatible minimal pour serveur local (LM Studio / Ollama / llama.cpp).
// Strict JSON-only, avec parse robuste + erreurs lisibles UI.

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OssCompileResponse = {
  rule: unknown; // JSON strict renvoyé par le modèle
  rawContent: string; // Trace brute (diagnostic UI)
};

type OpenAICompatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
};

const envVars =
  (
    import.meta as unknown as {
      env?: { VITE_OSS_ENDPOINT?: string; VITE_OSS_MODEL?: string };
    }
  ).env ?? {};

const DEFAULT_ENDPOINT =
  envVars.VITE_OSS_ENDPOINT ?? "http://192.168.0.33:1234/v1/chat/completions";

const DEFAULT_MODEL = envVars.VITE_OSS_MODEL ?? "openai/gpt-oss-20b";

export type OssClientOptions = {
  endpoint?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
};

export class OssClient {
  private endpoint: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(opts?: OssClientOptions) {
    this.endpoint = (opts?.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
    this.model = opts?.model ?? DEFAULT_MODEL;
    this.temperature = opts?.temperature ?? 0.35;
    this.maxTokens = opts?.max_tokens ?? 1800;
  }

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint.replace(/\/+$/, "");
  }
  setModel(model: string) {
    this.model = model;
  }

  async chat(messages: ChatMessage[]): Promise<OssCompileResponse> {
    const body = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: false,
    };

    const res = await fetch(`${this.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`OSS_HTTP_${res.status}: ${raw.slice(0, 500)}`);
    }

    let json: OpenAICompatResponse;
    try {
      json = JSON.parse(raw) as OpenAICompatResponse;
    } catch {
      throw new Error(`OSS_INVALID_JSON: ${raw.slice(0, 500)}`);
    }

    const content = json.choices?.[0]?.message?.content ?? "";
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("OSS_EMPTY_MESSAGE");
    }

    // Extraction d’un objet JSON même si le modèle ajoute des fences ```
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    const candidate = fenced ? (fenced[1] ?? "") : trimmed;

    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error(`OSS_NO_JSON_OBJECT: ${trimmed.slice(0, 500)}`);
    }

    const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);

    try {
      const parsed = JSON.parse(jsonSlice);
      return { rule: parsed, rawContent: trimmed };
    } catch {
      throw new Error(`OSS_JSON_PARSE_ERROR: ${jsonSlice.slice(0, 500)}`);
    }
  }
}
