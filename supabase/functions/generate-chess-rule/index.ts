// --- generate-chess-rule/index.ts ---
// Compile custom chess rules with Groq, seeded by the heuristic engine pipeline.

import { RULE_GENERATOR_MIN_PROMPT_LENGTH } from "../../../shared/rule-generator.ts";
import type { RuleJSON } from "@/engine/types";
import { extractProgram } from "@/features/rules-pipeline/nlp/programExtractor";
import type { ProgramExtractionWarning } from "@/features/rules-pipeline/nlp/programExtractor";
import { buildRuleFromProgram } from "@/features/rules-pipeline/factory/ruleFactory";
import type {
  RuleFactoryWarning,
  RuleFactoryResult,
} from "@/features/rules-pipeline/factory/ruleFactory";
import { compileIntentToRule } from "@/features/rules-pipeline/compiler";
import type { CompilationWarning } from "@/features/rules-pipeline/compiler";
import { validateRule } from "@/features/rules-pipeline/validation/ruleValidator";
import type { ValidationIssue } from "@/features/rules-pipeline/validation/ruleValidator";
import { dryRunRule } from "@/features/rules-pipeline/simulation/dryRun";
import type { DryRunResult } from "@/features/rules-pipeline/simulation/dryRun";
import { buildExecutionPlan } from "@/features/rules-pipeline/plan/buildPlan";
import type { ExecutionPlan } from "@/features/rules-pipeline/plan/buildPlan";
import { buildFallbackProvider } from "@/features/rules-pipeline/fallback/providerGenerator";
import type { FallbackProvider } from "@/features/rules-pipeline/fallback/providerGenerator";
import type { CanonicalIntent } from "@/features/rules-pipeline/schemas/canonicalIntent";
import type { RuleProgram } from "@/features/rules-pipeline/rule-language/types";

const DEFAULT_TIMEOUT = Number(Deno.env.get("AI_REQUEST_TIMEOUT") || "10000");

const textEncoder = new TextEncoder();

const timeoutPromise = (ms: number, msg = "timeout") =>
  new Promise<never>((_, rej) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      rej(new Error(msg));
    }, ms);
  });

type ChatMessage = { role: "user" | "assistant"; content: string };

type GroqSuccess = {
  rule: RuleJSON;
  rawContent: string;
  model?: string;
  usage?: Record<string, unknown>;
};

type GroqFailure = {
  error: string;
  rawContent?: string;
  model?: string;
  usage?: Record<string, unknown>;
};

type HeuristicPipeline = {
  program: RuleProgram;
  programWarnings: ProgramExtractionWarning[];
  intent: CanonicalIntent;
  factoryWarnings: RuleFactoryWarning[];
  tests: RuleFactoryResult["tests"];
  movementOverrides: RuleFactoryResult["movementOverrides"];
  heuristicRule: RuleJSON;
  compilationWarnings: CompilationWarning[];
  validation: { issues: ValidationIssue[]; isValid: boolean };
  dryRun: DryRunResult;
  plan: ExecutionPlan[];
  fallbackProvider?: FallbackProvider;
};

const sanitizeConversation = (value: unknown): ChatMessage[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const role = (entry as { role?: unknown }).role;
      const contentRaw = (entry as { content?: unknown }).content;
      if (
        (role !== "user" && role !== "assistant") ||
        typeof contentRaw !== "string"
      ) {
        return null;
      }

      const content = contentRaw.trim();
      if (!content) {
        return null;
      }

      return { role, content } satisfies ChatMessage;
    })
    .filter((entry): entry is ChatMessage => entry !== null);
};

const resolveInstruction = (
  prompt: unknown,
  conversation: ChatMessage[],
): string | null => {
  const promptText = typeof prompt === "string" ? prompt.trim() : "";
  if (promptText.length >= RULE_GENERATOR_MIN_PROMPT_LENGTH) {
    return promptText;
  }

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const message = conversation[index];
    if (
      message.role === "user" &&
      message.content.length >= RULE_GENERATOR_MIN_PROMPT_LENGTH
    ) {
      return message.content;
    }
  }

  return null;
};

