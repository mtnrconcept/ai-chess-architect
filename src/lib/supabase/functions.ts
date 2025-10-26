// /src/lib/supabase/functions.ts
import { supabase } from "@/integrations/supabase/client";

export type GeneratedRule = Record<string, unknown>;

type SupabaseNeedInfoResult = {
  status: "need_info";
  questions: string[];
  prompt: string;
  promptHash?: string;
  correlationId?: string;
  rawModelResponse?: Record<string, unknown>;
  provider?: string;
};

type SupabaseReadyResult = {
  status: "ready";
  rule: GeneratedRule;
  validation?: Record<string, unknown>;
  dryRun?: Record<string, unknown> | null;
  prompt: string;
  promptHash?: string;
  correlationId?: string;
  rawModelResponse?: Record<string, unknown>;
  provider?: string;
};

type SupabaseRuleGeneratorResponse =
  | { ok: true; result: SupabaseNeedInfoResult | SupabaseReadyResult }
  | { ok: false; error: string; details?: unknown };

export type GenerateRuleRequest = {
  prompt: string;
  board?: { tiles: string[]; pieces: unknown; occupancy: unknown };
  options?: { locale?: string; dryRun?: boolean; [key: string]: unknown };
};

export type RuleGeneratorChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RuleGeneratorChatRequest = {
  prompt?: string;
  conversation: RuleGeneratorChatMessage[];
  board?: GenerateRuleRequest["board"];
  options?: GenerateRuleRequest["options"];
};

export type RuleGeneratorNeedInfo = SupabaseNeedInfoResult;
export type RuleGeneratorReady = SupabaseReadyResult;
export type RuleGeneratorChatResult =
  | RuleGeneratorNeedInfo
  | RuleGeneratorReady;

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const toErrorMessage = (value: unknown): string => {
  if (value instanceof Error && typeof value.message === "string") {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "Unknown error";
  }
};

const getStatusFromError = (value: unknown): number | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const directStatus = (value as Record<string, unknown>).status;
  if (typeof directStatus === "number") {
    return directStatus;
  }

  const context = (value as Record<string, unknown>).context;
  if (context && typeof context === "object") {
    const response = (context as Record<string, unknown>).response;
    if (response && typeof response === "object") {
      const status = (response as Record<string, unknown>).status;
      if (typeof status === "number") {
        return status;
      }
    }
  }

  return undefined;
};

const shouldRetryFromStatus = (status: number | undefined): boolean =>
  status === 502 || status === 429 || status === 503;

const shouldRetryFromMessage = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("aborterror") ||
    normalized.includes("timeout") ||
    normalized.includes("502")
  );
};

type SupabaseFunctionError = {
  status?: number;
  message?: string;
  context?: {
    response?: Response & {
      clone?: () => Response;
    };
  };
};

const readSupabaseErrorResponse = async (error: unknown): Promise<unknown> => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const response = (error as SupabaseFunctionError).context?.response;
  if (!response) {
    return undefined;
  }

  const clone =
    typeof response.clone === "function" ? response.clone() : response;

  try {
    return await clone.json();
  } catch {
    try {
      return await clone.text();
    } catch {
      return undefined;
    }
  }
};

const stringifyDetails = (details: unknown): string | undefined => {
  if (details == null) {
    return undefined;
  }

  if (typeof details === "string") {
    return details;
  }

  if (Array.isArray(details)) {
    return details
      .map((entry) => stringifyDetails(entry) ?? JSON.stringify(entry))
      .filter((part) => typeof part === "string" && part.length > 0)
      .join(" | ");
  }

  if (typeof details === "object") {
    if ("message" in details && typeof details.message === "string") {
      return details.message;
    }

    try {
      return JSON.stringify(details);
    } catch {
      return String(details);
    }
  }

  return String(details);
};

const formatSupabaseEdgeFunctionError = (
  payload: unknown,
): string | undefined => {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const parts: string[] = [];

  const error = typeof record.error === "string" ? record.error : undefined;
  const reason = typeof record.reason === "string" ? record.reason : undefined;
  const message =
    typeof record.message === "string" ? record.message : undefined;
  const details = stringifyDetails(record.details);

  if (error) {
    parts.push(error);
  }
  if (reason && reason !== error) {
    parts.push(reason);
  }
  if (message && message !== error && message !== reason) {
    parts.push(message);
  }
  if (details) {
    parts.push(details);
  }

  if (parts.length > 0) {
    return parts.join(" - ");
  }

  try {
    return JSON.stringify(record);
  } catch {
    return undefined;
  }
};

function sanitizeConversation(
  conversation: RuleGeneratorChatMessage[],
): RuleGeneratorChatMessage[] {
  return conversation
    .map((message) => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const role = message.role;
      const content =
        typeof message.content === "string" ? message.content.trim() : "";

      if ((role !== "user" && role !== "assistant") || !content) {
        return null;
      }

      return { role, content } as RuleGeneratorChatMessage;
    })
    .filter((entry): entry is RuleGeneratorChatMessage => entry !== null);
}

