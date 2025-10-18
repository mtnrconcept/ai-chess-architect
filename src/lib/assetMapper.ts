export const CATEGORY_ASSETS: Record<string, { color: string; icon: string }> = {
  'vip': { color: '#9C27B0', icon: '🎭' },
  'capture': { color: '#76E0FF', icon: '⚔️' },
  'defense': { color: '#4CAF50', icon: '🛡️' },
  'special': { color: '#FF5722', icon: '✨' },
  'movement': { color: '#2196F3', icon: '🏃' },
  'behavior': { color: '#FFC107', icon: '🧠' },
  'terrain': { color: '#795548', icon: '🗺️' },
  'upgrade': { color: '#00BCD4', icon: '⬆️' },
};

export function enrichRuleAssets(rule: any): any {
  const category = rule.category || rule.rule_json?.meta?.category || 'special';
  const defaultAssets = CATEGORY_ASSETS[category] || CATEGORY_ASSETS['special'];
  
  return {
    ...rule,
    assets: {
      ...defaultAssets,
      ...(rule.assets || {}),
    },
    rule_json: {
      ...rule.rule_json,
      assets: {
        ...defaultAssets,
        ...(rule.rule_json?.assets || {}),
      }
    }
  };
}

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
  };
  
  // Détection de mots-clés pour affiner
  const lowerDesc = description.toLowerCase();
  if (lowerDesc.includes('explos') || lowerDesc.includes('mine')) {
    return { onTrigger: 'explosion', onSuccess: 'explosion' };
  }
  if (lowerDesc.includes('téléport') || lowerDesc.includes('portal')) {
    return { onTrigger: 'special-ability', onSuccess: 'move' };
  }
  
  return sfxMap[category] || { onTrigger: 'move' };
}
