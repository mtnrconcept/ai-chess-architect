import type { Tables } from "@/integrations/supabase/types";
import type { ChessRule } from "@/types/chess";

type RuleJsonMeta = {
  ruleId?: string;
  ruleName?: string;
  description?: string;
  category?: string;
  tags?: unknown;
  priority?: number;
  isActive?: boolean;
};

type RuleJsonScope = {
  affectedPieces?: string[];
};

type RuleJsonEffect = {
  when?: string;
} & Record<string, unknown>;

type RuleJsonLogic = {
  effects?: RuleJsonEffect[];
};

type RuleJsonUi = {
  actions?: unknown;
};

type RuleJson = {
  meta?: RuleJsonMeta;
  scope?: RuleJsonScope;
  logic?: RuleJsonLogic;
  ui?: RuleJsonUi;
  state?: unknown;
  parameters?: Record<string, unknown>;
  assets?: unknown;
};

type ChessRuleWithOriginal = ChessRule & { __originalRuleJson?: unknown };

const isRuleJson = (value: unknown): value is RuleJson =>
  typeof value === "object" && value !== null;

export type ChessRuleRow = Tables<"chess_rules">;

// Aliases pour compatibilité avec le code existant
export type CustomRuleRow = ChessRuleRow;

export const mapChessRuleRowToChessRule = (row: ChessRuleRow): ChessRule => {
  // Vérifier si la règle utilise le nouveau format rule_json
  if (isRuleJson(row.rule_json)) {
    const ruleJson = row.rule_json;

    const meta: RuleJsonMeta = ruleJson.meta ?? {};
    const scope: RuleJsonScope = ruleJson.scope ?? {};
    const logic: RuleJsonLogic = ruleJson.logic ?? {};
    const ui: RuleJsonUi = ruleJson.ui ?? {};
    const assets = ruleJson.assets ?? row.assets ?? {};

    // Déterminer le trigger depuis le premier effet
    let trigger: ChessRule["trigger"] = "always";
    const firstEffect = Array.isArray(logic.effects)
      ? logic.effects[0]
      : undefined;
    if (firstEffect?.when) {
      const when = firstEffect.when;
      if (when.includes("lifecycle.onMoveCommitted")) trigger = "onMove";
      else if (when.includes("lifecycle.onCapture")) trigger = "onCapture";
      else if (when.includes("lifecycle.onTurnStart")) trigger = "turnBased";
      else if (when.includes("ui.")) trigger = "conditional";
    }

    const tags = Array.isArray(meta.tags)
      ? meta.tags.filter(
          (tag): tag is string => typeof tag === "string" && tag.length > 0,
        )
      : Array.isArray(row.tags)
        ? row.tags.filter(
            (tag): tag is string => typeof tag === "string" && tag.length > 0,
          )
        : [];

    const chessRule: ChessRule = {
      id: row.id,
      ruleId: meta.ruleId || row.rule_id,
      ruleName: meta.ruleName || row.rule_name,
      description: meta.description || row.description,
      category:
        ((meta.category || row.category) as ChessRule["category"]) || "special",
      affectedPieces: scope.affectedPieces || row.affected_pieces || [],
      trigger,
      conditions: [], // Les conditions sont maintenant dans logic.effects[].if
      effects: Array.isArray(logic.effects)
        ? (logic.effects as unknown as ChessRule["effects"])
        : [],
      tags,
      priority: meta.priority || row.priority || 1,
      isActive:
        meta.isActive !== undefined ? meta.isActive : row.status === "active",
      validationRules: {
        allowedWith: [],
        conflictsWith: [],
        requiredState: null,
      },
      userId: row.created_by || undefined,
      createdAt: row.created_at || undefined,
      updatedAt: row.updated_at || undefined,
    };

    chessRule.assets = assets as ChessRule["assets"];
    if (ui.actions !== undefined) {
      chessRule.uiActions = ui.actions as ChessRule["uiActions"];
    }
    if (ruleJson.state !== undefined) {
      chessRule.state = ruleJson.state;
    }
    if (ruleJson.parameters !== undefined) {
      chessRule.parameters = ruleJson.parameters;
    }

    (chessRule as ChessRuleWithOriginal).__originalRuleJson = ruleJson;

    return chessRule;
  }

  // Fallback : ancien format (ne devrait plus arriver avec la table unifiée)
  const tags = Array.isArray(row.tags)
    ? row.tags.filter(
        (tag): tag is string => typeof tag === "string" && tag.length > 0,
      )
    : [];

  const chessRule: ChessRule = {
    id: row.id,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    description: row.description,
    category: (row.category as ChessRule["category"]) || "special",
    affectedPieces: Array.isArray(row.affected_pieces)
      ? row.affected_pieces
      : [],
    trigger: "always",
    conditions: [],
    effects: [],
    tags,
    priority: row.priority || 1,
    isActive: row.status === "active",
    validationRules: {
      allowedWith: [],
      conflictsWith: [],
      requiredState: null,
    },
    userId: row.created_by || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };

  const extractOriginalRuleJson = (): RuleJson | undefined => {
    if (!row.rule_json) return undefined;
    if (isRuleJson(row.rule_json)) return row.rule_json;
    if (typeof row.rule_json === "string") {
      try {
        const parsed = JSON.parse(row.rule_json);
        return isRuleJson(parsed) ? parsed : undefined;
      } catch (error) {
        console.warn(
          "[customRuleMapper] Impossible de parser rule_json legacy",
          error,
        );
        return undefined;
      }
    }
    return undefined;
  };

  const originalRuleJson = extractOriginalRuleJson();

  if (originalRuleJson?.assets !== undefined) {
    chessRule.assets = originalRuleJson.assets as ChessRule["assets"];
  } else if (row.assets !== undefined) {
    chessRule.assets = row.assets;
  }

  if (originalRuleJson?.ui?.actions !== undefined) {
    chessRule.uiActions = originalRuleJson.ui.actions as ChessRule["uiActions"];
  }

  if (originalRuleJson?.state !== undefined) {
    chessRule.state = originalRuleJson.state;
  }

  if (originalRuleJson?.parameters !== undefined) {
    chessRule.parameters = originalRuleJson.parameters;
  }

  if (row.assets !== undefined && chessRule.assets === undefined) {
    chessRule.assets = row.assets;
  }

  if (row.rule_json !== undefined) {
    (chessRule as ChessRuleWithOriginal).__originalRuleJson =
      originalRuleJson ?? row.rule_json;
  }

  return chessRule;
};

export const mapChessRuleRowsToChessRules = (
  rows: ChessRuleRow[] | null | undefined,
): ChessRule[] => {
  if (!rows) return [];
  return rows.map(mapChessRuleRowToChessRule);
};

// Alias pour compatibilité
export const mapCustomRuleRowToChessRule = mapChessRuleRowToChessRule;
export const mapCustomRuleRowsToChessRules = mapChessRuleRowsToChessRules;
