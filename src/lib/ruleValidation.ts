import { ChessRule, RuleCondition, RuleEffect } from '@/types/chess';
import { getSpecialAbilityMetadata, normalizeSpecialAbilityParameters } from '@/lib/specialAbilities';

const generateAnonymousRuleId = (() => {
  let counter = 0;
  return () => `generated-rule-${++counter}`;
})();

const createDefaultRule = (): ChessRule => ({
  ruleId: generateAnonymousRuleId(),
  ruleName: 'Règle sans nom',
  description: '',
  category: 'special',
  affectedPieces: [],
  trigger: 'always',
  conditions: [],
  effects: [],
  tags: [],
  priority: 1,
  isActive: false,
  validationRules: {
    allowedWith: [],
    conflictsWith: [],
    requiredState: null,
  },
});

const allowedCategories: ChessRule['category'][] = [
  'movement',
  'capture',
  'special',
  'condition',
  'victory',
  'restriction',
  'defense',
  'behavior',
  'vip',
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

export const analyzeRuleLogic = (rule: unknown): RuleAnalysisResult => {
  const issues: string[] = [];
  const fallbackRule = createDefaultRule();

  if (!isRecord(rule)) {
    issues.push('Structure de règle invalide remplacée par des valeurs par défaut.');
  }

  const rawRule = isRecord(rule)
    ? rule as Record<string, unknown>
    : fallbackRule as unknown as Record<string, unknown>;

  const rawRuleId = getRecordValue<unknown>(rawRule, 'ruleId')
    ?? getRecordValue<unknown>(rawRule, 'rule_id')
    ?? getRecordValue<unknown>(rawRule, 'id')
    ?? fallbackRule.ruleId;

  const ruleId = typeof rawRuleId === 'string' && rawRuleId.trim().length > 0
    ? rawRuleId.trim()
    : (() => {
        issues.push('Identifiant de règle manquant ou invalide généré automatiquement.');
        return fallbackRule.ruleId;
      })();

  const rawRuleName = getRecordValue<unknown>(rawRule, 'ruleName')
    ?? getRecordValue<unknown>(rawRule, 'rule_name');
  const ruleName = typeof rawRuleName === 'string' && rawRuleName.trim().length > 0
    ? rawRuleName.trim()
    : 'Règle sans nom';
  if (ruleName !== rawRuleName) {
    issues.push('Nom de règle manquant ou invalide corrigé.');
  }

  const rawDescription = getRecordValue<unknown>(rawRule, 'description');
  const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  if (!description) {
    issues.push('Description manquante remplacée par une valeur vide.');
  }

  const rawCategory = getRecordValue<unknown>(rawRule, 'category');
  const category = typeof rawCategory === 'string' && allowedCategories.includes(rawCategory as ChessRule['category'])
    ? (rawCategory as ChessRule['category'])
    : 'special';
  if (category !== rawCategory) {
    issues.push('Catégorie invalide remplacée par "special".');
  }

  const rawTrigger = getRecordValue<unknown>(rawRule, 'trigger');
  const trigger = typeof rawTrigger === 'string' && allowedTriggers.includes(rawTrigger as ChessRule['trigger'])
    ? (rawTrigger as ChessRule['trigger'])
    : 'always';
  if (trigger !== rawTrigger) {
    issues.push('Déclencheur invalide remplacé par "always".');
  }

  const rawAffectedPieces = getRecordValue<unknown>(rawRule, 'affectedPieces')
    ?? getRecordValue<unknown>(rawRule, 'affected_pieces');
  const affectedPieces = toStringArray(rawAffectedPieces);
  if (affectedPieces.length === 0 && Array.isArray(rawAffectedPieces) && rawAffectedPieces.length > 0) {
    issues.push('Pièces affectées invalides, valeurs supprimées.');
  }

  const rawTags = getRecordValue<unknown>(rawRule, 'tags');
  const tags = toStringArray(rawTags).map(tag => tag.toLowerCase());
  if (tags.length === 0 && hasProvidedListValues(rawTags)) {
    issues.push('Tags invalides supprimés.');
  }

  const conditions = sanitizeConditions(getRecordValue<unknown>(rawRule, 'conditions'), issues);
  let effects = sanitizeEffects(getRecordValue<unknown>(rawRule, 'effects'), issues);

  effects = effects.map(effect => {
    if (effect.action !== 'addAbility') {
      return effect;
    }

    const abilityName = typeof effect.parameters?.ability === 'string' ? effect.parameters.ability : '';
    const normalized = normalizeSpecialAbilityParameters(
      abilityName,
      effect.parameters as Record<string, unknown> | undefined,
    );

    if (!normalized) {
      return effect;
    }

    const metadata = getSpecialAbilityMetadata(abilityName);
    const originalParameters = (effect.parameters ?? {}) as Record<string, unknown>;
    const updatedParameters = {
      ...originalParameters,
      ...normalized,
    } as Record<string, unknown>;

    if (metadata) {
      if (originalParameters.radius !== undefined && updatedParameters.radius !== originalParameters.radius) {
        issues.push(`Rayon invalide pour l'attaque spéciale ${metadata.label} normalisé.`);
      }
      if (originalParameters.countdown !== undefined && updatedParameters.countdown !== originalParameters.countdown) {
        issues.push(`Compte à rebours invalide pour l'attaque spéciale ${metadata.label} ajusté.`);
      }
      if (originalParameters.damage !== undefined && updatedParameters.damage !== originalParameters.damage) {
        issues.push(`Dégâts invalides pour l'attaque spéciale ${metadata.label} ajustés.`);
      }
      if (originalParameters.trigger !== undefined && updatedParameters.trigger !== originalParameters.trigger) {
        issues.push(`Mode de déclenchement invalide pour l'attaque spéciale ${metadata.label} réinitialisé.`);
      }
    }

    return {
      ...effect,
      parameters: updatedParameters,
    } satisfies RuleEffect;
  });

  const rawPriority = getRecordValue<unknown>(rawRule, 'priority');
  const numericPriority = typeof rawPriority === 'number'
    ? rawPriority
    : Number.parseInt(String(rawPriority ?? ''), 10);
  const normalizedPriority = Number.isFinite(numericPriority) ? numericPriority : 1;
  if (normalizedPriority !== rawPriority) {
    issues.push('Priorité invalide fixée à 1.');
  }

  const rawIsActive = getRecordValue<unknown>(rawRule, 'isActive')
    ?? getRecordValue<unknown>(rawRule, 'is_active');
  const isActive = typeof rawIsActive === 'boolean' ? rawIsActive : Boolean(rawIsActive);
  if (isActive !== rawIsActive) {
    issues.push('Statut actif invalide corrigé.');
  }

  const validationRules = (() => {
    const rawValidation = getRecordValue<unknown>(rawRule, 'validationRules')
      ?? getRecordValue<unknown>(rawRule, 'validation_rules');
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

  const finalRule: ChessRule = {
    ...fallbackRule,
    ruleId,
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
  };

  if (isRecord(rule)) {
    const rawId = getRecordValue<unknown>(rule as Record<string, unknown>, 'id');
    if (typeof rawId === 'string' && rawId.trim()) {
      finalRule.id = rawId;
    }

    const rawUserId = getRecordValue<unknown>(rule as Record<string, unknown>, 'userId')
      ?? getRecordValue<unknown>(rule as Record<string, unknown>, 'user_id');
    if (typeof rawUserId === 'string' && rawUserId.trim()) {
      finalRule.userId = rawUserId;
    }

    const rawCreatedAt = getRecordValue<unknown>(rule as Record<string, unknown>, 'createdAt')
      ?? getRecordValue<unknown>(rule as Record<string, unknown>, 'created_at');
    if (typeof rawCreatedAt === 'string' && rawCreatedAt.trim()) {
      finalRule.createdAt = rawCreatedAt;
    }

    const rawUpdatedAt = getRecordValue<unknown>(rule as Record<string, unknown>, 'updatedAt')
      ?? getRecordValue<unknown>(rule as Record<string, unknown>, 'updated_at');
    if (typeof rawUpdatedAt === 'string' && rawUpdatedAt.trim()) {
      finalRule.updatedAt = rawUpdatedAt;
    }
  }

  return {
    rule: finalRule,
    issues,
  };
};

export const analyzeRules = (rules: unknown): RuleAnalysisResult[] => {
  const source = Array.isArray(rules)
    ? rules
    : (rules === undefined || rules === null) ? [] : [rules];

  return source.map(rule => analyzeRuleLogic(rule));
};


