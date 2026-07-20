import { FunctionsHttpError } from "@supabase/supabase-js";
import { requireSupabaseClient } from "@/integrations/supabase/client";
import type {
  CompileRuleResponse,
  CreatedRuleLobby,
  PublishedRuleVersion,
} from "@/rules-v2";

export type CreatedRuleLobbyResponse = Omit<CreatedRuleLobby, "matchSeed"> & {
  matchSeed: number | null;
};

interface FunctionEnvelope<T> {
  success: boolean;
  error?: string;
  code?: string;
  retryable?: boolean;
  newRequestRequired?: boolean;
  data?: T;
}

export type RuleArchitectApiErrorDetails = {
  code?: string | null;
  retryable?: boolean | null;
  newRequestRequired?: boolean;
  status?: number | null;
};

export class RuleArchitectApiError extends Error {
  readonly code: string | null;
  readonly retryable: boolean | null;
  readonly newRequestRequired: boolean;
  readonly status: number | null;

  constructor(message: string, details: RuleArchitectApiErrorDetails = {}) {
    super(message);
    this.name = "RuleArchitectApiError";
    this.code = details.code ?? null;
    this.retryable = details.retryable ?? null;
    this.newRequestRequired = details.newRequestRequired === true;
    this.status = details.status ?? null;
  }
}

type JsonResponseLike = {
  status?: unknown;
  clone?: () => unknown;
  json: () => Promise<unknown>;
};

const RULE_SCENE_ID_PATTERN = /^scene\.[a-z0-9][a-z0-9.-]{2,63}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isJsonResponseLike = (value: unknown): value is JsonResponseLike =>
  isRecord(value) && typeof value.json === "function";

const isFunctionsHttpError = (error: unknown): error is FunctionsHttpError =>
  error instanceof FunctionsHttpError ||
  (isRecord(error) &&
    error.name === "FunctionsHttpError" &&
    "context" in error);

const errorFromPayload = (
  payload: unknown,
  fallback: string,
  status: number | null = null,
): RuleArchitectApiError => {
  const body = isRecord(payload) ? payload : null;
  return new RuleArchitectApiError(
    typeof body?.error === "string" ? body.error : fallback,
    {
      code: typeof body?.code === "string" ? body.code : null,
      retryable: typeof body?.retryable === "boolean" ? body.retryable : null,
      newRequestRequired: body?.newRequestRequired === true,
      status,
    },
  );
};

const parseFunctionInvokeError = async (
  error: unknown,
  fallback: string,
): Promise<RuleArchitectApiError> => {
  if (error instanceof RuleArchitectApiError) {
    return error;
  }

  if (isFunctionsHttpError(error)) {
    const context = error.context as unknown;
    const status =
      isRecord(context) && typeof context.status === "number"
        ? context.status
        : null;

    if (isJsonResponseLike(context)) {
      try {
        const cloned =
          typeof context.clone === "function" ? context.clone() : context;
        const reader = isJsonResponseLike(cloned) ? cloned : context;
        const payload = await reader.json();
        return errorFromPayload(payload, fallback, status);
      } catch {
        return new RuleArchitectApiError(fallback, {
          status,
        });
      }
    }

    return new RuleArchitectApiError(fallback, {
      status,
    });
  }

  const message =
    error instanceof Error &&
    !["FunctionsFetchError", "FunctionsRelayError"].includes(error.name)
      ? error.message
      : fallback;
  return new RuleArchitectApiError(message || fallback);
};

const unwrap = <T>(
  payload: FunctionEnvelope<T> | null,
  fallback: string,
): T => {
  if (!payload?.success || payload.data === undefined) {
    throw errorFromPayload(payload, fallback);
  }
  return payload.data;
};

const hasRuleSceneAssetRequests = (compiledRule: unknown): boolean => {
  if (!isRecord(compiledRule) || !isRecord(compiledRule.logic)) return false;
  const effects = Array.isArray(compiledRule.logic.effects)
    ? compiledRule.logic.effects.slice(0, 24)
    : [];

  for (const effect of effects) {
    if (!isRecord(effect)) continue;
    const actions = Array.isArray(effect.do)
      ? effect.do.slice(0, 24)
      : effect.do === undefined
        ? []
        : [effect.do];
    for (const action of actions) {
      if (!isRecord(action) || action.action !== "vfx.play") continue;
      if (!isRecord(action.params)) continue;
      if (
        typeof action.params.sprite === "string" &&
        RULE_SCENE_ID_PATTERN.test(action.params.sprite)
      ) {
        return true;
      }
    }
  }

  return false;
};

export async function compileChessRule(input: {
  prompt: string;
  premium: boolean;
  requestKey: string;
}): Promise<CompileRuleResponse> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke(
    "compile-chess-rule",
    {
      body: input,
    },
  );

  if (error) {
    throw await parseFunctionInvokeError(
      error,
      "La compilation de la règle a échoué.",
    );
  }

  const result = unwrap<CompileRuleResponse>(
    data as FunctionEnvelope<CompileRuleResponse>,
    "La compilation de la règle a échoué.",
  );

  if (
    result.ok &&
    result.compilationId &&
    hasRuleSceneAssetRequests(result.compiledRule)
  ) {
    try {
      const { error: assetError } = await supabase.functions.invoke(
        "resolve-rule-assets",
        {
          body: {
            action: "resolve",
            compilationId: result.compilationId,
          },
        },
      );
      if (assetError) {
        console.warn(
          "[RuleArchitect] Asset resolver unavailable; procedural fallback enabled.",
        );
      }
    } catch {
      console.warn(
        "[RuleArchitect] Asset resolver unavailable; procedural fallback enabled.",
      );
    }
  }

  return result;
}

export async function publishRuleVersion(input: {
  compilationId: string;
  visibility: "private" | "unlisted" | "public";
}): Promise<PublishedRuleVersion> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke(
    "publish-rule-version",
    {
      body: input,
    },
  );

  if (error) {
    throw await parseFunctionInvokeError(
      error,
      "La publication de la règle a échoué.",
    );
  }

  return unwrap<PublishedRuleVersion>(
    data as FunctionEnvelope<PublishedRuleVersion>,
    "La publication de la règle a échoué.",
  );
}

export async function createRuleLobby(input: {
  name: string;
  ruleVersionIds: string[];
  mode: "player" | "ai";
  requestKey: string;
}): Promise<CreatedRuleLobbyResponse> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke(
    "create-rule-lobby-v2",
    {
      body: input,
    },
  );

  if (error) {
    throw await parseFunctionInvokeError(
      error,
      "La création du lobby a échoué.",
    );
  }

  return unwrap<CreatedRuleLobbyResponse>(
    data as FunctionEnvelope<CreatedRuleLobbyResponse>,
    "La création du lobby a échoué.",
  );
}
