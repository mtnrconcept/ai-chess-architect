import {
  assertManagedAssetReferences,
  prepareRuleArchitectInput,
  type PreparedRuleArchitectInput,
  type RuleArchitectPromptSource,
} from "./rule-architect-input.ts";

interface OpenAIUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface OpenAIResponsePayload {
  id?: string;
  status?: "completed" | "incomplete" | "failed";
  output_text?: string;
  incomplete_details?: {
    reason?: string;
  };
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  usage?: OpenAIUsage;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export interface StructuredResponseResult {
  value: unknown;
  requestId: string | null;
  responseId: string | null;
  usage: OpenAIUsage | null;
}

export function resolveStructuredResponseTimeout(timeoutMs?: number): number {
  const requested =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs)
      ? Math.trunc(timeoutMs)
      : 55_000;
  return Math.min(90_000, Math.max(10_000, requested));
}

const extractOutputText = (payload: OpenAIResponsePayload): string | null => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (
        content.type === "output_text" &&
        typeof content.text === "string" &&
        content.text.trim()
      ) {
        return content.text;
      }
    }
  }

  return null;
};

const extractRefusal = (payload: OpenAIResponsePayload): string | null => {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (
        content.type === "refusal" &&
        typeof content.refusal === "string" &&
        content.refusal.trim()
      ) {
        return content.refusal;
      }
    }
  }
  return null;
};

/**
 * Keep the schema in the conservative subset accepted by Structured Outputs.
 * Length constraints are still enforced by the deterministic server validator.
 */
function toStructuredOutputsSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStructuredOutputsSchema);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(source)) {
    if (key === "minLength" || key === "maxLength") {
      continue;
    }

    if (key === "const") {
      if (!("enum" in source)) {
        result.enum = [item];
      }
      continue;
    }

    result[key] = toStructuredOutputsSchema(item);
  }

  return result;
}

const parsePayload = async (
  response: Response,
): Promise<OpenAIResponsePayload> => {
  const raw = await response.text();
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as OpenAIResponsePayload;
  } catch {
    return {
      error: {
        message: "OpenAI a retourné une réponse non JSON.",
      },
    };
  }
};

export async function createStructuredResponse(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  reasoningEffort: "low" | "medium" | "high";
  ruleArchitectPromptSource?: RuleArchitectPromptSource;
  timeoutMs?: number;
}): Promise<StructuredResponseResult> {
  const timeoutMs = resolveStructuredResponseTimeout(input.timeoutMs);
  const preparedInput:
    | PreparedRuleArchitectInput
    | {
        systemPrompt: string;
        userPrompt: string;
      } =
    input.schemaName === "rule_blueprint_v2"
      ? await prepareRuleArchitectInput(
          input.systemPrompt,
          input.userPrompt,
          input.ruleArchitectPromptSource,
        )
      : {
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
        };

  const body = {
    model: input.model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: preparedInput.systemPrompt,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: preparedInput.userPrompt,
          },
        ],
      },
    ],
    reasoning: {
      effort: input.reasoningEffort,
    },
    text: {
      format: {
        type: "json_schema",
        name: input.schemaName,
        strict: true,
        schema: toStructuredOutputsSchema(input.schema),
      },
    },
    max_output_tokens: 12000,
    store: false,
  };

  let lastError = "Erreur OpenAI inconnue.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const requestId = response.headers.get("x-request-id");
    const payload = await parsePayload(response);

    if (response.ok) {
      const refusal = extractRefusal(payload);
      if (refusal) {
        throw new Error(
          `La demande de règle a été refusée par le modèle : ${refusal}`,
        );
      }

      if (payload.status === "incomplete") {
        throw new Error(
          `La génération est incomplète${
            payload.incomplete_details?.reason
              ? ` (${payload.incomplete_details.reason})`
              : ""
          }.`,
        );
      }

      if (payload.status === "failed") {
        throw new Error(
          payload.error?.message ?? "La génération structurée a échoué.",
        );
      }

      const outputText = extractOutputText(payload);
      if (!outputText) {
        throw new Error("La réponse structurée ne contient aucun objet.");
      }

      let value: unknown;
      try {
        value = JSON.parse(outputText);
      } catch {
        throw new Error("La réponse structurée n'est pas un JSON valide.");
      }

      if (input.schemaName === "rule_blueprint_v2") {
        const managedAsset =
          "managedAsset" in preparedInput ? preparedInput.managedAsset : null;
        assertManagedAssetReferences(value, managedAsset);
      }

      return {
        value,
        requestId,
        responseId: payload.id ?? null,
        usage: payload.usage ?? null,
      };
    }

    lastError =
      payload.error?.message ??
      `OpenAI a répondu avec le statut ${response.status}.`;

    throw new Error(lastError);
  } catch (error) {
    const aborted =
      error instanceof DOMException && error.name === "AbortError";

    lastError = aborted
      ? `OpenAI n'a pas répondu dans les ${Math.round(
          timeoutMs / 1000,
        )} secondes.`
      : error instanceof Error
        ? error.message
        : "Erreur réseau OpenAI.";

    throw new Error(lastError);
  } finally {
    clearTimeout(timeout);
  }
}
