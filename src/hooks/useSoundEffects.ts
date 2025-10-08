import { useCallback, useEffect, useRef } from 'react';

type SoundEffect =
  | 'move'
  | 'capture'
  | 'check'
  | 'checkmate'
  | 'castle'
  | 'en-passant'
  | 'time-warning'
  | 'time-expired';

type SoundSegment = {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  pause?: number;
};

const SOUND_SEQUENCES: Record<SoundEffect, SoundSegment[]> = {
  move: [
    { frequency: 280, duration: 0.12, type: 'triangle', volume: 0.2 },
    { frequency: 340, duration: 0.08, type: 'triangle', volume: 0.18 },
  ],
  capture: [
    { frequency: 400, duration: 0.12, type: 'sawtooth', volume: 0.22 },
    { frequency: 520, duration: 0.12, type: 'sawtooth', volume: 0.22 },
    { frequency: 360, duration: 0.14, type: 'square', volume: 0.2 },
  ],
  check: [
    { frequency: 520, duration: 0.15, type: 'square', volume: 0.24 },
    { frequency: 680, duration: 0.18, type: 'square', volume: 0.22 },
  ],
  checkmate: [
    { frequency: 440, duration: 0.18, type: 'sine', volume: 0.24 },
    { frequency: 660, duration: 0.22, type: 'sine', volume: 0.25 },
    { frequency: 880, duration: 0.28, type: 'triangle', volume: 0.23 },
  ],
  castle: [
    { frequency: 300, duration: 0.1, type: 'triangle', volume: 0.2 },
    { frequency: 420, duration: 0.12, type: 'triangle', volume: 0.2 },
    { frequency: 560, duration: 0.14, type: 'triangle', volume: 0.2 },
  ],
  'en-passant': [
    { frequency: 360, duration: 0.12, type: 'sine', volume: 0.2 },
    { frequency: 260, duration: 0.12, type: 'sine', volume: 0.2 },
    { frequency: 460, duration: 0.12, type: 'triangle', volume: 0.2 },
  ],
  'time-warning': [
    { frequency: 720, duration: 0.1, type: 'square', volume: 0.25 },
    { frequency: 820, duration: 0.1, type: 'square', volume: 0.25 },
  ],
  'time-expired': [
    { frequency: 220, duration: 0.4, type: 'sawtooth', volume: 0.3 },
    { frequency: 150, duration: 0.35, type: 'sine', volume: 0.28 },
  ],
};

export const useSoundEffects = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    const AudioContextClass =
      window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const context = audioContextRef.current;
    if (!context) return null;

    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch (error) {
        console.warn('Impossible de reprendre le contexte audio:', error);
      }
    }

    return context;
  }, []);

  const playSound = useCallback(
    async (effect: SoundEffect) => {
      const sequence = SOUND_SEQUENCES[effect];
      if (!sequence || sequence.length === 0) return;

      const context = await ensureAudioContext();
      if (!context) return;

      let startTime = context.currentTime;

      for (const segment of sequence) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = segment.type ?? 'sine';
        oscillator.frequency.setValueAtTime(segment.frequency, startTime);

        const volume = Math.max(0, Math.min(1, segment.volume ?? 0.2));
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
        gain.gain.linearRampToValueAtTime(0.0001, startTime + segment.duration);

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(startTime);
        const stopTime = startTime + segment.duration + 0.02;
        oscillator.stop(stopTime);

        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };

        startTime = stopTime + (segment.pause ?? 0.02);
      }
    },
    [ensureAudioContext],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const interactionEvents: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        void unlockAudioContext();
      }
    };

    async function unlockAudioContext() {
      if (cancelled) return;
      const context = await ensureAudioContext();
      if (!context) return;

      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch (error) {
          console.warn('Impossible de déverrouiller le contexte audio:', error);
          return;
        }
      }

      if (context.state === 'running') {
        removeListeners();
      }
    }

    function removeListeners() {
      interactionEvents.forEach(event => window.removeEventListener(event, unlockAudioContext));
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
    interactionEvents.forEach(event => window.addEventListener(event, unlockAudioContext, { passive: true }));
    document.addEventListener('visibilitychange', visibilityHandler);

    void unlockAudioContext();

    return () => {
      cancelled = true;
      removeListeners();
    };
  }, [ensureAudioContext]);

  useEffect(() => {
    return () => {
      const context = audioContextRef.current;
      if (context && typeof context.close === 'function') {
        context.close().catch(() => {});
      }
      audioContextRef.current = null;
    };
  }, []);

  return { playSound };
};

export type { SoundEffect };
