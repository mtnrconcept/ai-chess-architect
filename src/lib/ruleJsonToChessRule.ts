import type {
  RuleJSON,
  LogicStep,
  ActionStep,
  UIActionSpec,
} from "@/engine/types";
import type { Tables } from "@/integrations/supabase/types";
import type { ChessRule, RuleEffect } from "@/types/chess";

const allowedCategories = new Set<ChessRule["category"]>([
  "movement",
  "capture",
  "special",
  "condition",
  "victory",
  "restriction",
  "defense",
  "behavior",
  "vip",
]);

const abilityKeywordFragments = [
  "ability",
  "radius",
  "range",
  "damage",
  "count",
  "cool",
  "trigger",
  "anim",
  "sound",
  "freeze",
  "duration",
  "target",
  "area",
  "blast",
  "status",
  "effect",
  "power",
  "strength",
  "charge",
  "usage",
  "turn",
  "perpiece",
  "allow",
  "zone",
  "aoe",
  "tile",
  "hit",
  "spell",
  "magic",
  "uiaction",
  "button",
  "icon",
  "hint",
  "label",
];

const abilityExactKeys = new Set([
  "ability",
  "abilityid",
  "abilityname",
  "ability_key",
  "abilitykey",
  "abilitylabel",
  "abilitytag",
  "abilitytype",
  "label",
  "hint",
  "icon",
  "cooldown",
  "countdown",
  "count",
  "radius",
  "range",
  "damage",
  "trigger",
  "activation",
  "animation",
  "sound",
  "buttonlabel",
  "freezeturns",
  "freezeduration",
  "turns",
  "duration",
  "allowoccupied",
  "targetingmode",
  "targeting",
  "tags",
  "metadata",
  "radiusmeters",
  "radiustiles",
  "arearadius",
  "blastradius",
  "effectduration",
  "intensity",
  "power",
  "level",
  "strength",
  "charges",
  "maxuses",
  "maxperpiece",
  "usage",
  "consumesturn",
  "availability",
  "cooldownturns",
  "frequency",
  "uiactionid",
  "status",
  "statuseffect",
  "statuskey",
  "statusduration",
  "rangebonus",
  "bonusrange",
]);

type RuleJsonMeta = Partial<RuleJSON["meta"]> & Record<string, unknown>;
type RuleJsonScope = NonNullable<RuleJSON["scope"]> & Record<string, unknown>;
type RuleJsonLogic = NonNullable<RuleJSON["logic"]> & Record<string, unknown>;
type RuleJsonUi = NonNullable<RuleJSON["ui"]> & Record<string, unknown>;

type ChessRuleRow = Tables<"chess_rules">;
type ChessRuleWithOriginal = ChessRule & { __originalRuleJson?: unknown };

type ConvertOptions = {
  row?: Partial<ChessRuleRow>;
  attachOriginal?: boolean;
};

type RecordLike = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordLike =>
  typeof value === "object" && value !== null;

const toRecord = (value: unknown): RecordLike | undefined =>
  isRecord(value) ? (value as RecordLike) : undefined;

const toString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const toLogicSteps = (value: unknown): LogicStep[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((step): step is LogicStep => isRecord(step));
};

const toActionSteps = (value: unknown): ActionStep[] => {
  if (!value) return [];
  return Array.isArray(value)
    ? (value.filter((step): step is ActionStep =>
        isRecord(step),
      ) as ActionStep[])
    : isRecord(value)
      ? [value as ActionStep]
      : [];
};

const toUiActions = (value: unknown): UIActionSpec[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is UIActionSpec =>
      isRecord(entry) && typeof entry.id === "string",
  );
};

const pickCategory = (
  rawCategory: unknown,
  fallback: ChessRule["category"],
): ChessRule["category"] => {
  const text = toString(rawCategory);
  if (!text) return fallback;
  if (allowedCategories.has(text as ChessRule["category"])) {
    return text as ChessRule["category"];
  }
  return fallback;
};

const shouldKeepKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  if (abilityExactKeys.has(normalized)) return true;
  return abilityKeywordFragments.some((fragment) =>
    normalized.includes(fragment),
  );
};

