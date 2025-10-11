export type SpecialAbilityTrigger = 'countdown' | 'contact';

export type SpecialAbilityKey = 'deployBomb' | 'deployMine';

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
}

export interface NormalizedSpecialAbilityParameters {
  ability: SpecialAbilityKey;
  radius: number;
  countdown: number;
  damage: number;
  trigger: SpecialAbilityTrigger;
  animation: string;
  sound: string;
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
};

const isSpecialAbilityKey = (value: string): value is SpecialAbilityKey => (
  Object.prototype.hasOwnProperty.call(SPECIAL_ABILITY_DEFINITIONS, value)
);

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
  if (!isSpecialAbilityKey(ability)) return undefined;
  return SPECIAL_ABILITY_DEFINITIONS[ability];
};

export const normalizeSpecialAbilityParameters = (
  ability: string,
  parameters: Record<string, unknown> | undefined,
): NormalizedSpecialAbilityParameters | undefined => {
  const metadata = getSpecialAbilityMetadata(ability);
  if (!metadata) return undefined;

  const params = parameters ?? {};

  return {
    ability: metadata.key,
    radius: Math.max(1, toFiniteNumber(params.radius, metadata.defaultRadius)),
    countdown: Math.max(0, toFiniteNumber(params.countdown, metadata.defaultCountdown)),
    damage: Math.max(1, toFiniteNumber(params.damage, metadata.defaultDamage)),
    trigger: toTrigger(params.trigger, metadata.trigger),
    animation: toText(params.animation, metadata.defaultAnimation),
    sound: toText(params.sound, metadata.defaultSound),
  } satisfies NormalizedSpecialAbilityParameters;
};

export const formatSpecialAbilitySummary = (ability: SpecialAbility, metadata: SpecialAbilityMetadata): string => {
  const triggerDescription = ability.trigger === 'countdown'
    ? `détonation dans ${ability.countdown} tour${ability.countdown > 1 ? 's' : ''}`
    : 'détonation au contact';

  return `${metadata.label} · Rayon ${ability.radius} · ${triggerDescription}`;
};

export { SPECIAL_ABILITY_DEFINITIONS };
