import type { AudioId, SpriteId, Tile, VFXAPI } from "../types";
import type { SoundEffect } from "@/hooks/useSoundEffects";
import type { FxIntent, FxPayload } from "@/fx/types";
import { parseManagedCinematicResourceId } from "@/fx/managed-asset-ids";
import {
  playManagedCinematicDom,
  playProceduralCinematicDom,
} from "@/fx/dom-managed-cinematic";

export class VFXAdapter implements VFXAPI {
  private playSoundCallback?: (effect: SoundEffect) => void;
  private decalCallbacks: {
    spawn?: (spriteId: SpriteId, tile: Tile) => void;
    clear?: (tile: Tile) => void;
  } = {};
  private animationCallback?: (spriteId: SpriteId, tile: Tile) => void;
  private fxTrigger?: (
    intents: FxIntent[] | undefined,
    payload?: FxPayload,
  ) => Promise<void>;

  setFxTrigger(
    trigger?: (
      intents: FxIntent[] | undefined,
      payload?: FxPayload,
    ) => Promise<void>,
  ): void {
    this.fxTrigger = trigger;
  }

  setPlaySoundCallback(callback?: (effect: SoundEffect) => void): void {
    this.playSoundCallback = callback;
  }

  setDecalCallbacks(callbacks: {
    spawn?: (spriteId: SpriteId, tile: Tile) => void;
    clear?: (tile: Tile) => void;
  }): void {
    this.decalCallbacks = callbacks;
  }

  setAnimationCallback(
    callback?: (spriteId: SpriteId, tile: Tile) => void,
  ): void {
    this.animationCallback = callback;
  }

  spawnDecal(spriteId: SpriteId, tile: Tile): void {
    this.decalCallbacks.spawn?.(spriteId, tile);
    if (!this.decalCallbacks.spawn && this.fxTrigger) {
      const intent = this.mapSpriteToIntent(spriteId);
      if (intent) {
        void this.fxTrigger([intent], { cell: tile }).catch((error: unknown) => {
          console.warn("[VFXAdapter] decal FX skipped", error);
        });
      }
    }
  }

  clearDecal(tile: Tile): void {
    this.decalCallbacks.clear?.(tile);
  }

  playAnimation(spriteId: SpriteId, tile: Tile): void {
    const managed = parseManagedCinematicResourceId(spriteId);
    if (managed) {
      void playManagedCinematicDom(managed.resourceId, tile).catch(
        (error: unknown) => {
          console.warn("[VFXAdapter] managed cinematic skipped", error);
        },
      );
      this.animationCallback?.(spriteId, tile);
      return;
    }

    const intent = this.mapSpriteToIntent(spriteId);
    if (this.fxTrigger && intent) {
      void this.fxTrigger([intent], { cell: tile }).catch((error: unknown) => {
        console.warn("[VFXAdapter] Pixi FX skipped; using DOM fallback", error);
        void this.playProceduralFallback(spriteId, tile);
      });
    } else {
      void this.playProceduralFallback(spriteId, tile);
    }
    this.animationCallback?.(spriteId, tile);
  }

  playAudio(audioId: AudioId): void {
    if (!this.playSoundCallback) return;
    const mapping: Record<string, SoundEffect> = {
      boom: "explosion",
      explosion: "explosion",
      freeze: "check",
      missile: "capture",
      trap: "mine-detonation",
      mine: "mine-detonation",
      spawn: "capture",
      cloaking: "check",
      capture: "capture",
      move: "move",
    };
    this.playSoundCallback(mapping[String(audioId)] ?? "move");
  }

  private async playProceduralFallback(
    spriteId: SpriteId,
    tile: Tile,
  ): Promise<void> {
    const normalized = String(spriteId).toLowerCase();
    const motion = /explosion|burst|boom|mine/.test(normalized)
      ? "burst"
      : /dragon|carry|capture|grab|emport/.test(normalized)
        ? "carry"
        : "swoop";
    await playProceduralCinematicDom(motion, tile);
  }

  private mapSpriteToIntent(spriteId: SpriteId): FxIntent | null {
    const normalized = String(spriteId).toLowerCase();
    if (/explosion|boom|burst/.test(normalized)) {
      return { intent: "combat.explosion", power: "medium" };
    }
    if (/freeze|ice|gel/.test(normalized)) {
      return { intent: "combat.freeze" };
    }
    if (/mine|trap|sable/.test(normalized)) {
      return { intent: "object.spawn", kind: "mine" };
    }
    if (/hologram|phantom|ghost/.test(normalized)) {
      return { intent: "viz.hologram" };
    }
    if (/warp|portal|teleport/.test(normalized)) {
      return { intent: "space.warp", mode: "blink" };
    }
    return null;
  }
}
