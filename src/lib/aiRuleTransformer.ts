import type { RuleJSON } from '@/engine/types';
import type { GeneratedRule } from './supabase/functions';

/**
 * Transforme une règle générée par l'IA vers le format attendu par le moteur.
 * 
 * @param aiRule - Règle au format IA (GeneratedRule)
 * @returns Règle au format moteur (RuleJSON)
 */
export function transformAiRuleToEngineRule(aiRule: GeneratedRule): RuleJSON {
  // Grouper les effets par trigger
  const effectsByTrigger = new Map<string, Array<typeof aiRule.effects[0]>>();
  aiRule.effects.forEach(eff => {
    const trigger = eff.triggers?.[0] || "lifecycle.onMoveCommitted";
    if (!effectsByTrigger.has(trigger)) {
      effectsByTrigger.set(trigger, []);
    }
    effectsByTrigger.get(trigger)!.push(eff);
  });
  
  // Extraire les actions UI depuis les effects avec trigger "ui.*"
  const uiTriggers = Array.from(effectsByTrigger.keys()).filter(t => t.startsWith("ui."));
  const uiActions = uiTriggers.map(trigger => {
    const effects = effectsByTrigger.get(trigger)!;
    // Le premier effet contient les infos UI dans son payload
    const uiDef = effects[0];
    const actionId = trigger.replace("ui.", "");
    
    return {
      id: actionId,
      label: (uiDef.payload?.label as string) || aiRule.ruleName,
      hint: (uiDef.payload?.hint as string) || aiRule.description,
      icon: (uiDef.payload?.icon as string) || aiRule.visuals?.icon || "⚡",
      availability: {
        requiresSelection: true,
        phase: "main" as const,
        cooldownOk: true,
        pieceTypes: (uiDef.payload?.pieceTypes as string[]) || undefined
      },
      targeting: {
        mode: (uiDef.payload?.targetingMode || "tile") as "tile" | "piece" | "none",
        validTilesProvider: (uiDef.payload?.provider as string) || "provider.anyEmptyTile"
      },
      consumesTurn: uiDef.payload?.consumesTurn !== false,
      cooldown: uiDef.payload?.cooldown ? { perPiece: uiDef.payload.cooldown as number } : undefined
    };
  });
  
  // Créer les logic effects
  const logicEffects = Array.from(effectsByTrigger.entries())
    .map(([trigger, effects]) => {
      // Filtrer les effets d'UI definition (premier effet si UI trigger)
      const actionEffects = trigger.startsWith("ui.") ? effects.slice(1) : effects;
      
      // Ne créer un effect que s'il y a des actions
      if (actionEffects.length === 0) return null;
      
      // Si c'est un trigger UI, utiliser les conditions du premier effet
      const conditions = trigger.startsWith("ui.") 
        ? (effects[0].payload?.conditions || []) as string | string[]
        : [];
      
      return {
        id: `effect_${trigger}`,
        when: trigger,
        if: conditions,
        do: actionEffects.map(eff => ({
          action: eff.type,
          params: eff.payload || {}
        })),
        onFail: trigger.startsWith("ui.") ? "blockAction" as const : undefined
      };
    })
    .filter((eff): eff is NonNullable<typeof eff> => eff !== null);
  
  // Extraire affectedPieces depuis les payloads
  const allPieceTypes = new Set<string>();
  aiRule.effects.forEach(eff => {
    if (eff.payload?.pieceTypes && Array.isArray(eff.payload.pieceTypes)) {
      (eff.payload.pieceTypes as string[]).forEach(type => allPieceTypes.add(type));
    }
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
    
    scope: allPieceTypes.size > 0 ? {
      affectedPieces: Array.from(allPieceTypes),
      sides: ["white", "black"]
    } : undefined,
    
    ui: uiActions.length > 0 ? { actions: uiActions } : undefined,
    
    logic: {
      effects: logicEffects
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
