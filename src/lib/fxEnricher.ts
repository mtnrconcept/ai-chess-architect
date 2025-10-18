import { lookupFxIntents } from '@/fx/lexicon';
import type { RuleJSON } from '@/types/ruleSchema';

export function enrichEffectsWithFx(ruleJson: RuleJSON, description: string): RuleJSON {
  const fxIntents = lookupFxIntents(description);
  
  if (!ruleJson.logic?.effects || fxIntents.length === 0) {
    return ruleJson;
  }
  
  return {
    ...ruleJson,
    logic: {
      ...ruleJson.logic,
      effects: ruleJson.logic.effects.map((effect) => {
        const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
        const hasVfx = actions.some((a) => a.action === 'vfx.play');
        const hasAudio = actions.some((a) => a.action === 'audio.play');
        
        const enrichedActions = [...actions];
        
        // Ajouter vfx.play si absent
        if (!hasVfx && fxIntents.length > 0) {
          enrichedActions.push({
            action: 'vfx.play',
            params: {
              sprite: fxIntents[0].intent.replace(/\./g, '_'),
              tile: '${targetTile}',
              fxIntents: fxIntents
            }
          });
        }
        
        // Ajouter audio.play si absent et SFX disponibles
        if (!hasAudio && ruleJson.assets?.sfx?.onTrigger) {
          enrichedActions.push({
            action: 'audio.play',
            params: {
              id: ruleJson.assets.sfx.onTrigger
            }
          });
        }
        
        return {
          ...effect,
          do: enrichedActions
        };
      })
    }
  };
}

export function generateNamespace(ruleId: string, category: string): string {
  const cleanId = ruleId.replace(/[^a-z0-9]/gi, '_');
  return `rules.${category}.${cleanId}`;
}

export function generateInitialState(effects: any[]): Record<string, any> {
  const state: Record<string, any> = {};
  
  // Détecter si besoin d'une phase
  if (effects.some(e => e.when?.includes('lifecycle.onGameStart'))) {
    state.phase = 'setup';
  }
  
  // Détecter compteurs depuis state.inc ou state.set
  effects.forEach(e => {
    const actions = Array.isArray(e.do) ? e.do : [e.do];
    actions.forEach((action: any) => {
      if (action.action === 'state.inc' || action.action === 'state.set') {
        const path = action.params?.path;
        if (path) {
          const key = path.split('.').pop();
          if (key && !state[key]) {
            state[key] = action.action === 'state.inc' ? 0 : action.params?.value || null;
          }
        }
      }
    });
  });
  
  return state;
}