const runHeuristicPipeline = (instruction: string): HeuristicPipeline => {
  const { program, warnings: programWarnings } = extractProgram(instruction);
  const {
    intent,
    warnings: factoryWarnings,
    tests,
    movementOverrides,
  } = buildRuleFromProgram(program);
  const { rule: heuristicRule, warnings: compilationWarnings } =
    compileIntentToRule(intent);
  const validation = validateRule(intent, heuristicRule);
  const dryRun = dryRunRule(intent, heuristicRule, tests, movementOverrides);
  const plan = buildExecutionPlan(heuristicRule);

  const needsFallback = compilationWarnings.some(
    (warning) => warning.code === "missing_compiler",
  );
  const fallbackProvider = needsFallback
    ? buildFallbackProvider(intent)
    : undefined;

  return {
    program,
    programWarnings,
    intent,
    factoryWarnings,
    tests,
    movementOverrides,
    heuristicRule,
    compilationWarnings,
    validation,
    dryRun,
    plan,
    fallbackProvider,
  };
};

const parseGroqJson = (content: string): RuleJSON | null => {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fencedMatch ? (fencedMatch[1] ?? "") : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonSlice) as RuleJSON;
  } catch (_error) {
    return null;
  }
};

const buildGroqMessages = (
  instruction: string,
  pipeline: HeuristicPipeline,
): ChatMessage[] => {
  const heuristicsContext = JSON.stringify(
    {
      instruction,
      intent: pipeline.intent,
      heuristic_rule: pipeline.heuristicRule,
      warnings: {
        program: pipeline.programWarnings,
        factory: pipeline.factoryWarnings,
        compilation: pipeline.compilationWarnings,
      },
      dry_run: pipeline.dryRun,
      validation: pipeline.validation,
      tests: pipeline.tests,
      movement_overrides: pipeline.movementOverrides,
      fallback_provider: pipeline.fallbackProvider ?? null,
      plan: pipeline.plan,
    },
    null,
    2,
  );

  const systemPrompt =
    "Tu es un compilateur pour un moteur de règles d'échecs JSON. " +
    "Respecte strictement le schéma des règles: meta, scope, ui, state, parameters, logic. " +
    "Ne réponds qu'en JSON valide, sans texte additionnel.";

  const userPrompt =
    `Instruction utilisateur:\n${instruction}\n\n` +
    `Données heuristiques (JSON):\n${heuristicsContext}\n\n` +
    "Objectif: utilise les données heuristiques comme base, " +
    "complète ou ajuste la règle pour respecter l'intention. " +
    "Assure-toi que les clés et valeurs restent cohérentes avec le moteur.";

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
};

const callGroq = async (
  instruction: string,
  pipeline: HeuristicPipeline,
): Promise<GroqSuccess | GroqFailure> => {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    return { error: "missing_api_key" };
  }

  const body = {
    model: Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
    messages: buildGroqMessages(instruction, pipeline),
    max_tokens: 1800,
    temperature: 0.35,
  };

  try {
    const response = await Promise.race([
      fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      }),
      timeoutPromise(DEFAULT_TIMEOUT, "groq_timeout"),
    ]);

    const text = await response.text();
    if (!response.ok) {
      return { error: `http_${response.status}`, rawContent: text };
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch (_error) {
      return { error: "invalid_response", rawContent: text };
    }

    const model =
      typeof payload?.model === "string" ? payload.model : undefined;
    const usage =
      payload && typeof payload.usage === "object"
        ? (payload.usage as Record<string, unknown>)
        : undefined;

    const choice = Array.isArray(payload?.choices)
      ? payload.choices[0]
      : undefined;
    const content =
      choice && typeof choice === "object"
        ? ((choice as { message?: { content?: string } }).message?.content ??
          "")
        : "";

    if (typeof content !== "string" || !content.trim()) {
      return { error: "empty_message", rawContent: text, model, usage };
    }

    const parsedRule = parseGroqJson(content);
    if (!parsedRule) {
      return {
        error: "invalid_json_payload",
        rawContent: content,
        model,
        usage,
      };
    }

    return {
      rule: parsedRule,
      rawContent: content,
      model,
      usage,
    } satisfies GroqSuccess;
  } catch (error) {
    return {
      error:
        (error instanceof Error ? error.message : String(error)) ?? "unknown",
    };
  }
};

