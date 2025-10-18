/**
 * Dry-run simplifié pour validation structurelle des règles
 * Version légère pour Phase 2 (validation sans exécution moteur complet)
 */

export interface DryRunResult {
  success: boolean;
  errors: string[];
  executedActions: string[];
  warnings: string[];
}

/**
 * Effectue une validation structurelle de la règle
 * Ne simule pas le moteur complet, mais vérifie la cohérence logique
 */
const KNOWN_ACTIONS = new Set([
  "tile.setTrap", "tile.clearTrap", "tile.resolveTrap",
  "piece.spawn", "piece.capture", "piece.move", "piece.duplicate",
  "status.add", "status.remove", "status.tickAll",
  "vfx.play", "audio.play", "ui.toast",
  "cooldown.set", "turn.end",
  "state.set", "state.inc", "state.delete",
  "board.areaEffect",
  "decal.set", "decal.clear",
  "area.forEachTile", "composite",
  "intent.cancel"
]);

export async function dryRunRule(rule: any): Promise<DryRunResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const executedActions: string[] = [];

  try {
    // Vérification 1: Au moins un effet défini
    if (!rule.logic?.effects || rule.logic.effects.length === 0) {
      errors.push("Aucun effet défini dans logic.effects");
      return { success: false, errors, executedActions, warnings };
    }

    // Vérification 2: Chaque effet a les champs requis
    rule.logic.effects.forEach((effect: any, index: number) => {
      if (!effect.id) {
        errors.push(`Effet ${index}: champ 'id' manquant`);
      }
      
      if (!effect.when) {
        errors.push(`Effet ${index}: champ 'when' manquant`);
      } else if (!effect.when.match(/^(ui\.|lifecycle\.|status\.)/)) {
        warnings.push(`Effet ${index}: 'when' ne correspond pas au pattern attendu (${effect.when})`);
      }
      
      if (!effect.do) {
        errors.push(`Effet ${index}: champ 'do' manquant`);
      } else {
        // Vérifier la structure des actions
        const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
        actions.forEach((action: any, actionIndex: number) => {
          if (!action.action) {
            errors.push(`Effet ${index}, action ${actionIndex}: champ 'action' manquant`);
          } else if (!action.action.includes('.')) {
            errors.push(`Effet ${index}, action ${actionIndex}: format d'action invalide (${action.action}), attendu 'namespace.method'`);
          } else if (!KNOWN_ACTIONS.has(action.action)) {
            errors.push(`Effet ${index}, action ${actionIndex}: action non implémentée '${action.action}'`);
          } else {
            executedActions.push(action.action);
          }
        });
      }
      
      // Vérifier aussi les actions dans 'else' si présentes
      if (effect.else) {
        const elseActions = Array.isArray(effect.else) ? effect.else : [effect.else];
        elseActions.forEach((action: any, actionIndex: number) => {
          if (action.action && !KNOWN_ACTIONS.has(action.action)) {
            errors.push(`Effet ${index}, else action ${actionIndex}: action non implémentée '${action.action}'`);
          }
        });
      }
    });

    // Vérification 3: Si des actions UI existent, vérifier leur structure
    if (rule.ui?.actions) {
      rule.ui.actions.forEach((action: any, index: number) => {
        if (!action.id) {
          errors.push(`Action UI ${index}: champ 'id' manquant`);
        } else if (!action.id.startsWith('special_')) {
          warnings.push(`Action UI ${index}: 'id' ne commence pas par 'special_' (${action.id})`);
        }
        
        if (!action.label) {
          errors.push(`Action UI ${index}: champ 'label' manquant`);
        }
      });
    }

    // Vérification 4: Cohérence entre UI actions et logic effects
    if (rule.ui?.actions && rule.ui.actions.length > 0) {
      const uiActionIds = new Set(rule.ui.actions.map((a: any) => a.id));
      const hasMatchingEffects = rule.logic.effects.some((effect: any) => 
        effect.when && uiActionIds.has(effect.when.replace('ui.', ''))
      );
      
      if (!hasMatchingEffects) {
        warnings.push("Des actions UI sont définies mais aucun effet ne les déclenche");
      }
    }

    return {
      success: errors.length === 0,
      errors,
      executedActions,
      warnings
    };
  } catch (e: any) {
    return {
      success: false,
      errors: [`Erreur lors du dry-run: ${e.message}`],
      executedActions: [],
      warnings: []
    };
  }
}
