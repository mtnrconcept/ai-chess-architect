import type { RuleJSON } from '@/engine/types';

/**
 * Transforme une règle générée par l'IA vers le format attendu par le moteur.
 * Si l'IA génère déjà du RuleJSON valide, on le retourne directement.
 * Sinon, on applique une transformation minimale (fallback).
 * 
 * @param aiRule - Règle au format IA
 * @returns Règle au format moteur (RuleJSON)
 */
export function transformAiRuleToEngineRule(aiRule: any): RuleJSON {
  // Si l'IA a généré directement du RuleJSON, validation et retour direct
  if (aiRule.meta && aiRule.logic) {
    return aiRule as RuleJSON;
  }
  
  // Fallback minimal si format ancien
  return {
    meta: {
      ruleId: aiRule.ruleId || `rule_${Date.now()}`,
      ruleName: aiRule.ruleName || "Règle sans nom",
      description: aiRule.description || "",
      category: "ai-generated",
      version: "1.0.0",
      isActive: true,
      tags: aiRule.tags || []
    },
    scope: {
      affectedPieces: aiRule.affectedPieces || [],
      sides: ["white", "black"]
    },
    logic: {
      effects: aiRule.effects || []
    },
    state: {
      namespace: `rules.${aiRule.ruleId || Date.now()}`,
      initial: {}
    },
    parameters: aiRule.parameters || {},
    assets: aiRule.visuals || aiRule.assets
  };
}

/**
 * Valide qu'une règle RuleJSON contient des actions connues.
 * 
 * @param ruleJSON - Règle à valider
 * @returns Liste des actions inconnues (vide si tout est valide)
 */
export function validateRuleJSONActions(ruleJSON: RuleJSON): string[] {
  const knownActions = [
    "tile.setTrap", 
    "tile.resolveTrap", 
    "tile.clearTrap",
    "piece.spawn", 
    "piece.capture",
    "piece.move",
    "piece.duplicate",
    "status.add",
    "status.remove",
    "vfx.play",
    "audio.play",
    "ui.toast",
    "cooldown.set",
    "turn.end",
    "state.set",
    "state.inc",
    "state.delete"
  ];
  
  const unknownActions: string[] = [];
  
  ruleJSON.logic.effects.forEach(effect => {
    const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
    actions.forEach(action => {
      if (!knownActions.includes(action.action)) {
        unknownActions.push(action.action);
      }
    });
  });
  
  return [...new Set(unknownActions)];
}
