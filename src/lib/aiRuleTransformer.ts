import type { RuleJSON } from '@/engine/types';
import type { GeneratedRule } from './supabase/functions';

/**
 * Transforme une règle générée par l'IA vers le format attendu par le moteur.
 * 
 * @param aiRule - Règle au format IA (GeneratedRule)
 * @returns Règle au format moteur (RuleJSON)
 */
export function transformAiRuleToEngineRule(aiRule: GeneratedRule): RuleJSON {
  // Extraire les actions UI depuis les effects avec trigger "ui.*"
  const uiEffects = aiRule.effects.filter(eff => 
    eff.triggers?.some(t => t.startsWith("ui."))
  );
  
  const uiActions = uiEffects.map(eff => {
    const actionId = eff.triggers?.find(t => t.startsWith("ui."))?.replace("ui.", "") || "custom_action";
    
    return {
      id: actionId,
      label: (eff.payload?.label as string) || aiRule.ruleName,
      hint: (eff.payload?.hint as string) || aiRule.description,
      icon: aiRule.visuals?.icon || "⚡",
      availability: {
        requiresSelection: true,
        phase: "main" as const,
        cooldownOk: true
      },
      targeting: {
        mode: (eff.payload?.targetingMode || "tile") as "tile" | "piece" | "none",
        validTilesProvider: (eff.payload?.provider as string) || "provider.anyEmptyTile"
      },
      consumesTurn: eff.payload?.consumesTurn !== false,
      cooldown: eff.payload?.cooldown ? { perPiece: eff.payload.cooldown as number } : undefined
    };
  });
  
  return {
    meta: {
      ruleId: aiRule.ruleId,
      ruleName: aiRule.ruleName,
      description: aiRule.description,
      category: "ai-generated",
      isActive: true,
      version: "1.0.0"
    },
    
    ui: uiActions.length > 0 ? { actions: uiActions } : undefined,
    
    logic: {
      effects: aiRule.effects.map((eff, idx) => {
        const trigger = eff.triggers?.[0] || "lifecycle.onMoveCommitted";
        const conditions = (eff.payload?.conditions || []) as string | string[];
        
        return {
          id: `effect_${idx}`,
          when: trigger,
          if: conditions,
          do: {
            action: eff.type,
            params: eff.payload || {}
          }
        };
      })
    },
    
    state: {
      namespace: `rules.${aiRule.ruleId}`,
      initial: {}
    },
    
    parameters: aiRule.visuals ? {
      icon: aiRule.visuals.icon,
      color: aiRule.visuals.color
    } : {},
    
    assets: aiRule.visuals
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
