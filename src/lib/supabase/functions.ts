// /src/lib/supabase/functions.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type GenerateRuleEffect = {
  type: string;
  triggers?: string[];
  payload?: Record<string, unknown>;
};

type GenerateRuleAdapters = {
  onSelect?: string;
  onSpecialAction?: string;
  onTick?: string;
  validate?: string;
  resolveConflicts?: string;
};

export type GeneratedRule = {
  ruleId: string;
  ruleName: string;
  description: string;
  visuals?: {
    icon?: string;
    color?: string;
    animations?: string[];
  };
  effects: GenerateRuleEffect[];
  engineAdapters: GenerateRuleAdapters;
};

type GenerateRuleSuccess = {
  ok: true;
  rule: any; // RuleJSON complet depuis la DB
  meta?: {
    correlationId?: string;
    ruleId?: string;
    promptKey?: string;
    generationDurationMs?: number;
    dryRunSuccess?: boolean;
    dryRunWarnings?: string[];
    ajvWarnings?: string[];
  };
};

type GenerateRuleFailure = {
  ok: false;
  error: string;
  reason?: string;
  details?: unknown;
  raw?: string;
};

type GenerateRuleResponse = GenerateRuleSuccess | GenerateRuleFailure;

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

// Appel robuste avec retry & abort
export async function invokeGenerateRule(body: {
  prompt: string;
  locale?: "fr" | "en";
  temperature?: number;
  context?: Record<string, unknown>;
}): Promise<GeneratedRule> {
  const MAX_RETRY = 2;
  const baseDelay = 600;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 55000);

    try {
      const { data, error } =
        await supabase.functions.invoke<GenerateRuleResponse>(
          "generate-chess-rule",
          {
            body,
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      clearTimeout(to);

      if (error) {
        const status = getStatusFromError(error);
        const message = toErrorMessage(error);

        if (
          attempt < MAX_RETRY &&
          (shouldRetryFromStatus(status) || shouldRetryFromMessage(message))
        ) {
          await delay(baseDelay * (attempt + 1));
          continue;
        }

        throw new Error(message);
      }

      if (!data || !data.ok) {
        const reason = (data as any)?.error ?? "UnknownError";
        throw new Error(`FunctionError: ${reason}`);
      }

      return data.rule;
    } catch (err) {
      clearTimeout(to);
      const message = toErrorMessage(err);

      if (attempt < MAX_RETRY && shouldRetryFromMessage(message)) {
        await delay(baseDelay * (attempt + 1));
        continue;
      }

      throw new Error(message);
    }
  }

  throw new Error("Exhausted retries for generate-chess-rule");
}
