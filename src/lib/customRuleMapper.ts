import type { Tables } from '@/integrations/supabase/types';
import type { ChessRule } from '@/types/chess';

export type ChessRuleRow = Tables<'chess_rules'>;

// Aliases pour compatibilité avec le code existant
export type CustomRuleRow = ChessRuleRow;

export const mapChessRuleRowToChessRule = (row: ChessRuleRow): ChessRule => {
  // Vérifier si la règle utilise le nouveau format rule_json
  if (row.rule_json && typeof row.rule_json === 'object') {
    const ruleJson = row.rule_json as any;
    
    const meta = ruleJson.meta || {};
    const scope = ruleJson.scope || {};
    const logic = ruleJson.logic || {};
    const ui = ruleJson.ui || {};
    const assets = ruleJson.assets || row.assets || {};
    
    // Déterminer le trigger depuis le premier effet
    let trigger: ChessRule['trigger'] = 'always';
    const firstEffect = logic.effects?.[0];
    if (firstEffect?.when) {
      const when = firstEffect.when;
      if (when.includes('lifecycle.onMoveCommitted')) trigger = 'onMove';
      else if (when.includes('lifecycle.onCapture')) trigger = 'onCapture';
      else if (when.includes('lifecycle.onTurnStart')) trigger = 'turnBased';
      else if (when.includes('ui.')) trigger = 'conditional';
    }

    const tags = Array.isArray(meta.tags) 
      ? meta.tags.filter((tag: any): tag is string => typeof tag === 'string' && tag.length > 0)
      : Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
      : [];

    return {
      id: row.id,
      ruleId: meta.ruleId || row.rule_id,
      ruleName: meta.ruleName || row.rule_name,
      description: meta.description || row.description,
      category: (meta.category || row.category) as ChessRule['category'] || 'special',
      affectedPieces: scope.affectedPieces || row.affected_pieces || [],
      trigger,
      conditions: [], // Les conditions sont maintenant dans logic.effects[].if
      effects: logic.effects || [],
      tags,
      priority: meta.priority || row.priority || 1,
      isActive: meta.isActive !== undefined ? meta.isActive : row.status === 'active',
      validationRules: {
        allowedWith: [],
        conflictsWith: [],
        requiredState: null,
      },
      userId: row.created_by || undefined,
      createdAt: row.created_at || undefined,
      updatedAt: row.updated_at || undefined,
      // Données supplémentaires pour l'affichage enrichi
      assets,
      uiActions: ui.actions,
      state: ruleJson.state,
      parameters: ruleJson.parameters,
    };
  }

  // Fallback : ancien format (ne devrait plus arriver avec la table unifiée)
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
    : [];

  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    description: row.description,
    category: (row.category as ChessRule['category']) || 'special',
    affectedPieces: Array.isArray(row.affected_pieces) ? row.affected_pieces : [],
    trigger: 'always',
    conditions: [],
    effects: [],
    tags,
    priority: row.priority || 1,
    isActive: row.status === 'active',
    validationRules: {
      allowedWith: [],
      conflictsWith: [],
      requiredState: null,
    },
    userId: row.created_by || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
    assets: row.assets,
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
