export type SpecialAbilityTrigger = 'countdown' | 'contact';

export type SpecialAbilityKey = 'deployBomb' | 'deployMine' | 'freezeMissile';

export interface SpecialAbility {
  ability: SpecialAbilityKey;
  radius: number;
  countdown: number;
  damage: number;
  trigger: SpecialAbilityTrigger;
}

export interface SpecialAbilityMetadata {
  key: SpecialAbilityKey;
  label: string;
  description: string;
  defaultRadius: number;
  defaultCountdown: number;
  defaultDamage: number;
  trigger: SpecialAbilityTrigger;
  icon: 'bomb' | 'target';
  defaultAnimation: string;
  defaultSound: string;
  buttonLabel?: string;
  defaultFreezeTurns?: number;
  allowOccupied?: boolean;
}

export interface NormalizedSpecialAbilityParameters {
  ability: SpecialAbilityKey;
  radius: number;
  countdown: number;
  damage: number;
  trigger: SpecialAbilityTrigger;
  animation: string;
  sound: string;
  freezeTurns?: number;
  allowOccupied?: boolean;
}

const SPECIAL_ABILITY_DEFINITIONS: Record<SpecialAbilityKey, SpecialAbilityMetadata> = {
  deployBomb: {
    key: 'deployBomb',
    label: 'Bombe quantique',
    description: 'Place une charge explosive à retardement capable de balayer plusieurs cases.',
    defaultRadius: 1,
    defaultCountdown: 3,
    defaultDamage: 3,
    trigger: 'countdown',
    icon: 'bomb',
    defaultAnimation: 'quantum-bomb',
    defaultSound: 'quantum-explosion',
    buttonLabel: 'Déployer une bombe',
  },
  deployMine: {
    key: 'deployMine',
    label: 'Mine sentinelle',
    description: 'Déploie une mine qui explose dès qu\'un adversaire la traverse.',
    defaultRadius: 1,
    defaultCountdown: 0,
    defaultDamage: 2,
    trigger: 'contact',
    icon: 'target',
    defaultAnimation: 'mine-shockwave',
    defaultSound: 'mine-detonation',
    buttonLabel: 'Placer une mine',
  },
  freezeMissile: {
    key: 'freezeMissile',
    label: 'Missile cryogénique',
    description: 'Lance un projectile qui gèle les pièces adverses dans la zone d’impact.',
    defaultRadius: 1,
    defaultCountdown: 2,
    defaultDamage: 1,
    trigger: 'countdown',
    icon: 'target',
    defaultAnimation: 'frost-burst',
    defaultSound: 'ice-explosion',
    buttonLabel: 'Lancer un missile gelant',
    defaultFreezeTurns: 2,
    allowOccupied: true,
  },
};

const isSpecialAbilityKey = (value: string): value is SpecialAbilityKey => (
  Object.prototype.hasOwnProperty.call(SPECIAL_ABILITY_DEFINITIONS, value)
);

const normalizeAbilityName = (raw: string): SpecialAbilityKey | undefined => {
  if (!raw) return undefined;
  if (isSpecialAbilityKey(raw)) return raw;

  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');

  const includesAll = (needles: string[]) => needles.every(needle => normalized.includes(needle));

  if (includesAll(['freeze']) || includesAll(['gel']) || includesAll(['glace']) || includesAll(['frost']) || includesAll(['ice'])) {
    if (normalized.includes('missile') || normalized.includes('rocket') || normalized.includes('projectile')) {
      return 'freezeMissile';
    }
  }

  if (normalized.includes('missile') && (normalized.includes('gel') || normalized.includes('glace') || normalized.includes('freeze') || normalized.includes('ice') || normalized.includes('frost'))) {
    return 'freezeMissile';
  }

  if (normalized.includes('mine') || normalized.includes('trap') || normalized.includes('piege')) {
    return 'deployMine';
  }

  if (
    normalized.includes('bomb') ||
    normalized.includes('bombe') ||
    normalized.includes('explosion') ||
    normalized.includes('rocket') ||
    normalized.includes('missile')
  ) {
    return 'deployBomb';
  }

  return undefined;
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTrigger = (value: unknown, fallback: SpecialAbilityTrigger): SpecialAbilityTrigger => {
  return value === 'contact' || value === 'countdown' ? value : fallback;
};

const toText = (value: unknown, fallback: string): string => (
  typeof value === 'string' && value.trim().length > 0 ? value : fallback
);

export const getSpecialAbilityMetadata = (ability: string): SpecialAbilityMetadata | undefined => {
  const key = normalizeAbilityName(ability);
  if (!key) return undefined;
  return SPECIAL_ABILITY_DEFINITIONS[key];
};

export const normalizeSpecialAbilityParameters = (
  ability: string,
  parameters: Record<string, unknown> | undefined,
): NormalizedSpecialAbilityParameters | undefined => {
  const key = normalizeAbilityName(ability);
  if (!key) return undefined;

  const metadata = SPECIAL_ABILITY_DEFINITIONS[key];
  if (!metadata) return undefined;

  const params = parameters ?? {};

  const resolveFreezeTurns = (): number | undefined => {
    if (metadata.defaultFreezeTurns === undefined) return undefined;
    const sources = [params.freezeTurns, params.freezeDuration, params.turns];
    for (const source of sources) {
      if (typeof source === 'number' && Number.isFinite(source)) {
        return Math.max(1, Math.round(source));
      }
      const parsed = Number.parseInt(String(source ?? ''), 10);
      if (Number.isFinite(parsed)) {
        return Math.max(1, parsed);
      }
    }
    return metadata.defaultFreezeTurns;
  };

  return {
    ability: metadata.key,
    radius: Math.max(1, toFiniteNumber(params.radius, metadata.defaultRadius)),
    countdown: Math.max(0, toFiniteNumber(params.countdown, metadata.defaultCountdown)),
    damage: Math.max(1, toFiniteNumber(params.damage, metadata.defaultDamage)),
    trigger: toTrigger(params.trigger, metadata.trigger),
    animation: toText(params.animation, metadata.defaultAnimation),
    sound: toText(params.sound, metadata.defaultSound),
    freezeTurns: resolveFreezeTurns(),
    allowOccupied: metadata.allowOccupied ?? false,
  } satisfies NormalizedSpecialAbilityParameters;
};

export const formatSpecialAbilitySummary = (ability: SpecialAbility, metadata: SpecialAbilityMetadata): string => {
  const triggerDescription = ability.trigger === 'countdown'
    ? `détonation dans ${ability.countdown} tour${ability.countdown > 1 ? 's' : ''}`
    : 'détonation au contact';

  return `${metadata.label} · Rayon ${ability.radius} · ${triggerDescription}`;
};

export { SPECIAL_ABILITY_DEFINITIONS };
