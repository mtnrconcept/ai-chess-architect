export type TimeControlOption = 'bullet' | 'blitz' | 'long' | 'untimed';

export const TIME_CONTROL_SETTINGS: Record<TimeControlOption, {
  label: string;
  description: string;
  initialSeconds: number;
}> = {
  bullet: {
    label: 'Bullet 1+0',
    description: '1 minute par joueur. Réflexes et instinct priment.',
    initialSeconds: 60,
  },
  blitz: {
    label: 'Blitz 5+0',
    description: '5 minutes par joueur pour un rythme classique.',
    initialSeconds: 300,
  },
  long: {
    label: 'Partie longue 15+0',
    description: '15 minutes par joueur pour réfléchir en profondeur.',
    initialSeconds: 900,
  },
  untimed: {
    label: 'Sans temps',
    description: 'Chronomètre désactivé. Prenez tout votre temps.',
    initialSeconds: 0,
  },
};

export const isTimeControlOption = (value: unknown): value is TimeControlOption => {
  return typeof value === 'string' && value in TIME_CONTROL_SETTINGS;
};
