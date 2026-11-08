import { describe, expect, it } from "vitest";
import { GAME_SFX_RECIPES, getSfxVolume } from "./useSoundEffects";

describe("Aichess WebAudio sound design", () => {
  it("provides a quiet playable default instead of muting first-time visitors", () => {
    expect(getSfxVolume()).toBeGreaterThan(0);
    expect(getSfxVolume()).toBeLessThanOrEqual(1);
  });
  it("defines bounded envelopes for every chess event", () => {
    expect(Object.keys(GAME_SFX_RECIPES)).toHaveLength(14);
    for (const [name, recipe] of Object.entries(GAME_SFX_RECIPES)) {
      expect(recipe.tones.length, name).toBeGreaterThan(0);
      for (const voice of [...recipe.tones, ...(recipe.noise ?? [])]) {
        expect(voice.at, name).toBeGreaterThanOrEqual(0);
        expect(voice.duration, name).toBeGreaterThan(0);
        expect(voice.duration, name).toBeLessThan(2);
        expect(voice.level, name).toBeGreaterThan(0);
        expect(voice.level, name).toBeLessThanOrEqual(.5);
      }
    }
  });
  it("makes checkmate distinct from check and captures", () => {
    expect(GAME_SFX_RECIPES.checkmate.tones).not.toEqual(GAME_SFX_RECIPES.check.tones);
    expect(GAME_SFX_RECIPES.check.noise).not.toEqual(GAME_SFX_RECIPES.capture.noise);
  });
});