const computePromptHash = async (instruction: string): Promise<string> => {
  const bytes = textEncoder.encode(instruction);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const buildReadyResult = async (
  instruction: string,
  pipeline: HeuristicPipeline,
  groqOutcome: GroqSuccess | GroqFailure,
) => {
  let rule = pipeline.heuristicRule;
  let validation = pipeline.validation;
  let dryRun = pipeline.dryRun;
  let plan = pipeline.plan;
  let provider = "heuristic-only";
  const groqMeta: Record<string, unknown> = {
    status: "skipped",
  };

  if ("rule" in groqOutcome) {
    const candidateRule = groqOutcome.rule;
    const candidateValidation = validateRule(pipeline.intent, candidateRule);
    const candidateDryRun = dryRunRule(
      pipeline.intent,
      candidateRule,
      pipeline.tests,
      pipeline.movementOverrides,
    );
    const candidatePlan = buildExecutionPlan(candidateRule);

    if (candidateValidation.isValid && candidateDryRun.passed) {
      rule = candidateRule;
      validation = candidateValidation;
      dryRun = candidateDryRun;
      plan = candidatePlan;
      provider = "groq+heuristic";
      groqMeta.status = "success";
    } else {
      groqMeta.status = "invalid_output";
      groqMeta.validation = candidateValidation;
      groqMeta.dryRun = candidateDryRun;
      groqMeta.rawContent = groqOutcome.rawContent;
      groqMeta.model = groqOutcome.model;
      groqMeta.usage = groqOutcome.usage;
    }
  } else {
    groqMeta.status = groqOutcome.error;
    groqMeta.rawContent = groqOutcome.rawContent;
    groqMeta.model = groqOutcome.model;
    groqMeta.usage = groqOutcome.usage;
  }

  const rawModelResponse = {
    source: "groq-rule-compiler",
    heuristics: {
      programWarnings: pipeline.programWarnings,
      factoryWarnings: pipeline.factoryWarnings,
      compilationWarnings: pipeline.compilationWarnings,
      fallbackProvider: pipeline.fallbackProvider ?? null,
    },
    groq: groqMeta,
  } satisfies Record<string, unknown>;

  return {
    status: "ready" as const,
    rule,
    validation,
    dryRun,
    plan,
    prompt: instruction,
    promptHash: await computePromptHash(instruction),
    correlationId: null,
    rawModelResponse,
    provider,
  };
};

Deno.serve(async (req) => {
  const CORS_ALLOW_HEADERS =
    "Content-Type, Authorization, apikey, x-client-info";
  const defaultCors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
  } satisfies Record<string, string>;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...defaultCors,
        "Access-Control-Max-Age": "3600",
      },
    });
  }

  const auth = req.headers.get("authorization");
  if (!auth) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_authorization" }),
      {
        status: 401,
        headers: { ...defaultCors, "Content-Type": "application/json" },
      },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch (_error) {
    payload = {} as Record<string, unknown>;
  }

  const conversation = sanitizeConversation(payload.conversation);
  const instruction = resolveInstruction(payload.prompt, conversation);

  if (!instruction) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_prompt" }),
      {
        status: 400,
        headers: { ...defaultCors, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const pipeline = runHeuristicPipeline(instruction);
    const groqOutcome = await callGroq(instruction, pipeline);
    const result = await buildReadyResult(instruction, pipeline, groqOutcome);

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { ...defaultCors, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[generate-chess-rule] Unexpected error", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "internal_error",
        detail: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...defaultCors, "Content-Type": "application/json" },
      },
    );
  }
});
