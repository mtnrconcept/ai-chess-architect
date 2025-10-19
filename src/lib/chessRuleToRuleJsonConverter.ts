import { ChessRule, RuleEffect, RuleCondition } from "@/types/chess";
import { RuleJSON, ActionStep, LogicStep } from "@/engine/types";
import { ConditionDescriptor } from "@/engine/registry";

// Registry trigger→event
const TRIGGER_EVENT_MAP: Record<string, string[]> = {
  onMove: ["lifecycle.onMoveCommitted"],
  onCapture: ["lifecycle.onCapture"],
  turnBased: ["lifecycle.onTurnStart"],
  conditional: ["lifecycle.onTurnStart"],
  always: ["lifecycle.onTurnStart", "lifecycle.onMoveCommitted"],
};

// Registry effect→actions
const EFFECT_ACTION_MAP: Record<string, (effect: RuleEffect) => ActionStep[]> =
  {
    deployBomb: (e) => [
      {
        action: "tile.setTrap",
        params: {
          tile: "$ctx.targetTile",
          kind: "bomb",
          metadata: e.parameters,
        },
      },
      {
        action: "cooldown.set",
        params: {
          pieceId: "$ctx.pieceId",
          actionId: "deployBomb",
          turns: e.parameters?.countdown || 3,
        },
      },
    ],
    addAbility: (e) => {
      const abilityKey = e.parameters?.ability ?? "ability";
      return [
        {
          action: "status.add",
          params: {
            pieceId: "$ctx.pieceId",
            key: abilityKey,
            duration: e.parameters?.countdown,
            metadata: {
              ability: abilityKey,
              ...(e.parameters?.metadata ?? {}),
            },
          },
        },
      ];
    },
    modifyMovement: (e) => {
      const abilityKey = e.parameters?.ability ?? "ability";
      return [
        {
          action: "state.set",
          params: {
            path: `movement.${abilityKey}`,
            value: true,
          },
        },
      ];
    },
    extraMove: (e) => [
      { action: "state.set", params: { path: "extraMove", value: true } },
    ],
    capture: (e) => [
      { action: "piece.capture", params: { pieceId: "$ctx.targetPieceId" } },
    ],
  };

export interface ConversionReport {
  success: boolean;
  rule?: RuleJSON;
  ambiguities: string[];
  unmappedEffects: string[];
}

export function convertChessRuleToRuleJSON(
  chessRule: ChessRule,
): ConversionReport {
  const ambiguities: string[] = [];
  const unmappedEffects: string[] = [];

  const ruleJSON: RuleJSON = {
    meta: {
      ruleId: chessRule.ruleId,
      ruleName: chessRule.ruleName,
      description: chessRule.description,
      category: chessRule.category,
      version: "1.0.0",
      isActive: chessRule.isActive !== false,
      tags: chessRule.tags || [],
    },
    scope: {
      affectedPieces: chessRule.affectedPieces,
      sides: ["white", "black"],
    },
    ui: { actions: [] },
    logic: { effects: [] },
    state: {
      namespace: `rules.${chessRule.ruleId}`,
      initial: {},
    },
  };

  // Convertir effects
  chessRule.effects?.forEach((effect, index) => {
    const mapper = EFFECT_ACTION_MAP[effect.action];

    if (!mapper) {
      unmappedEffects.push(effect.action);
      ambiguities.push(`Effet non mappable: ${effect.action}`);
      return;
    }

    const requiresUI = ["deployBomb", "addAbility"].includes(effect.action);

    if (requiresUI) {
      const actionId = `special_${effect.action}_${index}`;

      ruleJSON.ui!.actions!.push({
        id: actionId,
        label: generateLabel(effect),
        icon: generateIcon(effect),
        hint: chessRule.description,
        availability: {
          requiresSelection: true,
          pieceTypes: chessRule.affectedPieces,
          phase: "main",
          cooldownOk: true,
        },
        targeting: {
          mode: "tile",
          validTilesProvider: "provider.neighborsEmpty",
        },
        consumesTurn: true,
        cooldown: { perPiece: effect.parameters?.countdown || 3 },
      });

      ruleJSON.logic!.effects!.push({
        id: `effect_${actionId}`,
        when: `ui.${actionId}`,
        if: convertConditions(chessRule.conditions || []),
        do: mapper(effect),
      });
    } else {
      const events = TRIGGER_EVENT_MAP[chessRule.trigger] || [
        "lifecycle.onTurnStart",
      ];
      events.forEach((event) => {
        ruleJSON.logic!.effects!.push({
          id: `passive_${index}_${event.split(".")[1]}`,
          when: event,
          if: convertConditions(chessRule.conditions || []),
          do: mapper(effect),
        });
      });
    }
  });

  return {
    success: unmappedEffects.length === 0,
    rule: ruleJSON,
    ambiguities,
    unmappedEffects,
  };
}

function generateLabel(effect: RuleEffect): string {
  const labels: Record<string, string> = {
    deployBomb: "Poser bombe",
    addAbility: "Activer pouvoir",
  };
  return labels[effect.action] || "Action spéciale";
}

function generateIcon(effect: RuleEffect): string {
  const icons: Record<string, string> = {
    deployBomb: "💣",
    addAbility: "✨",
  };
  return icons[effect.action] || "🎯";
}

type ConditionMapper = {
  matches: (condition: RuleCondition) => boolean;
  map: (
    condition: RuleCondition,
  ) => ConditionDescriptor | ConditionDescriptor[];
};

const CONDITION_MAPPERS: ConditionMapper[] = [
  {
    matches: (condition) =>
      condition.type === "pieceType" && condition.operator === "equals",
    map: () => "piece.isTypeInScope",
  },
  {
    matches: (condition) =>
      condition.type === "turnNumber" &&
      (condition.operator === "greaterOrEqual" ||
        condition.operator === "greaterThan"),
    map: (condition) => [
      "match.turnNumber.atLeast",
      ensureNumber(condition.value, condition.type) +
        (condition.operator === "greaterThan" ? 1 : 0),
    ],
  },
  {
    matches: (condition) =>
      condition.type === "turnNumber" &&
      (condition.operator === "lessThan" ||
        condition.operator === "lessOrEqual"),
    map: (condition) => [
      "match.turnNumber.lessThan",
      ensureNumber(condition.value, condition.type) +
        (condition.operator === "lessOrEqual" ? 1 : 0),
    ],
  },
  {
    matches: (condition) =>
      condition.type === "hasMoved" && condition.operator === "equals",
    map: (condition) => [
      "piece.hasMoved.equals",
      ensureBoolean(condition.value, condition.type),
    ],
  },
];

function ensureNumber(value: unknown, type: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Unsupported numeric value for condition ${type}`);
  }
  return numeric;
}

function ensureBoolean(value: unknown, type: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "false") {
    return value === "true";
  }
  throw new Error(`Unsupported boolean value for condition ${type}`);
}

function convertConditions(conditions: RuleCondition[]): ConditionDescriptor[] {
  if (!conditions || conditions.length === 0) return [];

  const results: ConditionDescriptor[] = [];
  for (const condition of conditions) {
    const mapper = CONDITION_MAPPERS.find((entry) => entry.matches(condition));
    if (!mapper) {
      throw new Error(
        `No condition mapper available for type "${condition.type}" with operator "${condition.operator}"`,
      );
    }

    const mapped = mapper.map(condition);
    if (Array.isArray(mapped)) {
      results.push(...(mapped as ConditionDescriptor[]));
    } else {
      results.push(mapped as ConditionDescriptor);
    }
  }
  return results;
}
