// /src/lib/supabase/functions.ts
import {
  resolveSupabaseFunctionUrl,
  supabase,
  supabaseAnonKey,
  supabaseDiagnostics,
  supabaseFunctionsUrl,
} from "@/integrations/supabase/client";
import { generateRulePipeline } from "@/features/rules-pipeline";

export type GeneratedRule = Record<string, unknown>;

export type RuleGeneratorNeedInfoQuestion = {
  question: string;
  options: [string, string, string];
  allowMultiple?: boolean;
};

type SupabaseNeedInfoResult = {
  status: "need_info";
  questions: RuleGeneratorNeedInfoQuestion[];
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

const RULE_GENERATOR_FUNCTION_PATH = "generate-chess-rule";

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normaliseSupabaseFunctionsBase = (): string | null => {
  const configuredBase =
    supabaseFunctionsUrl ?? supabaseDiagnostics.functionsUrl ?? null;
  if (configuredBase && configuredBase.trim().length > 0) {
    return configuredBase;
  }

  const projectId = supabaseDiagnostics.resolvedProjectId;
  if (typeof projectId === "string" && projectId.trim().length > 0) {
    return `https://${projectId.trim()}.functions.supabase.co`;
  }

  return null;
};

const resolveSupabaseFunctionsEndpoint = (path: string): string | null => {
  const explicit = resolveSupabaseFunctionUrl(path);
  if (explicit) {
    return explicit;
  }

  const base = normaliseSupabaseFunctionsBase();
  if (!base) {
    return null;
  }

  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.replace(/^\/+/, "");

  return trimmedPath ? `${trimmedBase}/${trimmedPath}` : trimmedBase;
};

const readEdgeFunctionResponse = async (
  response: Response,
): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (_error) {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text;
  } catch (_error) {
    return null;
  }
};

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

const isSupabaseCorsError = (error: unknown): boolean => {
  const message = toErrorMessage(error).toLowerCase();

  return (
    message.includes("x-client-info") ||
    message.includes("cors") ||
    message.includes("failed to fetch")
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

const cloneAsRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    } catch (_error) {
      return value as Record<string, unknown>;
    }
  }

  return undefined;
};

