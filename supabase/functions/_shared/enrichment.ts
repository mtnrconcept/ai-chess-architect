// Enrichissement automatique des règles générées

export const CATEGORY_ASSETS: Record<string, { color: string; icon: string }> = {
  'vip': { color: '#9C27B0', icon: '🎭' },
  'capture': { color: '#76E0FF', icon: '⚔️' },
  'defense': { color: '#4CAF50', icon: '🛡️' },
  'special': { color: '#FF5722', icon: '✨' },
  'movement': { color: '#2196F3', icon: '🏃' },
  'behavior': { color: '#FFC107', icon: '🧠' },
  'terrain': { color: '#795548', icon: '🗺️' },
  'upgrade': { color: '#00BCD4', icon: '⬆️' },
  'ai-generated': { color: '#FF5722', icon: '✨' },
};

export function generateSFX(category: string, description: string): any {
  const sfxMap: Record<string, any> = {
    'capture': { onTrigger: 'explosion', onSuccess: 'capture' },
    'defense': { onTrigger: 'shield', onSuccess: 'check' },
    'movement': { onTrigger: 'move', onSuccess: 'move' },
    'special': { onTrigger: 'special-ability', onSuccess: 'capture' },
    'vip': { onTrigger: 'check', onSuccess: 'capture' },
    'terrain': { onTrigger: 'move', onSuccess: 'explosion' },
    'behavior': { onTrigger: 'move', onSuccess: 'check' },
    'upgrade': { onTrigger: 'special-ability', onSuccess: 'capture' },
    'ai-generated': { onTrigger: 'special-ability', onSuccess: 'capture' },
  };
  
  // Détection de mots-clés pour affiner
  const lowerDesc = description.toLowerCase();
  if (lowerDesc.includes('explos') || lowerDesc.includes('mine')) {
    return { onTrigger: 'explosion', onSuccess: 'explosion' };
  }
  if (lowerDesc.includes('téléport') || lowerDesc.includes('portal')) {
    return { onTrigger: 'special-ability', onSuccess: 'move' };
  }
  if (lowerDesc.includes('gel') || lowerDesc.includes('freeze')) {
    return { onTrigger: 'check', onSuccess: 'check' };
  }
  
  return sfxMap[category] || { onTrigger: 'move' };
}

