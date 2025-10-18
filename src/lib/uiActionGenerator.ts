import type { UIAction, LogicEffect } from '@/types/ruleSchema';

export function generateUIActions(logic: any): UIAction[] {
  const actions: UIAction[] = [];
  
  if (!logic?.effects) return actions;
  
  logic.effects.forEach((effect: LogicEffect, idx: number) => {
    // Détecter les actions jouables (ui.* ou avec paramètres interactifs)
    const isPlayerAction = effect.when?.includes('ui.') || 
                          effect.when?.includes('player.action') ||
                          effect.id?.includes('action_');
    
    if (isPlayerAction) {
      actions.push({
        id: effect.id || `special_action_${idx}`,
        label: extractLabel(effect),
        hint: extractHint(effect),
        icon: extractIcon(effect),
        targeting: extractTargeting(effect),
        consumesTurn: effect.consumesTurn !== false,
        cooldown: effect.cooldown || { perPiece: 1 },
        availability: {
          requiresSelection: true,
          phase: 'play'
        }
      });
    }
  });
  
  return actions;
}

function extractLabel(effect: LogicEffect): string {
  const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
  
  // Heuristiques basées sur les actions
  if (actions.some((a) => a.action === 'piece.spawn')) return 'Déployer';
  if (actions.some((a) => a.action === 'piece.capture')) return 'Capturer';
  if (actions.some((a) => a.action === 'tile.setTrap')) return 'Poser piège';
  if (actions.some((a) => a.action === 'status.add')) return 'Activer';
  if (actions.some((a) => a.action === 'vfx.play')) return 'Action spéciale';
  
  // Extraction depuis l'ID
  if (effect.id) {
    const parts = effect.id.split('_');
    if (parts.length > 1) {
      return parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
  }
  
  return 'Action spéciale';
}

function extractHint(effect: LogicEffect): string {
  const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
  
  if (actions.some((a) => a.action === 'piece.spawn')) {
    return 'Sélectionnez une case pour déployer';
  }
  if (actions.some((a) => a.action === 'tile.setTrap')) {
    return 'Placez un piège sur une case';
  }
  
  return 'Cliquez pour utiliser';
}

function extractIcon(effect: LogicEffect): string {
  const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
  
  if (actions.some((a) => a.action === 'piece.spawn')) return '➕';
  if (actions.some((a) => a.action === 'piece.capture')) return '⚔️';
  if (actions.some((a) => a.action === 'tile.setTrap')) return '💣';
  if (actions.some((a) => a.action === 'status.add')) return '✨';
  
  return '🎯';
}

function extractTargeting(effect: LogicEffect): UIAction['targeting'] {
  const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
  
  if (actions.some((a) => a.action === 'tile.setTrap' || a.action === 'piece.spawn')) {
    return {
      type: 'tile',
      highlightMoves: true,
    };
  }
  
  if (actions.some((a) => a.action === 'piece.capture')) {
    return {
      type: 'piece',
      highlightMoves: true,
    };
  }
  
  return {
    type: 'none',
  };
}
