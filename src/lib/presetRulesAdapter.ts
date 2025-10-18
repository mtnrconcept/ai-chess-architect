import { ChessRule } from '@/types/chess';
import { supabase } from '@/integrations/supabase/client';

/**
 * Convert a RuleJSON from preset_rules table to ChessRule format
 */
export function convertRuleJsonToChessRule(ruleJson: any): ChessRule {
  const meta = ruleJson.meta || {};
  const scope = ruleJson.scope || {};
  const ui = ruleJson.ui || {};
  
  // Extract affected pieces from scope
  const affectedPieces = Array.isArray(scope.affectedPieces) 
    ? scope.affectedPieces 
    : ['all'];

  // Build effects array from ui.actions
  const effects: ChessRule['effects'] = [];
  
  if (ui.actions && Array.isArray(ui.actions)) {
    ui.actions.forEach((action: any) => {
      // Map UI actions to rule effects
      effects.push({
        action: 'addAbility',
        target: 'self',
        parameters: {
          ability: action.id || 'special',
          label: action.label,
          hint: action.hint,
          icon: action.icon,
          cooldown: action.cooldown?.perPiece || 2,
          consumesTurn: action.consumesTurn !== false,
          targetingMode: action.targeting?.mode || 'none',
        },
      });
    });
  }

  const chessRule: ChessRule = {
    ruleId: meta.ruleId || 'unknown',
    ruleName: meta.ruleName || 'Unknown Rule',
    description: meta.description || '',
    category: meta.category || 'special',
    affectedPieces,
    trigger: 'always',
    conditions: [],
    effects,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    priority: 5,
    isActive: meta.isActive !== false,
    validationRules: {
      allowedWith: [],
      conflictsWith: [],
      requiredState: {},
    },
  };

  // Préserver le rule_json complet pour accès ultérieur
  (chessRule as any).__originalRuleJson = ruleJson;
  
  return chessRule;
}

/**
 * Load functional preset rules from database
 */
export async function loadPresetRulesFromDatabase(): Promise<ChessRule[]> {
  try {
    const { data, error } = await supabase
      .from('chess_rules')
      .select('rule_id, rule_name, rule_json')
      .eq('source', 'preset')
      .eq('is_functional', true)
      .eq('status', 'active');

    if (error) {
      console.error('[presetRulesAdapter] Error loading preset rules:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data
      .filter(row => row.rule_json)
      .map(row => convertRuleJsonToChessRule(row.rule_json));
  } catch (error) {
    console.error('[presetRulesAdapter] Failed to load preset rules:', error);
    return [];
  }
}

/**
 * Load a specific preset rule by ID
 */
export async function loadPresetRuleById(ruleId: string): Promise<ChessRule | null> {
  try {
    const { data, error } = await supabase
      .from('chess_rules')
      .select('rule_json')
      .eq('rule_id', ruleId)
      .eq('source', 'preset')
      .eq('is_functional', true)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !data?.rule_json) {
      return null;
    }

    return convertRuleJsonToChessRule(data.rule_json);
  } catch (error) {
    console.error('[presetRulesAdapter] Failed to load rule:', error);
    return null;
  }
}