const mergeAbilityHints = (target: RecordLike, source: unknown) => {
  if (!isRecord(source)) return;

  const process = (record: RecordLike) => {
    Object.entries(record).forEach(([key, value]) => {
      if (value === undefined || value === null) return;

      if (key === "parameters" && isRecord(value)) {
        process(value as RecordLike);
        return;
      }

      if (key === "metadata" && isRecord(value)) {
        const existing = toRecord(target.metadata) ?? {};
        target.metadata = { ...existing, ...value } satisfies RecordLike;
        return;
      }

      if (isRecord(value)) {
        if (key === "ability" && target.ability === undefined) {
          const abilityRecord = value;
          const candidateKeys = [
            "id",
            "ability",
            "abilityId",
            "ability_id",
            "abilityKey",
            "ability_key",
            "key",
            "name",
            "label",
            "type",
          ];
          for (const candidateKey of candidateKeys) {
            const candidateValue = abilityRecord[candidateKey];
            const normalized = toString(candidateValue);
            if (normalized) {
              target.ability = normalized;
              break;
            }
          }
        }

        if (key === "cooldown" && target.cooldown === undefined) {
          const perPiece = toNumber((value as RecordLike).perPiece);
          if (perPiece !== undefined) {
            target.cooldown = perPiece;
          }
        }

        if (key === "targeting" && target.targetingMode === undefined) {
          const mode = toString((value as RecordLike).mode);
          if (mode) {
            target.targetingMode = mode;
          }
          target.targeting = {
            ...(toRecord(target.targeting) ?? {}),
            ...(value as RecordLike),
          } satisfies RecordLike;
        }

        if (key === "availability" && target.availability === undefined) {
          target.availability = value;
        }

        if (shouldKeepKey(key)) {
          process(value as RecordLike);
        }
        return;
      }

      if (Array.isArray(value)) {
        if (key === "tags" && target.tags === undefined) {
          const tags = value
            .map((entry) => toString(entry))
            .filter((entry): entry is string => Boolean(entry));
          if (tags.length > 0) {
            target.tags = tags;
          }
        }
        return;
      }

      if (!shouldKeepKey(key)) return;

      if (!(key in target)) {
        target[key] = value;
      }
    });
  };

  process(source);
};

const cleanObject = (value: RecordLike): RecordLike => {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entryValue]) => entryValue !== undefined && entryValue !== null,
    ),
  );
};

const normalizeAbilityIdentifier = (
  abilityValue: unknown,
  fallback: string,
): string => {
  const direct = toString(abilityValue);
  if (direct) return direct;
  if (isRecord(abilityValue)) {
    const candidateKeys = [
      "ability",
      "abilityId",
      "ability_id",
      "abilityKey",
      "ability_key",
      "id",
      "name",
      "label",
      "key",
      "type",
    ];
    for (const key of candidateKeys) {
      const candidate = toString(abilityValue[key]);
      if (candidate) {
        return candidate;
      }
    }
  }
  return fallback;
};

const extractAbilityEntryFromParameters = (
  parameters: RecordLike | undefined,
  abilityId: string,
): RecordLike | undefined => {
  if (!parameters) return undefined;

  const directEntry = toRecord(parameters[abilityId]);
  if (directEntry) return directEntry;

  const abilities = parameters.abilities;
  if (Array.isArray(abilities)) {
    for (const entry of abilities) {
      if (!isRecord(entry)) continue;
      const identifiers = [
        toString(entry.id),
        toString(entry.ability),
        toString(entry.abilityId),
        toString(entry.ability_id),
        toString(entry.abilityKey),
        toString(entry.ability_key),
        toString(entry.key),
        toString(entry.name),
        toString(entry.label),
        toString(entry.type),
      ].filter((identifier): identifier is string => Boolean(identifier));
      if (identifiers.includes(abilityId)) {
        return entry;
      }
    }
  }

  return undefined;
};

