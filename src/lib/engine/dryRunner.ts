import { RuleJSON } from '@/engine/types';
import { createRuleEngine } from '@/engine/bootstrap';
import { createMockEngineContracts } from './mockContracts';

export interface DryRunResult {
  success: boolean;
  errors: string[];
  executedActions: string[];
  warnings: string[];
}

export async function dryRunRule(rule: RuleJSON): Promise<DryRunResult> {
  const mockContracts = createMockEngineContracts();
  const errors: string[] = [];
  const warnings: string[] = [];
  const executedActions: string[] = [];

  try {
    const engine = createRuleEngine(mockContracts, [rule]);
    
    // Simuler des événements typiques de jeu
    const testScenarios = [
      { name: 'Turn start white', fn: () => engine.onTurnStart('white') },
      { name: 'Move committed', fn: () => engine.onMoveCommitted({ pieceId: 'mock_p1', from: 'e2', to: 'e4' }) },
      { name: 'Enter tile', fn: () => engine.onEnterTile('mock_p1', 'e4') },
      { name: 'Turn start black', fn: () => engine.onTurnStart('black') },
    ];

    for (const scenario of testScenarios) {
      try {
        scenario.fn();
      } catch (e: any) {
        errors.push(`Scenario "${scenario.name}" failed: ${e.message}`);
      }
    }

    // Vérifier les actions exécutées
    const actions = mockContracts.getExecutedActions();
    executedActions.push(...actions);

    // Valider qu'au moins une action a été exécutée si la règle a des effects
    if (rule.logic?.effects?.length > 0 && actions.length === 0) {
      warnings.push('Aucune action exécutée malgré la présence d\'effects');
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
      errors: [`Engine bootstrap failed: ${e.message}`],
      executedActions: [],
      warnings: []
    };
  }
}