export function generateUIActions(logic: any): any[] {
  const actions: any[] = [];
  
  if (!logic?.effects) return actions;
  
  logic.effects.forEach((effect: any, idx: number) => {
    // Détecter les actions jouables (ui.* ou avec paramètres interactifs)
    const isPlayerAction = effect.when?.includes('ui.') || 
                          effect.when?.includes('player.action') ||
                          effect.id?.includes('action_');
    
    if (isPlayerAction) {
      const effectActions = Array.isArray(effect.do) ? effect.do : [effect.do];
      
      // Détecter si on utilise board.areaEffect (ciblage de zone/pièces)
      const usesAreaEffect = effectActions.some((a: any) => 
        a.action === 'board.areaEffect'
      );
      
      // Phase 4: Détecter le mode de ciblage depuis les conditions
      const conditions = Array.isArray(effect.if) ? effect.if : [];
      const targetsPieces = conditions.some((cond: any) => 
        typeof cond === 'string' && 
        (cond.includes('target.isEnemy') || 
         cond.includes('ctx.hasTargetPiece') ||
         cond.includes('target.hasStatus'))
      );
      
      // Détecter si on cible des cases (ctx.hasTargetTile)
      const requiresTargetTile = conditions.some((cond: any) =>
        typeof cond === 'string' && cond.includes('ctx.hasTargetTile')
      );
      
      // Mode de ciblage : piece si areaEffect (sauf si explicitement ctx.hasTargetTile) ou conditions pièce, sinon tile
      const targetingMode = (usesAreaEffect && !requiresTargetTile) || targetsPieces ? 'piece' : extractTargeting(effectActions).type;
      
      actions.push({
        id: effect.id || `special_action_${idx}`,
        label: extractLabel(effect, effectActions),
        hint: extractHint(effectActions),
        icon: extractIcon(effectActions),
        targeting: {
          mode: targetingMode,
          highlightMoves: true,
          validTilesProvider: targetingMode === 'piece' ? 'provider.enemiesInLineOfSight' : undefined
        },
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

function extractLabel(effect: any, actions: any[]): string {
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
      return parts.slice(1).map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
  }
  
  return 'Action spéciale';
}

function extractHint(actions: any[]): string {
  if (actions.some((a) => a.action === 'piece.spawn')) {
    return 'Sélectionnez une case pour déployer';
  }
  if (actions.some((a) => a.action === 'tile.setTrap')) {
    return 'Placez un piège sur une case';
  }
  
  return 'Cliquez pour utiliser';
}

function extractIcon(actions: any[]): string {
  if (actions.some((a) => a.action === 'piece.spawn')) return '➕';
  if (actions.some((a) => a.action === 'piece.capture')) return '⚔️';
  if (actions.some((a) => a.action === 'tile.setTrap')) return '💣';
  if (actions.some((a) => a.action === 'status.add')) return '✨';
  
  return '🎯';
}

function extractTargeting(actions: any[]): any {
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

// FX Lexicon simplifié pour Deno
const FX_KEYWORDS: Record<string, any[]> = {
  'mine': [{ intent: 'object.spawn', kind: 'mine', style: { holo: true, glow: '#76E0FF' } }],
  'piège': [{ intent: 'object.spawn', kind: 'mine', style: { holo: true, glow: '#76E0FF' } }],
  'explosion': [{ intent: 'combat.explosion', power: 'medium', style: { sparks: true } }],
  'téléport': [{ intent: 'space.warp', mode: 'blink', style: { color: '#76E0FF' } }],
  'gel': [{ intent: 'combat.freeze', power: 'small', style: { color: '#76E0FF' } }],
  'freeze': [{ intent: 'combat.freeze', power: 'small', style: { color: '#76E0FF' } }],
  'feu': [{ intent: 'combat.burn', power: 'medium', style: { color: '#FF4500' } }],
  'bouclier': [{ intent: 'viz.highlight', style: { color: '#4CAF50', ring: true } }],
  'catapult': [{ intent: 'piece.trail', color: '#FF5722', duration: 0.8 }],
  'invisible': [{ intent: 'viz.hologram', style: { color: '#76E0FF', holo: true } }],
  'secret': [{ intent: 'viz.hologram', style: { color: '#9C27B0', holo: true } }],
};

export function lookupFxIntents(description: string): any[] {
  const lower = description.toLowerCase();
  const intents: any[] = [];
  
  for (const [keyword, fxIntents] of Object.entries(FX_KEYWORDS)) {
    if (lower.includes(keyword)) {
      intents.push(...fxIntents);
    }
  }
  
  return intents;
}

export function enrichEffectsWithFx(rule: any, description: string): any {
  const fxIntents = lookupFxIntents(description);
  
  if (!rule.logic?.effects || fxIntents.length === 0) {
    return rule;
  }
  
  return {
    ...rule,
    logic: {
      ...rule.logic,
      effects: rule.logic.effects.map((effect: any) => {
        const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
        const hasVfx = actions.some((a: any) => a.action === 'vfx.play');
        const hasAudio = actions.some((a: any) => a.action === 'audio.play');
        
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
        if (!hasAudio && rule.assets?.sfx?.onTrigger) {
          enrichedActions.push({
            action: 'audio.play',
            params: {
              id: rule.assets.sfx.onTrigger
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
  if (effects.some((e: any) => e.when?.includes('lifecycle.onGameStart'))) {
    state.phase = 'setup';
  }
  
  // Détecter compteurs depuis state.inc ou state.set
  effects.forEach((e: any) => {
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

export function enrichRule(rule: any, prompt: string, ruleId: string): any {
  const category = rule.meta?.category || 'ai-generated';
  const description = rule.meta?.description || prompt;
  
  // 1. Enrichir assets
  const defaultAssets = CATEGORY_ASSETS[category] || CATEGORY_ASSETS['special'];
  const enrichedAssets = {
    ...defaultAssets,
    sfx: generateSFX(category, description),
    ...(rule.assets || {})
  };
  
  // 2. Générer UI actions si absentes ou vides
  let uiActions = rule.ui?.actions || [];
  if (uiActions.length === 0 && rule.logic?.effects) {
    uiActions = generateUIActions(rule.logic);
  }
  
  // 3. Générer namespace et state
  const namespace = generateNamespace(ruleId, category);
  const initialState = generateInitialState(rule.logic?.effects || []);
  
  // 4. Construire la règle enrichie
  let enrichedRule = {
    ...rule,
    assets: enrichedAssets,
    ui: {
      ...(rule.ui || {}),
      actions: uiActions
    },
    state: {
      namespace,
      initial: initialState,
      ...(rule.state || {})
    }
  };
  
  // 5. Enrichir avec FX intents
  enrichedRule = enrichEffectsWithFx(enrichedRule, description);
  
  return enrichedRule;
}
