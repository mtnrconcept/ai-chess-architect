import type { RuleJSON } from '@/engine/types';
import type { GeneratedRule } from './supabase/functions';

/**
 * Transforme une règle générée par l'IA vers le format attendu par le moteur.
 * 
 * @param aiRule - Règle au format IA (GeneratedRule)
 * @returns Règle au format moteur (RuleJSON)
 */
export function transformAiRuleToEngineRule(aiRule: GeneratedRule): RuleJSON {
  return {
    meta: {
      ruleId: aiRule.ruleId,
      ruleName: aiRule.ruleName,
      description: aiRule.description,
      category: "ai-generated",
      isActive: true,
      version: "1.0.0"
    },
    
    // Convertir effects[] → logic.effects[]
    logic: {
      effects: aiRule.effects.map((eff, idx) => ({
        id: `effect_${idx}`,
        when: eff.triggers?.[0] || "lifecycle.onMoveCommitted",
        do: {
          action: eff.type,
          params: eff.payload || {}
        }
      }))
    },
    
    // Convertir engineAdapters → handlers
    handlers: Object.entries(aiRule.engineAdapters).reduce((acc, [hook, handler]) => {
      if (handler) {
        acc[`lifecycle.${hook}`] = handler;
      }
      return acc;
    }, {} as Record<string, string>),
    
    // Mapping visuals
    assets: aiRule.visuals ? {
      icon: aiRule.visuals.icon,
      color: aiRule.visuals.color,
      animations: aiRule.visuals.animations
    } : undefined
  };
}

/**
 * Valide qu'une règle générée par l'IA contient des actions connues.
 * 
 * @param aiRule - Règle à valider
 * @returns Liste des actions inconnues (vide si tout est valide)
 */
export function validateAiRuleActions(aiRule: GeneratedRule): string[] {
  const knownActions = [
    "placeMine", 
    "explodeMine", 
    "teleport", 
    "freezePiece",
    "promotePawn",
    "swapPieces",
    "clonePiece",
    "removePiece"
  ];
  
  return aiRule.effects
    .map(eff => eff.type)
    .filter(action => !knownActions.includes(action));
}