const deriveAbilityParameters = (
  action: UIActionSpec,
  meta: RuleJsonMeta,
  parameters: RecordLike | undefined,
  logicEffects: LogicStep[],
  abilityIndex: number,
): RecordLike => {
  const abilityId = toString(action.id) ?? `ui_action_${abilityIndex}`;
  const collected: RecordLike = {
    ability: abilityId,
    label: toString(action.label) ?? toString(meta.ruleName) ?? abilityId,
    hint: toString(action.hint) ?? toString(meta.description),
    icon: toString(action.icon),
  };

  const cooldown = toRecord(action.cooldown);
  if (cooldown) {
    const perPiece = toNumber(cooldown.perPiece);
    if (perPiece !== undefined) {
      collected.cooldown = perPiece;
    } else {
      collected.cooldown = cooldown;
    }
  }

  if (typeof action.consumesTurn === "boolean") {
    collected.consumesTurn = action.consumesTurn;
  }

  if (action.maxPerPiece !== undefined) {
    collected.maxPerPiece = action.maxPerPiece;
  }

  if (toString(action.buttonLabel)) {
    collected.buttonLabel = toString(action.buttonLabel);
  }

  if (toRecord(action.targeting)) {
    mergeAbilityHints(collected, { targeting: action.targeting });
  }

  if (toRecord(action.availability)) {
    mergeAbilityHints(collected, { availability: action.availability });
  }

  const normalizedParameters = toRecord(parameters);
  if (normalizedParameters) {
    mergeAbilityHints(collected, normalizedParameters);
    const specific = extractAbilityEntryFromParameters(
      normalizedParameters,
      abilityId,
    );
    if (specific) {
      mergeAbilityHints(collected, specific);
    }
  }

  logicEffects.forEach((effect) => {
    if (!effect) return;
    const when = toString(effect.when);
    if (!when) return;
    if (!when.endsWith(abilityId) && !when.endsWith(action.id)) return;

    mergeAbilityHints(collected, effect as RecordLike);
    const actionSteps = toActionSteps(effect.do);
    actionSteps.forEach((step) =>
      mergeAbilityHints(collected, toRecord(step.params)),
    );
  });

  const abilityIdentifier = normalizeAbilityIdentifier(
    collected.ability,
    abilityId,
  );
  collected.ability = abilityIdentifier;
  collected.uiActionId = abilityIdentifier;

  if (!collected.label) {
    collected.label = toString(meta.ruleName) ?? abilityIdentifier;
  }

  if (!collected.hint) {
    collected.hint = toString(meta.description);
  }

  if (!collected.targetingMode) {
    const targeting = toRecord(action.targeting);
    const mode = targeting ? toString(targeting.mode) : undefined;
    if (mode) {
      collected.targetingMode = mode;
    }
  }

  const metadata: RecordLike = {
    ...(toRecord(collected.metadata) ?? {}),
    availability: toRecord(action.availability),
    targeting: toRecord(action.targeting),
    actionId: abilityIdentifier,
    ruleId: toString(meta.ruleId),
    ruleName: toString(meta.ruleName),
    tags: Array.isArray(meta.tags)
      ? meta.tags.filter(
          (tag): tag is string => typeof tag === "string" && tag.length > 0,
        )
      : undefined,
  } satisfies RecordLike;

  collected.metadata = cleanObject(metadata);

  return cleanObject(collected);
};

const deriveAbilityEffects = (
  uiActions: UIActionSpec[],
  meta: RuleJsonMeta,
  parameters: RecordLike | undefined,
  logicEffects: LogicStep[],
): RuleEffect[] => {
  return uiActions.map(
    (action, index) =>
      ({
        action: "addAbility",
        target: "self",
        parameters: deriveAbilityParameters(
          action,
          meta,
          parameters,
          logicEffects,
          index,
        ),
      }) satisfies RuleEffect,
  );
};

const deriveFallbackEffects = (logicEffects: LogicStep[]): RuleEffect[] => {
  return logicEffects.map(
    (effect, index) =>
      ({
        action: "engineEffect",
        target: "self",
        parameters: cleanObject({
          id: toString(effect.id) ?? `logic_${index}`,
          when: toString(effect.when),
          message: toString(effect.message),
          raw: effect,
        }),
      }) satisfies RuleEffect,
  );
};

const deriveTrigger = (
  abilityEffects: RuleEffect[],
  logicEffects: LogicStep[],
  fallback: ChessRule["trigger"],
): ChessRule["trigger"] => {
  if (abilityEffects.length > 0) {
    return "conditional";
  }

  const whenValues = logicEffects
    .map((effect) => toString(effect.when))
    .filter((when): when is string => Boolean(when));

  if (whenValues.some((when) => when.includes("lifecycle.onCapture"))) {
    return "onCapture";
  }
  if (whenValues.some((when) => when.includes("lifecycle.onMoveCommitted"))) {
    return "onMove";
  }
  if (whenValues.some((when) => when.includes("lifecycle.onTurnStart"))) {
    return "turnBased";
  }
  if (whenValues.some((when) => when.startsWith("ui."))) {
    return "conditional";
  }

  return fallback;
};

