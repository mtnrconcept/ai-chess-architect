import { describe, it, expect } from 'vitest';
import { convertChessRuleToRuleJSON } from './chessRuleToRuleJsonConverter';
import { ChessRule } from '@/types/chess';

describe('ChessRule → RuleJSON Converter', () => {
  it('devrait convertir une règle avec deployBomb', () => {
    const chessRule: ChessRule = {
      ruleId: 'test_bomb',
      ruleName: 'Test Bomb',
      description: 'Test deployment',
      category: 'special',
      affectedPieces: ['pawn'],
      trigger: 'conditional',
      conditions: [],
      effects: [{
        action: 'deployBomb',
        target: 'self',
        parameters: { radius: 1, countdown: 3 }
      }],
      tags: ['test'],
      priority: 1,
      isActive: true,
      validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
    };

    const result = convertChessRuleToRuleJSON(chessRule);
    
    expect(result.success).toBe(true);
    expect(result.rule?.ui?.actions).toHaveLength(1);
    expect(result.rule?.ui?.actions?.[0].id).toBe('special_deployBomb_0');
    expect(result.rule?.ui?.actions?.[0].icon).toBe('💣');
  });

  it('devrait convertir une règle avec addAbility', () => {
    const chessRule: ChessRule = {
      ruleId: 'test_ability',
      ruleName: 'Test Ability',
      description: 'Test ability',
      category: 'special',
      affectedPieces: ['knight'],
      trigger: 'conditional',
      conditions: [],
      effects: [{
        action: 'addAbility',
        target: 'self',
        parameters: { ability: 'fly', countdown: 2 }
      }],
      tags: ['test'],
      priority: 1,
      isActive: true,
      validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
    };

    const result = convertChessRuleToRuleJSON(chessRule);
    
    expect(result.success).toBe(true);
    expect(result.rule?.ui?.actions).toHaveLength(1);
    expect(result.rule?.ui?.actions?.[0].label).toBe('Activer pouvoir');
  });

  it('devrait signaler les effets non mappables', () => {
    const chessRule: ChessRule = {
      ruleId: 'test_unknown',
      ruleName: 'Test Unknown',
      description: 'Test unknown effect',
      category: 'special',
      affectedPieces: ['pawn'],
      trigger: 'conditional',
      conditions: [],
      effects: [{
        action: 'unknownAction',
        target: 'self',
        parameters: {}
      }],
      tags: ['test'],
      priority: 1,
      isActive: true,
      validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
    };

    const result = convertChessRuleToRuleJSON(chessRule);
    
    expect(result.success).toBe(false);
    expect(result.unmappedEffects).toContain('unknownAction');
    expect(result.ambiguities.length).toBeGreaterThan(0);
  });

  it('devrait créer des effets passifs pour les actions non-UI', () => {
    const chessRule: ChessRule = {
      ruleId: 'test_passive',
      ruleName: 'Test Passive',
      description: 'Test passive effect',
      category: 'movement',
      affectedPieces: ['knight'],
      trigger: 'onMove',
      conditions: [],
      effects: [{
        action: 'extraMove',
        target: 'self',
        parameters: {}
      }],
      tags: ['test'],
      priority: 1,
      isActive: true,
      validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
    };

    const result = convertChessRuleToRuleJSON(chessRule);
    
    expect(result.success).toBe(true);
    expect(result.rule?.ui?.actions).toHaveLength(0);
    expect(result.rule?.logic?.effects).toHaveLength(1);
    expect(result.rule?.logic?.effects?.[0].when).toBe('lifecycle.onMoveCommitted');
  });
});
