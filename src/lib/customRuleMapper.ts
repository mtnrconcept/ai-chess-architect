import type { Tables } from '@/integrations/supabase/types';
import type { ChessRule } from '@/types/chess';
import { analyzeRuleLogic } from '@/lib/ruleValidation';

export type ChessRuleRow = Tables<'chess_rules'>;

// Aliases pour compatibilité avec le code existant
export type CustomRuleRow = ChessRuleRow;

export const mapChessRuleRowToChessRule = (row: ChessRuleRow): ChessRule => {
  // La nouvelle table stocke déjà le rule_json au bon format
  const { rule } = analyzeRuleLogic(row.rule_json);

  return {
    ...rule,
    id: row.id ?? rule.id,
    userId: row.created_by ?? rule.userId,
    createdAt: row.created_at ?? rule.createdAt,
    updatedAt: row.updated_at ?? rule.updatedAt,
  };
};

export const mapChessRuleRowsToChessRules = (
  rows: ChessRuleRow[] | null | undefined
): ChessRule[] => {
  if (!rows) return [];
  return rows.map(mapChessRuleRowToChessRule);
};

// Alias pour compatibilité
export const mapCustomRuleRowToChessRule = mapChessRuleRowToChessRule;
export const mapCustomRuleRowsToChessRules = mapChessRuleRowsToChessRules;
