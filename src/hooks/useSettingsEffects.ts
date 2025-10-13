import { useEffect, useRef } from "react";

type ThemeId = "neon" | "luminous" | "stealth";

type SettingsEffectOptions = {
  theme: ThemeId;
  neonIntensity: number;
  uiSize: "sm" | "md" | "lg";
  spectralTrails: boolean;
  boardReflections: boolean;
  soundEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
  voiceVolume: number;
  vibration: boolean;
  hapticsIntensity: number;
  highContrast: boolean;
  colorBlindMode: boolean;
  reduceAnimations: boolean;
  largeCoordinates: boolean;
  language: string;
  secondaryLanguage: string;
  autoTranslate: boolean;
  subtitles: boolean;
  pronunciationGuide: boolean;
};

const uiScaleMap: Record<SettingsEffectOptions["uiSize"], number> = {
  sm: 0.92,
  md: 1,
  lg: 1.08,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

class SettingsAudioEngine {
  private context: AudioContext | null = null;
  private unlocked = false;

  private async ensureContext() {
    if (typeof window === "undefined") return null;
    const AudioContextClass =
      window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!this.context) {
      this.context = new AudioContextClass();
    }

    if (this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch (error) {
        console.warn("Impossible de reprendre le contexte audio des paramètres:", error);
      }
    }

    return this.context;
  }

  public async unlock() {
    if (this.unlocked) return;
    const context = await this.ensureContext();
    if (!context) return;

    const unlockWithInteraction = () => {
      void this.ensureContext();
    };

    ["pointerdown", "touchstart", "mousedown", "keydown"].forEach(event =>
      window.addEventListener(event, unlockWithInteraction, { passive: true }),
    );

    setTimeout(() => {
      ["pointerdown", "touchstart", "mousedown", "keydown"].forEach(event =>
        window.removeEventListener(event, unlockWithInteraction),
      );
    }, 2500);

    this.unlocked = true;
  }

  public async playTone(frequency: number, volume: number, duration = 0.25, type: OscillatorType = "sine") {
    const context = await this.ensureContext();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);

    const finalVolume = clamp(volume, 0, 1);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(finalVolume, context.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.0001, context.currentTime + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.05);

    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  public suspend() {
    if (!this.context) return;
    if (this.context.state === "running") {
      void this.context.suspend().catch(() => {});
    }
  }

  public dispose() {
    if (!this.context) return;
    void this.context.close().catch(() => {});
    this.context = null;
    this.unlocked = false;
  }
}

const toneVolume = (raw: number) => clamp(raw / 100, 0, 1);

export const useSettingsEffects = ({
  theme,
  neonIntensity,
  uiSize,
  spectralTrails,
  boardReflections,
  soundEnabled,
  musicVolume,
  effectsVolume,
  voiceVolume,
  vibration,
  hapticsIntensity,
  highContrast,
  colorBlindMode,
  reduceAnimations,
  largeCoordinates,
  language,
  secondaryLanguage,
  autoTranslate,
  subtitles,
  pronunciationGuide,
}: SettingsEffectOptions) => {
  const audioEngineRef = useRef<SettingsAudioEngine | null>(null);
  const previousVolumesRef = useRef({
    music: musicVolume,
    effects: effectsVolume,
    voice: voiceVolume,
    vibration,
    haptics: hapticsIntensity,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;

    root.dataset.voltusTheme = theme;
    body.dataset.voltusTheme = theme;

    const normalizedGlow = clamp(neonIntensity / 100, 0.05, 1.25);
    root.style.setProperty("--neon-intensity", normalizedGlow.toFixed(3));
    root.style.setProperty("--ui-scale", uiScaleMap[uiSize].toString());
    body.style.setProperty("--spectral-trails-opacity", spectralTrails ? "0.8" : "0");
    body.style.setProperty(
      "--board-reflection-strength",
      boardReflections ? Math.max(0.15, normalizedGlow * 0.85).toFixed(2) : "0",
    );
    body.dataset.spectralTrails = spectralTrails ? "on" : "off";
    body.dataset.boardReflections = boardReflections ? "on" : "off";
    body.dataset.highContrast = highContrast ? "on" : "off";
    body.dataset.colorBlind = colorBlindMode ? "on" : "off";
    body.dataset.reduceAnimations = reduceAnimations ? "on" : "off";
    body.dataset.largeCoordinates = largeCoordinates ? "on" : "off";
    body.dataset.autoTranslate = autoTranslate ? "on" : "off";
    body.dataset.subtitles = subtitles ? "on" : "off";
    body.dataset.pronunciationGuide = pronunciationGuide ? "on" : "off";
    body.dataset.secondaryLanguage = secondaryLanguage;

    if (document.documentElement.lang !== language) {
      document.documentElement.lang = language;
    }
  }, [
    theme,
    neonIntensity,
    uiSize,
    spectralTrails,
    boardReflections,
    highContrast,
    colorBlindMode,
    reduceAnimations,
    largeCoordinates,
    autoTranslate,
    subtitles,
    pronunciationGuide,
    secondaryLanguage,
    language,
  ]);

  useEffect(() => {
    if (!soundEnabled) {
      audioEngineRef.current?.suspend();
      return;
    }

    if (!audioEngineRef.current) {
      audioEngineRef.current = new SettingsAudioEngine();
    }

    void audioEngineRef.current.unlock();
  }, [soundEnabled]);

  useEffect(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    if (!audioEngineRef.current) return;

    const engine = audioEngineRef.current;

    if (previousVolumesRef.current.music !== musicVolume) {
      void engine.playTone(220, toneVolume(musicVolume) * 0.35, 0.35, "sine");
      previousVolumesRef.current.music = musicVolume;
    }

    if (previousVolumesRef.current.effects !== effectsVolume) {
      void engine.playTone(520, toneVolume(effectsVolume) * 0.45, 0.22, "triangle");
      previousVolumesRef.current.effects = effectsVolume;
    }

    if (previousVolumesRef.current.voice !== voiceVolume) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Annonce vocale d'essai");
        utterance.volume = clamp(voiceVolume / 100, 0, 1);
        utterance.lang = language;
        window.speechSynthesis.speak(utterance);
      } else {
        void engine.playTone(360, toneVolume(voiceVolume) * 0.3, 0.3, "square");
      }
      previousVolumesRef.current.voice = voiceVolume;
    }
  }, [soundEnabled, musicVolume, effectsVolume, voiceVolume, language]);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    if (!("vibrate" in navigator)) return;

    const previous = previousVolumesRef.current;

    if (vibration && (!previous.vibration || previous.haptics !== hapticsIntensity)) {
      const intensity = clamp(hapticsIntensity, 0, 100);
      const duration = 15 + Math.round((intensity / 100) * 120);
      const pattern = [duration, 40, duration];
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        console.warn("Impossible de déclencher la vibration de prévisualisation:", error);
      }
    }

    previousVolumesRef.current = {
      ...previous,
      vibration,
      haptics: hapticsIntensity,
    };
  }, [vibration, hapticsIntensity]);

  useEffect(() => () => {
    audioEngineRef.current?.dispose();
    audioEngineRef.current = null;
  }, []);
};

export type { SettingsEffectOptions };
