/**
 * Adaptateur pour convertir le nouveau format rule_json vers l'ancien format ChessRule
 * utilisé par l'UI pendant la période de transition
 */

import { ChessRule } from '@/types/chess';

interface RuleJSONMeta {
  ruleId: string;
  ruleName: string;
  description: string;
  category: string;
  tags?: string[];
  version?: string;
  isActive?: boolean;
}

interface RuleJSONScope {
  affectedPieces?: string[];
  sides?: ('white' | 'black')[];
}

interface RuleJSONLogic {
  effects: any[];
}

interface RuleJSONUI {
  actions?: any[];
}

interface RuleJSONAssets {
  color?: string;
  icon?: string;
  sfx?: {
    onTrigger?: string;
    onSuccess?: string;
    onFail?: string;
  };
}

interface RuleJSONState {
  namespace?: string;
  initial?: Record<string, any>;
}

export interface RuleJSON {
  meta: RuleJSONMeta;
  scope?: RuleJSONScope;
  logic: RuleJSONLogic;
  ui?: RuleJSONUI;
  assets?: RuleJSONAssets;
  state?: RuleJSONState;
  parameters?: Record<string, any>;
}

/**
 * Convertit un objet rule_json (nouveau format) vers ChessRule (ancien format)
 * pour compatibilité avec les composants UI existants
 */
export function adaptRuleJsonToChessRule(
  ruleJson: RuleJSON,
  dbMetadata?: {
    id?: string;
    created_at?: string;
    updated_at?: string;
    created_by?: string;
    priority?: number;
    status?: string;
  }
): ChessRule {
  const meta = ruleJson.meta || {} as RuleJSONMeta;
  const scope = ruleJson.scope || {} as RuleJSONScope;
  const logic = ruleJson.logic || {} as RuleJSONLogic;
  const ui = ruleJson.ui || {} as RuleJSONUI;
  const assets = ruleJson.assets || {} as RuleJSONAssets;

  // Extraire le premier effet pour déterminer le trigger
  // (dans le nouveau format, il n'y a pas de trigger global)
  const firstEffect = logic.effects?.[0];
  let trigger: ChessRule['trigger'] = 'always';
  
  if (firstEffect?.when) {
    const when = firstEffect.when;
    if (when.includes('lifecycle.onMoveCommitted')) trigger = 'onMove';
    else if (when.includes('lifecycle.onCapture')) trigger = 'onCapture';
    else if (when.includes('lifecycle.onTurnStart')) trigger = 'turnBased';
    else if (when.includes('ui.')) trigger = 'conditional';
  }

  // Les tags peuvent être dans meta.tags ou dbMetadata
  const tags = Array.isArray(meta.tags) 
    ? meta.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
    : [];

  const chessRule: ChessRule = {
    id: dbMetadata?.id,
    ruleId: meta.ruleId,
    ruleName: meta.ruleName,
    description: meta.description,
    category: (meta.category as ChessRule['category']) || 'special',
    affectedPieces: scope.affectedPieces || [],
    trigger,
    conditions: [], // Les conditions sont maintenant intégrées dans logic.effects[].if
    effects: logic.effects || [], // Garder le format complet pour compatibilité
    tags,
    priority: dbMetadata?.priority ?? 1,
    isActive: meta.isActive ?? (dbMetadata?.status === 'active'),
    validationRules: {
      allowedWith: [],
      conflictsWith: [],
      requiredState: null,
    },
    createdAt: dbMetadata?.created_at,
    updatedAt: dbMetadata?.updated_at,
    userId: dbMetadata?.created_by,
    // Conserver les données supplémentaires pour l'affichage enrichi
    assets,
    uiActions: ui.actions,
    state: ruleJson.state,
    parameters: ruleJson.parameters,
  };

  return chessRule;
}

/**
 * Extrait les issues/warnings d'une règle rule_json
 * (simplifié par rapport à analyzeRuleLogic car les règles DB sont pré-validées)
 */
export function extractRuleJsonIssues(ruleJson: RuleJSON): string[] {
  const issues: string[] = [];

  if (!ruleJson.meta?.ruleId || ruleJson.meta.ruleId.trim().length === 0) {
    issues.push('Identifiant de règle manquant');
  }

  if (!ruleJson.meta?.ruleName || ruleJson.meta.ruleName.trim().length === 0) {
    issues.push('Nom de règle manquant');
  }

  if (!ruleJson.meta?.description || ruleJson.meta.description.trim().length === 0) {
    issues.push('Description manquante');
  }

  if (!ruleJson.logic?.effects || ruleJson.logic.effects.length === 0) {
    issues.push('Aucun effet défini');
  }

  // Vérifier que les actions UI correspondent aux effets
  if (ruleJson.ui?.actions && ruleJson.ui.actions.length > 0) {
    const uiActionIds = new Set(ruleJson.ui.actions.map((a: any) => a.id));
    const effectWhens = ruleJson.logic.effects
      .map((e: any) => e.when)
      .filter((w: any) => typeof w === 'string' && w.startsWith('ui.'))
      .map((w: string) => w.replace('ui.', ''));

    effectWhens.forEach((when: string) => {
      if (!uiActionIds.has(when)) {
        issues.push(`Action UI "${when}" référencée mais non définie`);
      }
    });
  }

  return issues;
}
