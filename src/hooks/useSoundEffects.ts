import { useCallback, useEffect } from "react";

/**
 * Lightweight spatial-feeling game SFX synthesized with WebAudio.
 * A shared mixer avoids opening a new AudioContext for each mounted hook.
 * No third-party samples, downloads or network dependencies.
 */
export type SoundEffect =
  | "move" | "capture" | "check" | "checkmate" | "castle"
  | "en-passant" | "time-warning" | "time-expired" | "countdown"
  | "explosion" | "quantum-explosion" | "mine-detonation"
  | "quicksand-place" | "quicksand-capture";

type Wave = "sine" | "triangle" | "square" | "sawtooth";
type Tone = {
  at: number; duration: number; hz: number; endHz?: number;
  wave: Wave; level: number; cutoff?: number;
};
type Noise = { at: number; duration: number; level: number; cutoff: number; type: "lowpass" | "highpass" | "bandpass" };
type SoundRecipe = { tones: readonly Tone[]; noise?: readonly Noise[]; };

const tone = (at: number, duration: number, hz: number, level: number,
  wave: Wave = "triangle", endHz?: number, cutoff?: number): Tone =>
  ({ at, duration, hz, level, wave, endHz, cutoff });
const noise = (at: number, duration: number, level: number, cutoff: number,
  type: Noise["type"] = "bandpass"): Noise =>
  ({ at, duration, level, cutoff, type });

export const GAME_SFX_RECIPES: Readonly<Record<SoundEffect, SoundRecipe>> = {
  move: {
    tones: [tone(0, .073, 390, .11, "triangle", 240, 2200), tone(.012, .055, 710, .045, "sine", 510)],
    noise: [noise(0, .038, .035, 2100, "highpass")],
  },
  capture: {
    tones: [tone(0, .18, 220, .17, "triangle", 95), tone(.013, .13, 445, .08, "sawtooth", 180, 1400)],
    noise: [noise(0, .105, .10, 1800, "lowpass")],
  },
  check: {
    tones: [
      tone(0, .23, 523.25, .16, "triangle", 587.33),
      tone(.10, .34, 783.99, .16, "sine", 880),
      tone(.145, .29, 392, .075, "sine", 440),
    ],
    noise: [noise(0, .065, .055, 2800, "highpass")],
  },
  checkmate: {
    tones: [
      tone(0, .30, 196, .21, "sine", 174),
      tone(.06, .23, 392, .12, "triangle", 440),
      tone(.26, .31, 523.25, .14, "triangle", 587.33),
      tone(.51, .58, 659.25, .18, "sine", 523.25),
      tone(.52, .57, 329.63, .12, "sine", 261.63),
    ],
    noise: [noise(0, .12, .08, 1400, "lowpass"), noise(.49, .17, .05, 2800, "bandpass")],
  },
  castle: {
    tones: [tone(0, .12, 270, .12, "triangle", 190), tone(.09, .18, 380, .12, "triangle", 520)],
    noise: [noise(.02, .10, .065, 650, "lowpass")],
  },
  "en-passant": {
    tones: [tone(0, .11, 610, .12, "triangle", 400), tone(.075, .12, 400, .10, "sine", 540)],
    noise: [noise(.0, .055, .05, 2700, "highpass")],
  },
  "time-warning": {
    tones: [tone(0, .09, 880, .11, "sine"), tone(.15, .09, 880, .11, "sine")],
  },
  "time-expired": {
    tones: [tone(0, .55, 290, .16, "triangle", 110), tone(.20, .57, 145, .17, "sine", 95)],
    noise: [noise(0, .15, .05, 600, "lowpass")],
  },
  countdown: {
    tones: [tone(0, .09, 1000, .10, "sine"), tone(.13, .09, 800, .10, "sine")],
  },
  explosion: {
    tones: [tone(0, .58, 115, .20, "sawtooth", 55, 650), tone(.055, .38, 80, .16, "sine", 40)],
    noise: [noise(0, .43, .25, 420, "lowpass")],
  },
  "quantum-explosion": {
    tones: [tone(0, .22, 1220, .14, "sine", 190), tone(.1, .46, 270, .16, "triangle", 76)],
    noise: [noise(.06, .33, .18, 2150, "bandpass")],
  },
  "mine-detonation": {
    tones: [tone(0, .26, 320, .15, "square", 90, 700), tone(.08, .4, 100, .17, "sine", 48)],
    noise: [noise(0, .22, .19, 1100, "lowpass")],
  },
  "quicksand-place": {
    tones: [tone(0, .28, 220, .11, "triangle", 105), tone(.08, .22, 390, .05, "sine", 155)],
    noise: [noise(0, .30, .11, 900, "lowpass")],
  },
  "quicksand-capture": {
    tones: [tone(0, .40, 360, .15, "triangle", 85), tone(.16, .39, 115, .15, "sine", 51)],
    noise: [noise(0, .40, .20, 1200, "lowpass")],
  },
};

