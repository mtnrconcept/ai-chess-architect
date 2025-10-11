import type { Tables } from '@/integrations/supabase/types';
import type { ChessRule } from '@/types/chess';
import { analyzeRuleLogic } from '@/lib/ruleValidation';

export type CustomRuleRow = Tables<'custom_chess_rules'>;
export const mapCustomRuleRowToChessRule = (row: CustomRuleRow): ChessRule => {
  const { rule } = analyzeRuleLogic(row);

  return {
    ...rule,
    id: row.id ?? rule.id,
    userId: row.user_id ?? rule.userId,
    createdAt: row.created_at ?? rule.createdAt,
    updatedAt: row.updated_at ?? rule.updatedAt,
  };
};

export const mapCustomRuleRowsToChessRules = (
  rows: CustomRuleRow[] | null | undefined
): ChessRule[] => {
  if (!rows) return [];
  return rows.map(mapCustomRuleRowToChessRule);
};
