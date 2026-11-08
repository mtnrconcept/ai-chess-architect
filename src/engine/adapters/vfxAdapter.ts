import type { AudioId, SpriteId, Tile, VFXAPI } from "../types";
import type { SoundEffect } from "@/hooks/useSoundEffects";
import type { FxIntent, FxPayload } from "@/fx/types";
import { parseManagedCinematicResourceId } from "@/fx/managed-asset-ids";
import { getCatalogGifUrl, playCatalogGifDom } from "@/fx/catalogGif";
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
  private readonly pendingDecals = new Map<Tile, SpriteId>();
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
    const previous = this.fxTrigger;
    this.fxTrigger = trigger;
    if (trigger && previous !== trigger) {
      // Rule effects can fire before the asynchronous Pixi renderer initializes.
      // Rehydrate persistent decals on first mount or renderer recreation.
      for (const [tile, spriteId] of this.pendingDecals) {
        const intent = this.mapSpriteToIntent(spriteId);
        if (!intent) continue;
        void trigger([intent], { cell: tile }).catch((error: unknown) => {
          console.warn("[VFXAdapter] decal rehydration skipped", error);
        });
      }
    }
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
    this.pendingDecals.set(tile, spriteId);
    this.decalCallbacks.spawn?.(spriteId, tile);
    // The React state mirror is not a replacement for the Pixi renderer.
    // Both consumers must receive the same authoritative decal event.
    if (this.fxTrigger) {
      const intent = this.mapSpriteToIntent(spriteId);
      if (intent) {
        void this.fxTrigger([intent], { cell: tile }).catch(
          (error: unknown) => {
            console.warn("[VFXAdapter] decal FX skipped", error);
          },
        );
      }
    }
  }

  clearDecal(tile: Tile): void {
    this.pendingDecals.delete(tile);
    this.decalCallbacks.clear?.(tile);
    // Persistent Pixi decals must disappear when the authoritative rule state
    // removes a mine/hazard, not after a cosmetic animation timeout.
    if (this.fxTrigger) {
      void this.fxTrigger([{ intent: "object.clear" }], { cell: tile }).catch(
        (error: unknown) => {
          console.warn("[VFXAdapter] decal cleanup skipped", error);
        },
      );
    }
  }

  playAnimation(spriteId: SpriteId, tile: Tile): void {
    if (getCatalogGifUrl(spriteId)) {
      void playCatalogGifDom(spriteId, tile).catch((error: unknown) => {
        console.warn("[VFXAdapter] catalog GIF skipped, procedural fallback", error);
        void this.playProceduralFallback(spriteId, tile);
      });
      this.animationCallback?.(spriteId, tile);
      return;
    }
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
      sink: "quicksand-capture",
      sand: "quicksand-place",
      quicksand: "quicksand-capture",
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
    // Dedicated visual language for sand traps: amber ripples persist on the
    // square, whereas the sinking splash is a short particle burst.
    if (/quicksand|sable.mouvant|sand.trap/.test(normalized)) {
      if (/splash|sink|burst|trigger/.test(normalized)) {
        return { intent: "combat.hit", power: "large", style: { color: "#e8b866", glow: "#ffd98c", sparks: true } };
      }
      return { intent: "object.spawn", kind: "quicksand" };
    }
    // Bounded, license-free GPU effects inferred from descriptive sprite IDs.
    if (/fire|flame|magma|lava|incendi|brasier/.test(normalized)) {
      return { intent: "combat.burn", power: "large", style: { color: "#ff833f", sparks: true, smoke: "light" } };
    }
    if (/lightning|electr|foudre|eclair|éclair|orage/.test(normalized)) {
      return { intent: "combat.hit", power: "large", style: { color: "#d0a5ff", glow: "#e4caff", sparks: true } };
    }
    if (/poison|venom|venin|toxic|acid/.test(normalized)) {
      return { intent: "combat.burn", power: "medium", style: { color: "#89df81", glow: "#b9f28d", sparks: true } };
    }
    if (/heal|soin|regen|protect|shield|bouclier|armure/.test(normalized)) {
      return { intent: "viz.highlight", style: { color: "#8fe5aa", glow: "#b6ffe2", ring: true } };
    }
    if (/nature|forest|forêt|leaf|plante|vigne/.test(normalized)) {
      return { intent: "viz.hologram", style: { color: "#9dd877", glow: "#e5ffc1" } };
    }
    if (/shadow|spectre|phantom|ghost|ombre/.test(normalized)) {
      return { intent: "viz.hologram", style: { color: "#a38de5", glow: "#d4c0ff" } };
    }
    if (/water|wave|flood|vague|tsunami|tempête/.test(normalized)) {
      return { intent: "area.hazard", kind: "field", radius: 1.2, style: { color: "#6cb6ff", pulse: true } };
    }
    if (/dragon|phoenix|phénix|meteor|météore/.test(normalized)) {
      return { intent: "combat.explosion", power: "large", style: { color: "#ffb86b", sparks: true } };
    }
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