const parseRuleJson = (raw: unknown): RuleJSON | undefined => {
  if (!raw) return undefined;

  if (isRecord(raw)) {
    return raw as RuleJSON;
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return isRecord(parsed) ? (parsed as RuleJSON) : undefined;
    } catch (error) {
      console.warn(
        "[ruleJsonToChessRule] Failed to parse rule_json string",
        error,
      );
      return undefined;
    }
  }

  return undefined;
};

export const convertRuleJsonToChessRule = (
  rawRuleJson: unknown,
  options: ConvertOptions = {},
): ChessRule => {
  const ruleJson = parseRuleJson(rawRuleJson);
  if (!ruleJson) {
    throw new Error("Invalid rule_json payload");
  }

  const meta = toRecord(ruleJson.meta) as RuleJsonMeta | undefined;
  const scope = toRecord(ruleJson.scope) as RuleJsonScope | undefined;
  const logic = toRecord(ruleJson.logic) as RuleJsonLogic | undefined;
  const ui = toRecord(ruleJson.ui) as RuleJsonUi | undefined;
  const parameters = toRecord(ruleJson.parameters);

  const row = options.row;

  const ruleId =
    toString(meta?.ruleId) ??
    toString(row?.rule_id) ??
    toString(row?.id) ??
    "generated-rule";

  const ruleName =
    toString(meta?.ruleName) ??
    toString(row?.rule_name) ??
    "Règle personnalisée";

  const description =
    toString(meta?.description) ?? toString(row?.description) ?? "";

  const affectedPieces = scope?.affectedPieces
    ? toStringArray(scope.affectedPieces)
    : Array.isArray(row?.affected_pieces)
      ? row!.affected_pieces.filter(
          (piece): piece is string => typeof piece === "string",
        )
      : [];

  const logicEffects = toLogicSteps(logic?.effects);
  const uiActions = toUiActions(ui?.actions);

  const abilityEffects = deriveAbilityEffects(
    uiActions,
    meta ?? {},
    parameters,
    logicEffects,
  );
  const fallbackEffects =
    abilityEffects.length > 0
      ? abilityEffects
      : deriveFallbackEffects(logicEffects);

  const trigger = deriveTrigger(abilityEffects, logicEffects, "always");

  const tags = meta?.tags
    ? toStringArray(meta.tags)
    : Array.isArray(row?.tags)
      ? row!.tags.filter((tag): tag is string => typeof tag === "string")
      : [];

  const priority =
    (typeof meta?.priority === "number" && Number.isFinite(meta.priority)
      ? meta.priority
      : undefined) ??
    (typeof row?.priority === "number" && Number.isFinite(row.priority)
      ? row.priority
      : undefined) ??
    1;

  const isActive =
    typeof meta?.isActive === "boolean"
      ? meta.isActive
      : row?.status === "active";

  const category = pickCategory(
    meta?.category,
    (row?.category as ChessRule["category"]) || "special",
  );

  const chessRule: ChessRule = {
    id: row?.id,
    ruleId,
    ruleName,
    description,
    category,
    affectedPieces,
    trigger,
    conditions: [],
    effects: fallbackEffects,
    tags,
    priority,
    isActive,
    validationRules: {
      allowedWith: [],
      conflictsWith: [],
      requiredState: null,
    },
    userId: row?.created_by ?? undefined,
    createdAt: row?.created_at ?? undefined,
    updatedAt: row?.updated_at ?? undefined,
  };

  if (ruleJson.assets !== undefined) {
    chessRule.assets = ruleJson.assets as ChessRule["assets"];
  } else if (row?.assets !== undefined) {
    chessRule.assets = row.assets;
  }

  if (uiActions.length > 0) {
    chessRule.uiActions = uiActions as ChessRule["uiActions"];
  }

  if (ruleJson.state !== undefined) {
    chessRule.state = ruleJson.state;
  }

  if (ruleJson.parameters !== undefined) {
    chessRule.parameters = ruleJson.parameters as Record<string, unknown>;
  }

  if (options.attachOriginal !== false) {
    (chessRule as ChessRuleWithOriginal).__originalRuleJson = ruleJson;
  }

  return chessRule;
};

export const tryConvertRuleJsonToChessRule = (
  rawRuleJson: unknown,
  options: ConvertOptions = {},
): ChessRule | undefined => {
  try {
    return convertRuleJsonToChessRule(rawRuleJson, options);
  } catch (error) {
    console.warn("[ruleJsonToChessRule] Conversion failed", error);
    return undefined;
  }
};