let sharedContext: AudioContext | null = null;
let sharedMixer: AudioNode | null = null;
let cachedNoise: AudioBuffer | null = null;
const VOLUME_KEY = "aichess:sfx-volume";

export function getSfxVolume(): number {
  if (typeof window === "undefined") return 0.7;
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 0.7;
    const stored = Number(raw);
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.7;
  } catch {
    return 0.7;
  }
}

export function setSfxVolume(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, value))));
  } catch {
    // Audio preferences are optional when localStorage is disabled.
  }
}

async function contextForPlayback(): Promise<AudioContext | null> {
  if (typeof window === "undefined") return null;
  const ctor = window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) return null;
  try {
    if (!sharedContext || sharedContext.state === "closed") {
      sharedContext = new ctor();
      const compressor = sharedContext.createDynamicsCompressor();
      compressor.threshold.value = -22;
      compressor.knee.value = 16;
      compressor.ratio.value = 3;
      compressor.attack.value = .005;
      compressor.release.value = .23;
      compressor.connect(sharedContext.destination);
      sharedMixer = compressor;
      cachedNoise = null;
    }
    if (sharedContext.state === "suspended") await sharedContext.resume();
    return sharedContext.state === "running" ? sharedContext : null;
  } catch {
    return null;
  }
}

function fade(gain: GainNode, start: number, duration: number, level: number) {
  const amplitude = Math.min(.5, Math.max(0.0001, level));
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(amplitude, start + Math.min(.012, duration * .2));
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
}

function renderTone(ctx: AudioContext, destination: AudioNode, voice: Tone, base: number, volume: number) {
  const start = base + voice.at, end = start + voice.duration;
  const oscillator = ctx.createOscillator();
  oscillator.type = voice.wave;
  oscillator.frequency.setValueAtTime(voice.hz, start);
  if (voice.endHz && voice.endHz > 0) {
    oscillator.frequency.exponentialRampToValueAtTime(voice.endHz, end);
  }
  const envelope = ctx.createGain();
  fade(envelope, start, voice.duration, voice.level * volume);
  if (voice.cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = voice.cutoff;
    oscillator.connect(filter).connect(envelope);
    oscillator.onended = () => {
      oscillator.disconnect(); filter.disconnect(); envelope.disconnect();
    };
  } else {
    oscillator.connect(envelope);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  envelope.connect(destination);
  oscillator.start(start);
  oscillator.stop(end + .015);
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedNoise && cachedNoise.sampleRate === ctx.sampleRate) return cachedNoise;
  const length = Math.round(ctx.sampleRate * .85);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x0f4b7d31;
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = (seed / 0xffffffff) * 2 - 1;
  }
  cachedNoise = buffer;
  return buffer;
}

function renderNoise(ctx: AudioContext, destination: AudioNode, voice: Noise, base: number, volume: number) {
  const start = base + voice.at, end = start + voice.duration;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = voice.type;
  filter.frequency.value = voice.cutoff;
  filter.Q.value = voice.type === "bandpass" ? .65 : .4;
  const envelope = ctx.createGain();
  fade(envelope, start, voice.duration, voice.level * volume);
  source.connect(filter).connect(envelope).connect(destination);
  source.onended = () => {
    source.disconnect(); filter.disconnect(); envelope.disconnect();
  };
  source.start(start);
  source.stop(end + .015);
}

export async function playChessSfx(effect: SoundEffect): Promise<void> {
  const recipe = GAME_SFX_RECIPES[effect];
  if (!recipe) return;
  const volume = getSfxVolume();
  if (volume === 0) return;
  const context = await contextForPlayback();
  if (!context || !sharedMixer) return;
  const base = context.currentTime + .007;
  for (const voice of recipe.tones) renderTone(context, sharedMixer, voice, base, volume);
  for (const voice of recipe.noise ?? []) renderNoise(context, sharedMixer, voice, base, volume);
}

export function useSoundEffects() {
  const playSound = useCallback((effect: SoundEffect) => playChessSfx(effect), []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => { void contextForPlayback(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return { playSound };
}
