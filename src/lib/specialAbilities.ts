export type SpecialAbilityTrigger = 'countdown' | 'contact';

export type SpecialAbilityKey = 'deployBomb' | 'deployMine';

export type SpecialAbilityActivation = 'selfCell' | 'forwardCell' | 'selectCell';

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
  activation: SpecialAbilityActivation;
}

export interface NormalizedSpecialAbilityParameters {
  ability: SpecialAbilityKey;
  radius: number;
  countdown: number;
  damage: number;
  trigger: SpecialAbilityTrigger;
  animation: string;
  sound: string;
  activation: SpecialAbilityActivation;
}

const SPECIAL_ABILITY_DEFINITIONS: Record<SpecialAbilityKey, SpecialAbilityMetadata> = {
  deployBomb: {
    key: 'deployBomb',
    label: 'Charge quantique',
    description: 'Place une charge explosive a retardement capable de nettoyer plusieurs cases.',
    defaultRadius: 1,
    defaultCountdown: 3,
    defaultDamage: 3,
    trigger: 'countdown',
    icon: 'bomb',
    defaultAnimation: 'quantum-bomb',
    defaultSound: 'quantum-explosion',
    buttonLabel: 'Activer bombe',
    activation: 'forwardCell',
  },
  deployMine: {
    key: 'deployMine',
    label: 'Mine sentinelle',
    description: 'Arme une mine qui explose des qu un adversaire traverse la case.',
    defaultRadius: 1,
    defaultCountdown: 0,
    defaultDamage: 2,
    trigger: 'contact',
    icon: 'target',
    defaultAnimation: 'mine-shockwave',
    defaultSound: 'mine-detonation',
    buttonLabel: 'Placer mine',
    activation: 'selfCell',
  },
};

const isSpecialAbilityKey = (value: string): value is SpecialAbilityKey =>
  Object.prototype.hasOwnProperty.call(SPECIAL_ABILITY_DEFINITIONS, value);

const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTrigger = (value: unknown, fallback: SpecialAbilityTrigger): SpecialAbilityTrigger =>
  value === 'contact' || value === 'countdown' ? value : fallback;

const toText = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

const toActivation = (value: unknown, fallback: SpecialAbilityActivation): SpecialAbilityActivation => {
  if (value === 'selfCell' || value === 'forwardCell' || value === 'selectCell') {
    return value;
  }
  return fallback;
};

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
    activation: toActivation(params.activation, metadata.activation),
  };
};

export const formatSpecialAbilitySummary = (ability: SpecialAbility, metadata: SpecialAbilityMetadata): string => {
  const triggerDescription =
    ability.trigger === 'countdown'
      ? `detonation dans ${ability.countdown} tour${ability.countdown > 1 ? 's' : ''}`
      : 'detonation au contact';

  return `${metadata.label} :: rayon ${ability.radius} :: ${triggerDescription}`;
};

export { SPECIAL_ABILITY_DEFINITIONS };