const collectUserInstructions = (
  prompt: string | undefined,
  conversation: RuleGeneratorChatMessage[],
): string | undefined => {
  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (trimmedPrompt.length > 0) {
    return trimmedPrompt;
  }

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const message = conversation[index];
    if (message.role === "user") {
      const trimmed = message.content.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  const combined = conversation
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");

  return combined.length > 0 ? combined : undefined;
};

const buildPipelineReadyResult = (
  instruction: string,
  cause: unknown,
  options: { logWarning?: boolean } = {},
): RuleGeneratorReady => {
  const pipeline = generateRulePipeline(instruction, { forceFallback: true });
  const validation = cloneAsRecord(pipeline.validation) ?? {
    issues: pipeline.validation.issues,
    isValid: pipeline.validation.isValid,
  };
  const dryRun = cloneAsRecord(pipeline.dryRun) ?? {
    passed: pipeline.dryRun.passed,
    issues: pipeline.dryRun.issues,
  };

  const rawModelResponse = {
    source: "local-pipeline",
    cause: toErrorMessage(cause),
    programWarnings: pipeline.programWarnings,
    factoryWarnings: pipeline.factoryWarnings,
    compilationWarnings: pipeline.compilationWarnings,
    fallbackProvider: pipeline.fallbackProvider ?? null,
    plan: pipeline.plan,
  } satisfies Record<string, unknown>;

  if (options.logWarning) {
    console.warn(
      "[ruleGenerator] Supabase indisponible, utilisation du pipeline local.",
      rawModelResponse.cause,
    );
  }

  return {
    status: "ready",
    rule: (cloneAsRecord(pipeline.rule) ?? pipeline.rule) as GeneratedRule,
    validation,
    dryRun,
    prompt: instruction,
    promptHash: undefined,
    correlationId: undefined,
    rawModelResponse,
    provider: pipeline.fallbackProvider
      ? "local-pipeline:fallback"
      : "local-pipeline",
  } satisfies RuleGeneratorReady;
};

const buildLocalPipelineFallback = (
  prompt: string | undefined,
  conversation: RuleGeneratorChatMessage[],
  cause: unknown,
): RuleGeneratorReady | null => {
  const instruction = collectUserInstructions(prompt, conversation);
  if (!instruction) {
    return null;
  }

  try {
    return buildPipelineReadyResult(instruction, cause, { logWarning: true });
  } catch (pipelineError) {
    console.error("[ruleGenerator] Le pipeline local a échoué", pipelineError);
    return null;
  }
};

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
      const directMessage = toErrorMessage(error);

      if (isSupabaseCorsError(error) || isSupabaseCorsError(directMessage)) {
        return invokeSupabaseRuleGeneratorViaDirectFetch(
          payload,
          attempt,
          maxRetry,
          baseDelay,
        );
      }

      const status = getStatusFromError(error);
      const responsePayload = await readSupabaseErrorResponse(error);

      const message =
        formatSupabaseEdgeFunctionError(responsePayload) ?? directMessage;

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

    if (isSupabaseCorsError(err)) {
      return invokeSupabaseRuleGeneratorViaDirectFetch(
        payload,
        attempt,
        maxRetry,
        baseDelay,
      );
    }

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

async function invokeSupabaseRuleGeneratorViaDirectFetch(
  payload: Record<string, unknown>,
  attempt: number,
  maxRetry: number,
  baseDelay: number,
): Promise<SupabaseRuleGeneratorResponse> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 55000);

  const endpoint = resolveSupabaseFunctionsEndpoint(
    RULE_GENERATOR_FUNCTION_PATH,
  );
  if (!endpoint) {
    clearTimeout(to);
    throw new Error(
      "Supabase Edge Function 'generate-chess-rule' introuvable : configurez VITE_SUPABASE_FUNCTIONS_URL.",
    );
  }

  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (supabaseAnonKey) {
    headers.set("apikey", supabaseAnonKey);
  }

  let accessToken: string | null | undefined;
  try {
    accessToken = supabase
      ? (await supabase.auth.getSession()).data.session?.access_token
      : undefined;
  } catch (_error) {
    accessToken = undefined;
  }

  const bearerToken =
    typeof accessToken === "string" && accessToken.trim().length > 0
      ? accessToken
      : typeof supabaseAnonKey === "string" && supabaseAnonKey.trim().length > 0
        ? supabaseAnonKey
        : undefined;

  if (bearerToken) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(to);

    const body = await readEdgeFunctionResponse(response);

    if (!response.ok) {
      const message =
        formatSupabaseEdgeFunctionError(body) ??
        (typeof body === "string" ? body || `HTTP ${response.status}` : "");

      throw new Error(
        message ||
          `Supabase Edge Function 'generate-chess-rule' a renvoyé ${response.status}.`,
      );
    }

    if (!body || typeof body !== "object") {
      throw new Error("FunctionError: invalid response payload");
    }

    return body as SupabaseRuleGeneratorResponse;
  } catch (error) {
    clearTimeout(to);

    const message = toErrorMessage(error);

    if (attempt < maxRetry && shouldRetryFromMessage(message)) {
      await delay(baseDelay * (attempt + 1));
      return invokeSupabaseRuleGeneratorViaDirectFetch(
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
  const instruction = collectUserInstructions(prompt, sanitizedConversation);
  if (!instruction) {
    throw new Error("ruleGeneratorChat: aucune instruction utilisateur");
  }

  const payload: Record<string, unknown> = {
    prompt: instruction,
    conversation: sanitizedConversation,
  };

  if (body.board) {
    payload.board = body.board;
  }

  if (body.options) {
    payload.options = body.options;
  }

  try {
    const response = await invokeSupabaseRuleGenerator(payload, 0, 2, 250);
    const result = ensureResultRecord(response);
    return result;
  } catch (error) {
    const fallback = buildLocalPipelineFallback(
      prompt,
      sanitizedConversation,
      error,
    );
    if (fallback) {
      return fallback;
    }

    throw new Error(
      `ruleGeneratorChat: l'appel distant a échoué (${toErrorMessage(error)})`,
    );
  }
}

function normalizeNeedInfoQuestions(
  raw: unknown,
): RuleGeneratorNeedInfoQuestion[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const questionValue = record["question"];
    const optionsValue = record["options"];

    if (typeof questionValue !== "string") {
      continue;
    }

    const trimmedQuestion = questionValue.trim();
    if (!trimmedQuestion) {
      continue;
    }

    if (!Array.isArray(optionsValue)) {
      continue;
    }

    const collectedOptions: string[] = [];
    const seenOptions = new Set<string>();

    for (const option of optionsValue) {
      let label: string | undefined;

      if (typeof option === "string") {
        label = option.trim();
      } else if (option && typeof option === "object") {
        const objectOption = option as Record<string, unknown>;
        const candidateRaw =
          typeof objectOption.label === "string"
            ? objectOption.label
            : typeof objectOption.value === "string"
              ? objectOption.value
              : typeof objectOption.title === "string"
                ? objectOption.title
                : undefined;

        label =
          typeof candidateRaw === "string" ? candidateRaw.trim() : undefined;
      }

      if (!label) {
        continue;
      }

      if (seenOptions.has(label)) {
        continue;
      }

      seenOptions.add(label);
      collectedOptions.push(label);

      if (collectedOptions.length === 3) {
        break;
      }
    }

    if (collectedOptions.length < 3) {
      continue;
    }

    return [
      {
        question: trimmedQuestion,
        options: [
          collectedOptions[0],
          collectedOptions[1],
          collectedOptions[2],
        ],
        allowMultiple: false,
      },
    ];
  }

  return [];
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
    const followUps = result.questions
      ?.map(
        (question) => `${question.question} (${question.options.join(", ")})`,
      )
      .join(" | ");
    throw new Error(
      followUps
        ? `Informations supplémentaires requises: ${followUps}`
        : "La génération de règle est incomplète.",
    );
  }

  return result.rule;
}
