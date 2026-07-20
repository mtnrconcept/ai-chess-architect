import type { AudioId, SpriteId, Tile, VFXAPI } from "../types";
import type { SoundEffect } from "@/hooks/useSoundEffects";
import type { FxIntent, FxPayload } from "@/fx/types";
import { parseManagedCinematicResourceId } from "@/fx/managed-asset-ids";
import { playManagedCinematicDom } from "@/fx/dom-managed-cinematic";

export class VFXAdapter implements VFXAPI {
  private playSoundCallback?: (effect: SoundEffect) => void;
  private decalCallbacks: {
    spawn?: (spriteId: SpriteId, tile: Tile) => void;
    clear?: (tile: Tile) => void;
  };
  private animationCallback?: (spriteId: SpriteId, tile: Tile) => void;
  private fxTrigger?: (
    intents: FxIntent[] | undefined,
    payload?: FxPayload,
  ) => Promise<void>;

  constructor() {
    this.decalCallbacks = {};
  }

  setFxTrigger(
    trigger?: (
      intents: FxIntent[] | undefined,
      payload?: FxPayload,
    ) => Promise<void>,
  ): void {
    this.fxTrigger = trigger;
  }

  setPlaySoundCallback(callback: (effect: SoundEffect) => void): void {
    this.playSoundCallback = callback;
  }

  setDecalCallbacks(callbacks: {
    spawn?: (spriteId: SpriteId, tile: Tile) => void;
    clear?: (tile: Tile) => void;
  }): void {
    this.decalCallbacks = callbacks;
  }

  setAnimationCallback(
    callback: (spriteId: SpriteId, tile: Tile) => void,
  ): void {
    this.animationCallback = callback;
  }

  spawnDecal(spriteId: SpriteId, tile: Tile): void {
    this.decalCallbacks.spawn?.(spriteId, tile);
  }

  clearDecal(tile: Tile): void {
    this.decalCallbacks.clear?.(tile);
  }

  playAnimation(spriteId: SpriteId, tile: Tile): void {
    const managed = parseManagedCinematicResourceId(spriteId);
    if (managed) {
      void playManagedCinematicDom(managed.resourceId, tile).catch(
        (error: unknown) => {
          console.warn("[VFXAdapter] Managed cinematic skipped", error);
        },
      );
      this.animationCallback?.(spriteId, tile);
      return;
    }

    const intent = this.mapBuiltInSpriteToFxIntent(spriteId);
    if (this.fxTrigger && intent) {
      this.fxTrigger([intent], { cell: tile }).catch((error: unknown) => {
        console.error("[VFXAdapter] Failed to trigger FX", error);
      });
    }

    this.animationCallback?.(spriteId, tile);
  }

  private mapBuiltInSpriteToFxIntent(spriteId: SpriteId): FxIntent | null {
    const mapping: Record<string, FxIntent> = {
      explosion: { intent: "combat.explosion", power: "medium" },
      freeze: { intent: "combat.freeze" },
      mine: { intent: "object.spawn", kind: "mine" },
      hologram: { intent: "viz.hologram" },
      warp: { intent: "space.warp", mode: "blink" },
    };

    return mapping[spriteId] ?? null;
  }

  playAudio(audioId: AudioId): void {
    if (!this.playSoundCallback) return;

    const soundMap: Record<string, SoundEffect> = {
      boom: "explosion",
      freeze: "check",
      missile: "capture",
      trap: "mine-detonation",
      spawn: "capture",
      cloaking: "check",
    };

    this.playSoundCallback(soundMap[audioId] ?? "move");
  }
}
