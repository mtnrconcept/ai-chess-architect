import type { Tables } from "@/integrations/supabase/types";
import type { ChessRule } from "@/types/chess";
import { convertRuleJsonToChessRule } from "@/lib/ruleJsonToChessRule";

export type ChessRuleRow = Tables<"chess_rules">;

// Aliases pour compatibilité avec le code existant
export type CustomRuleRow = ChessRuleRow;

const buildLegacyChessRule = (row: ChessRuleRow): ChessRule => {
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

  if (row.assets !== undefined) {
    chessRule.assets = row.assets;
  }

  if (row.rule_json !== undefined) {
    try {
      const parsed =
        typeof row.rule_json === "string"
          ? JSON.parse(row.rule_json)
          : row.rule_json;
      if (parsed && typeof parsed === "object") {
        const json = parsed as Record<string, unknown>;
        if (json.assets !== undefined && chessRule.assets === undefined) {
          chessRule.assets = json.assets as ChessRule["assets"];
        }
        if (json.ui && typeof json.ui === "object") {
          const uiActions = (json.ui as { actions?: unknown }).actions;
          if (uiActions !== undefined) {
            chessRule.uiActions = uiActions as ChessRule["uiActions"];
          }
        }
        if (json.state !== undefined) {
          chessRule.state = json.state;
        }
        if (json.parameters !== undefined) {
          chessRule.parameters = json.parameters as Record<string, unknown>;
        }
      }
    } catch (error) {
      console.warn(
        "[customRuleMapper] Impossible de parser rule_json legacy",
        error,
      );
    }
  }

  return chessRule;
};

export const mapChessRuleRowToChessRule = (row: ChessRuleRow): ChessRule => {
  if (row.rule_json !== null && row.rule_json !== undefined) {
    try {
      return convertRuleJsonToChessRule(row.rule_json, { row });
    } catch (error) {
      console.warn(
        "[customRuleMapper] Conversion rule_json → ChessRule échouée, fallback legacy",
        error,
      );
    }
  }

  return buildLegacyChessRule(row);
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
