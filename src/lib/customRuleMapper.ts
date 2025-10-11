import type { Tables } from '@/integrations/supabase/types';
import type { ChessRule, RuleCondition, RuleEffect } from '@/types/chess';

export type CustomRuleRow = Tables<'custom_chess_rules'>;

const defaultValidation: ChessRule['validationRules'] = {
  allowedWith: [],
  conflictsWith: [],
  requiredState: null,
};

const parseConditions = (conditions: CustomRuleRow['conditions']): RuleCondition[] => {
  if (!conditions) return [];
  if (Array.isArray(conditions)) return conditions as unknown as RuleCondition[];
  return [];
};

const parseEffects = (effects: CustomRuleRow['effects']): RuleEffect[] => {
  if (!effects) return [];
  if (Array.isArray(effects)) return effects as unknown as RuleEffect[];
  return [];
};

const parseTags = (tags: CustomRuleRow['tags']): string[] => {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map(tag => (typeof tag === 'string' ? tag.toLowerCase() : String(tag)))
      .filter(tag => tag.length > 0);
  }
  return [];
};

const parseValidation = (
  validation: CustomRuleRow['validation_rules']
): ChessRule['validationRules'] => {
  if (!validation || typeof validation !== 'object') {
    return defaultValidation;
  }

  const value = validation as Partial<ChessRule['validationRules']>;
  return {
    allowedWith: Array.isArray(value.allowedWith) ? value.allowedWith : [],
    conflictsWith: Array.isArray(value.conflictsWith) ? value.conflictsWith : [],
    requiredState: value.requiredState ?? null,
  };
};

export const mapCustomRuleRowToChessRule = (row: CustomRuleRow): ChessRule => ({
  id: row.id,
  ruleId: row.rule_id,
  ruleName: row.rule_name,
  description: row.description,
  category: row.category as ChessRule['category'],
  affectedPieces: Array.isArray(row.affected_pieces) ? row.affected_pieces : [],
  trigger: row.trigger as ChessRule['trigger'],
  conditions: parseConditions(row.conditions),
  effects: parseEffects(row.effects),
  tags: parseTags(row.tags),
  priority: row.priority ?? 1,
  isActive: row.is_active ?? false,
  validationRules: parseValidation(row.validation_rules),
  userId: row.user_id ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapCustomRuleRowsToChessRules = (
  rows: CustomRuleRow[] | null | undefined
): ChessRule[] => {
  if (!rows) return [];
  return rows.map(mapCustomRuleRowToChessRule);
};