async function invokeSupabaseRuleGenerator(
  payload: Record<string, unknown>,
  attempt: number,
  maxRetry: number,
  baseDelay: number,
): Promise<SupabaseRuleGeneratorResponse> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 55000);

  try {
    const { data, error } =
      await supabase.functions.invoke<SupabaseRuleGeneratorResponse>(
        "generate-chess-rule",
        {
          body: payload,
          signal: controller.signal,
        },
      );
    clearTimeout(to);

    if (error) {
      const status = getStatusFromError(error);
      const responsePayload = await readSupabaseErrorResponse(error);

      const message =
        formatSupabaseEdgeFunctionError(responsePayload) ??
        toErrorMessage(error);

      if (
        attempt < maxRetry &&
        (shouldRetryFromStatus(status) || shouldRetryFromMessage(message))
      ) {
        await delay(baseDelay * (attempt + 1));
        return invokeSupabaseRuleGenerator(
          payload,
          attempt + 1,
          maxRetry,
          baseDelay,
        );
      }

      throw new Error(message);
    }

    return data ?? { ok: false, error: "empty_response" };
  } catch (err) {
    clearTimeout(to);
    const message = toErrorMessage(err);

    if (attempt < maxRetry && shouldRetryFromMessage(message)) {
      await delay(baseDelay * (attempt + 1));
      return invokeSupabaseRuleGenerator(
        payload,
        attempt + 1,
        maxRetry,
        baseDelay,
      );
    }

    throw new Error(message);
  }
}

function ensureResultRecord(
  data: SupabaseRuleGeneratorResponse,
): SupabaseNeedInfoResult | SupabaseReadyResult {
  if (!data || typeof data !== "object" || data.ok !== true) {
    const reason =
      data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error?: string }).error
        : "UnknownError";
    throw new Error(`FunctionError: ${reason}`);
  }

  const result = (data as { result?: unknown }).result;
  if (!result || typeof result !== "object") {
    throw new Error("FunctionError: invalid response payload");
  }

  const status = (result as { status?: unknown }).status;
  if (status !== "need_info" && status !== "ready") {
    throw new Error("FunctionError: unexpected status");
  }

  return result as SupabaseNeedInfoResult | SupabaseReadyResult;
}

export async function invokeRuleGeneratorChat(
  body: RuleGeneratorChatRequest,
): Promise<RuleGeneratorChatResult> {
  if (!body || !Array.isArray(body.conversation)) {
    throw new Error("ruleGeneratorChat: conversation manquante");
  }

  const sanitizedConversation = sanitizeConversation(body.conversation);
  if (sanitizedConversation.length === 0) {
    throw new Error("ruleGeneratorChat: conversation vide");
  }

  const prompt =
    typeof body.prompt === "string" ? body.prompt.trim() : undefined;

  const payload = JSON.parse(
    JSON.stringify({
      prompt: prompt && prompt.length > 0 ? prompt : undefined,
      conversation: sanitizedConversation,
      board: body.board ?? undefined,
      options: {
        locale: "fr-CH",
        dryRun: false,
        ...(body.options ?? {}),
      },
    }),
  );

  const response = await invokeSupabaseRuleGenerator(payload, 0, 2, 600);
  const result = ensureResultRecord(response);

  if (result.status === "need_info") {
    const questions = Array.isArray(result.questions)
      ? result.questions.filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.length > 0,
        )
      : [];

    return {
      status: "need_info",
      questions,
      prompt: result.prompt,
      promptHash: result.promptHash,
      correlationId: result.correlationId,
      rawModelResponse: result.rawModelResponse,
      provider: result.provider,
    };
  }

  const rule = result.rule;
  if (!rule || typeof rule !== "object") {
    throw new Error("ruleGeneratorChat: règle manquante dans la réponse");
  }

  return {
    status: "ready",
    rule,
    validation: result.validation,
    dryRun: result.dryRun ?? null,
    prompt: result.prompt,
    promptHash: result.promptHash,
    correlationId: result.correlationId,
    rawModelResponse: result.rawModelResponse,
    provider: result.provider,
  };
}

// Compatibilité avec l'ancien flux monolithique
export async function invokeGenerateRule(
  body: GenerateRuleRequest,
): Promise<GeneratedRule> {
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    throw new Error("generateRule: prompt manquant ou vide");
  }

  const conversation: RuleGeneratorChatMessage[] = [
    { role: "user", content: body.prompt.trim() },
  ];

  const result = await invokeRuleGeneratorChat({
    prompt: body.prompt,
    conversation,
    board: body.board,
    options: body.options,
  });

  if (result.status !== "ready") {
    const followUps = result.questions?.join(" | ");
    throw new Error(
      followUps
        ? `Informations supplémentaires requises: ${followUps}`
        : "La génération de règle est incomplète.",
    );
  }

  return result.rule;
}
