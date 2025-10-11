import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";

const corsOptions = { methods: ["POST"] } as const;

const TITLE_MAX_WORDS = 6;

const categoryKeywords: Array<{ category: string; keywords: RegExp[] }> = [
  { category: "movement", keywords: [/move/i, /déplacement/i, /step/i, /avance/i] },
  { category: "capture", keywords: [/capture/i, /prendre/i, /prise/i, /take/i] },
  { category: "special", keywords: [/special/i, /spéciale/i, /bonus/i, /unique/i] },
  { category: "condition", keywords: [/si /i, /if /i, /condition/i] },
  { category: "victory", keywords: [/victoire/i, /mate/i, /échec et mat/i, /win/i] },
  { category: "restriction", keywords: [/restriction/i, /limite/i, /cannot/i, /interdit/i] },
  { category: "defense", keywords: [/défense/i, /protect/i, /shield/i, /block/i] },
  { category: "behavior", keywords: [/comportement/i, /behavior/i, /automatique/i, /auto/i] },
];

const triggerKeywords: Array<{ trigger: string; keywords: RegExp[] }> = [
  { trigger: "onMove", keywords: [/move/i, /déplacement/i, /joue/i] },
  { trigger: "onCapture", keywords: [/capture/i, /prendre/i, /prise/i] },
  { trigger: "onCheck", keywords: [/check/i, /échec/i] },
  { trigger: "onCheckmate", keywords: [/mate/i, /mat/i] },
  { trigger: "turnBased", keywords: [/tour/i, /turn/i, /round/i] },
  { trigger: "conditional", keywords: [/si /i, /if /i, /condition/i] },
];

const pieceKeywords = [
  { piece: "king", patterns: [/king/i, /roi/i] },
  { piece: "queen", patterns: [/queen/i, /reine/i] },
  { piece: "rook", patterns: [/rook/i, /tour\b/i] },
  { piece: "bishop", patterns: [/bishop/i, /fou/i] },
  { piece: "knight", patterns: [/knight/i, /cavalier/i] },
  { piece: "pawn", patterns: [/pawn/i, /pion/i] },
];

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

const extractRuleName = (prompt: string) => {
  const words = prompt.trim().split(/\s+/).slice(0, TITLE_MAX_WORDS);
  if (words.length === 0) {
    return "Règle personnalisée";
  }
  return toTitleCase(words.join(" "));
};

const detectCategory = (prompt: string): string => {
  for (const entry of categoryKeywords) {
    if (entry.keywords.some((pattern) => pattern.test(prompt))) {
      return entry.category;
    }
  }
  return "special";
};

const detectTrigger = (prompt: string): string => {
  for (const entry of triggerKeywords) {
    if (entry.keywords.some((pattern) => pattern.test(prompt))) {
      return entry.trigger;
    }
  }
  return "always";
};

const detectAffectedPieces = (prompt: string): string[] => {
  const detected = pieceKeywords
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(prompt)))
    .map((entry) => entry.piece);

  if (detected.length === 0) {
    return ["all"];
  }

  return Array.from(new Set(detected));
};

const buildConditions = (prompt: string, affected: string[]): Array<{
  type: string;
  value: string;
  operator: string;
}> => {
  const conditions: Array<{ type: string; value: string; operator: string }> = [];

  if (affected.length === 1 && affected[0] !== "all") {
    conditions.push({ type: "pieceType", value: affected[0], operator: "equals" });
  }

  const turnMatch = prompt.match(/\b(\d+)\s*(?:turn|tour)s?/i);
  if (turnMatch) {
    conditions.push({ type: "turnNumber", value: turnMatch[1], operator: "greaterOrEqual" });
  }

  return conditions;
};

const buildEffects = (prompt: string, category: string) => {
  const actionByCategory: Record<string, string> = {
    movement: "modifyMovement",
    capture: "allowCapture",
    special: "triggerEvent",
    condition: "triggerEvent",
    victory: "triggerEvent",
    restriction: "restrictMovement",
    defense: "addAbility",
    behavior: "addAbility",
  };

  const action = actionByCategory[category] ?? "triggerEvent";

  return [
    {
      action,
      target: "specific",
      parameters: {
        count: 1,
        property: "description",
        value: prompt.slice(0, 120),
        duration: "temporary",
        range: 1,
      },
    },
  ];
};

const buildTags = (prompt: string) => {
  const cleaned = prompt
    .toLowerCase()
    .replace(/[^a-zàâçéèêëîïôûùüÿñæœ0-9\s]/g, " ");
  const words = cleaned
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !/\d+/.test(word));
  const unique: string[] = [];
  for (const word of words) {
    if (!unique.includes(word)) {
      unique.push(word);
    }
    if (unique.length >= 4) {
      break;
    }
  }
  if (unique.length === 0) {
    return ["personnalisee"];
  }
  return unique.slice(0, 4);
};

const createRuleFromPrompt = (prompt: string) => {
  const normalizedPrompt = prompt.trim();
  const ruleName = extractRuleName(normalizedPrompt);
  const category = detectCategory(normalizedPrompt);
  const affectedPieces = detectAffectedPieces(normalizedPrompt);
  const trigger = detectTrigger(normalizedPrompt);
  const conditions = buildConditions(normalizedPrompt, affectedPieces);
  const effects = buildEffects(normalizedPrompt, category);
  const tags = buildTags(normalizedPrompt);

  return {
    ruleId: `rule_${Date.now()}_${crypto.randomUUID()}`,
    ruleName,
    description: normalizedPrompt,
    category,
    affectedPieces,
    trigger,
    conditions,
    effects,
    priority: 1,
    isActive: true,
    tags,
    validationRules: {
      allowedWith: [],
      conflictsWith: [],
      requiredState: {},
    },
    createdAt: new Date().toISOString(),
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  try {
    if (req.method !== "POST") {
      return corsResponse(req, "Method not allowed", { status: 405 }, corsOptions);
    }

    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return jsonResponse(req, { error: "Prompt is required" }, { status: 400 }, corsOptions);
    }

    const rule = createRuleFromPrompt(prompt);

    return jsonResponse(req, { rule }, { status: 200 }, corsOptions);
  } catch (error) {
    console.error("Error in generate-chess-rule:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { error: errorMessage }, { status: 500 }, corsOptions);
  }
});
