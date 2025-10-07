import { ChessRule, RuleCondition, RuleEffect } from '@/types/chess';

const allowedCategories: ChessRule['category'][] = [
  'movement',
  'capture',
  'special',
  'condition',
  'victory',
  'restriction',
  'defense',
  'behavior',
];

const allowedTriggers: ChessRule['trigger'][] = [
  'always',
  'onMove',
  'onCapture',
  'onCheck',
  'onCheckmate',
  'turnBased',
  'conditional',
];

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
};

const hasProvidedListValues = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getRecordValue = <T>(record: Record<string, unknown>, key: string): T | undefined => (
  Object.prototype.hasOwnProperty.call(record, key)
    ? (record[key] as T)
    : undefined
);

const sanitizeConditions = (
  value: unknown,
  issues: string[],
): RuleCondition[] => {
  if (!value) return [];

  const source = Array.isArray(value) ? value : [value];

  return source
    .map(condition => {
      if (typeof condition !== 'object' || condition === null) {
        issues.push('Condition invalide supprimée.');
        return null;
      }

      const typedCondition = condition as Partial<RuleCondition>;
      const hasType = typeof typedCondition.type === 'string' && typedCondition.type.length > 0;
      const operator = typedCondition.operator && allowedOperators.has(typedCondition.operator)
        ? typedCondition.operator
        : 'equals';

      if (!hasType) {
        issues.push('Une condition ne possède pas de type valide.');
        return null;
      }

      return {
        type: typedCondition.type,
        value: typedCondition.value,
        operator,
      } satisfies RuleCondition;
    })
    .filter((condition): condition is RuleCondition => condition !== null);
};

const allowedOperators = new Set<RuleCondition['operator']>([
  'equals',
  'notEquals',
  'greaterThan',
  'lessThan',
  'greaterOrEqual',
  'lessOrEqual',
  'contains',
  'in',
]);

const allowedEffectTargets = ['self', 'opponent', 'all', 'specific'] as const;
const isEffectTarget = (value: unknown): value is RuleEffect['target'] =>
  typeof value === 'string' &&
  (allowedEffectTargets as readonly string[]).includes(value);

const sanitizeEffects = (
  value: unknown,
  issues: string[],
): RuleEffect[] => {
  if (!value) return [];

  const source = Array.isArray(value) ? value : [value];

  return source
    .map(effect => {
      if (typeof effect !== 'object' || effect === null) {
        issues.push('Effet invalide supprimé.');
        return null;
      }

      const typedEffect = effect as Partial<RuleEffect>;
      const hasAction = typeof typedEffect.action === 'string' && typedEffect.action.length > 0;
      const hasTarget = typeof typedEffect.target === 'string' && typedEffect.target.length > 0;

      if (!hasAction || !hasTarget) {
        issues.push('Un effet ne possède pas d\'action ou de cible valide.');
        return null;
      }

      return {
        action: typedEffect.action,
        target: isEffectTarget(typedEffect.target) ? typedEffect.target : 'self',
        parameters: isRecord(typedEffect.parameters)
          ? typedEffect.parameters
          : {},
      } satisfies RuleEffect;
    })
    .filter((effect): effect is RuleEffect => effect !== null);
};

export interface RuleAnalysisResult {
  rule: ChessRule;
  issues: string[];
}

export const analyzeRuleLogic = (rule: ChessRule): RuleAnalysisResult => {
  const issues: string[] = [];
  const rawRule = rule as unknown as Record<string, unknown>;

  const rawRuleName = rawRule.ruleName;
  const ruleName = typeof rawRuleName === 'string' && rawRuleName.trim().length > 0
    ? rawRuleName.trim()
    : 'Règle sans nom';
  if (ruleName !== rawRuleName) {
    issues.push('Nom de règle manquant ou invalide corrigé.');
  }

  const rawDescription = rawRule.description;
  const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  if (!description) {
    issues.push('Description manquante remplacée par une valeur vide.');
  }

  const rawCategory = rawRule.category;
  const category = typeof rawCategory === 'string' && allowedCategories.includes(rawCategory as ChessRule['category'])
    ? (rawCategory as ChessRule['category'])
    : 'special';
  if (category !== rawCategory) {
    issues.push('Catégorie invalide remplacée par "special".');
  }

  const rawTrigger = rawRule.trigger;
  const trigger = typeof rawTrigger === 'string' && allowedTriggers.includes(rawTrigger as ChessRule['trigger'])
    ? (rawTrigger as ChessRule['trigger'])
    : 'always';
  if (trigger !== rawTrigger) {
    issues.push('Déclencheur invalide remplacé par "always".');
  }

  const rawAffectedPieces = rawRule.affectedPieces;
  const affectedPieces = toStringArray(rawAffectedPieces);
  if (affectedPieces.length === 0 && Array.isArray(rawAffectedPieces) && rawAffectedPieces.length > 0) {
    issues.push('Pièces affectées invalides, valeurs supprimées.');
  }

  const rawTags = rawRule.tags;
  const tags = toStringArray(rawTags).map(tag => tag.toLowerCase());
  if (tags.length === 0 && hasProvidedListValues(rawTags)) {
    issues.push('Tags invalides supprimés.');
  }

  const conditions = sanitizeConditions(rawRule.conditions, issues);
  const effects = sanitizeEffects(rawRule.effects, issues);

  const rawPriority = rawRule.priority;
  const numericPriority = typeof rawPriority === 'number'
    ? rawPriority
    : Number.parseInt(String(rawPriority ?? ''), 10);
  const normalizedPriority = Number.isFinite(numericPriority) ? numericPriority : 1;
  if (normalizedPriority !== rawPriority) {
    issues.push('Priorité invalide fixée à 1.');
  }

  const rawIsActive = rawRule.isActive;
  const isActive = typeof rawIsActive === 'boolean' ? rawIsActive : Boolean(rawIsActive);
  if (isActive !== rawIsActive) {
    issues.push('Statut actif invalide corrigé.');
  }

  const validationRules = (() => {
    const rawValidation = rawRule.validationRules;
    if (!isRecord(rawValidation)) {
      if (rawValidation) {
        issues.push('Règles de validation invalides réinitialisées.');
      }
      return {
        allowedWith: [],
        conflictsWith: [],
        requiredState: null,
      } satisfies ChessRule['validationRules'];
    }

    const allowedWithSource = getRecordValue<unknown>(rawValidation, 'allowedWith');
    const conflictsWithSource = getRecordValue<unknown>(rawValidation, 'conflictsWith');
    const requiredState = getRecordValue<unknown>(rawValidation, 'requiredState') ?? null;

    const allowedWith = toStringArray(allowedWithSource);
    const conflictsWith = toStringArray(conflictsWithSource);

    if (hasProvidedListValues(allowedWithSource) && allowedWith.length === 0) {
      issues.push('Liste allowedWith invalide réinitialisée.');
    }
    if (hasProvidedListValues(conflictsWithSource) && conflictsWith.length === 0) {
      issues.push('Liste conflictsWith invalide réinitialisée.');
    }

    return {
      allowedWith,
      conflictsWith,
      requiredState,
    } satisfies ChessRule['validationRules'];
  })();

  return {
    rule: {
      ...rule,
      ruleName,
      description,
      category,
      trigger,
      affectedPieces,
      tags,
      conditions,
      effects,
      priority: normalizedPriority,
      isActive,
      validationRules,
    },
    issues,
  };
};

export const analyzeRules = (rules: ChessRule[]): RuleAnalysisResult[] =>
  rules.map(rule => analyzeRuleLogic(rule));

