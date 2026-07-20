import type { AudioId, SpriteId, Tile, VFXAPI } from "../types";
import type { FxIntent, FxPayload } from "@/fx/types";
import type { SoundEffect } from "@/hooks/useSoundEffects";
import type {
  PresentationEvent,
  PresentationEventPayload,
  RulePresentationManifestV1,
} from "@/rule-presentation/types";

export class VFXAdapter implements VFXAPI {
  private playSoundCallback?: (effect: SoundEffect) => void;
  private readonly decalCallbacks: {
    spawn?: (spriteId: SpriteId, tile: Tile) => void;
    clear?: (tile: Tile) => void;
  } = {};
  private animationCallback?: (spriteId: SpriteId, tile: Tile) => void;
  private fxTrigger?: (
    intents: FxIntent[] | undefined,
    payload?: FxPayload,
  ) => Promise<void>;
  private presentationManifests: RulePresentationManifestV1[] = [];

  setFxTrigger(
    trigger: (
      intents: FxIntent[] | undefined,
      payload?: FxPayload,
    ) => Promise<void>,
  ): void {
    this.fxTrigger = trigger;
  }

  setPresentationManifests(
    manifests: readonly RulePresentationManifestV1[],
  ): void {
    this.presentationManifests = manifests.map((manifest) => ({
      ...manifest,
      sequences: manifest.sequences.map((sequence) => ({ ...sequence })),
      assets: manifest.assets.map((asset) => ({ ...asset })),
    }));
  }

  playPresentationEvent(
    event: PresentationEvent,
    payload: PresentationEventPayload,
  ): void {
    if (!this.fxTrigger) return;

    const intents: FxIntent[] = [];
    for (const manifest of this.presentationManifests) {
      if (!manifest.enabled) continue;

      for (const sequence of manifest.sequences) {
        if (sequence.event !== event) continue;

        const asset = sequence.assetRequestId
          ? manifest.assets.find(
              (candidate) =>
                candidate.requestId === sequence.assetRequestId &&
                candidate.visualId === sequence.visualId,
            )
          : manifest.assets.find(
              (candidate) => candidate.visualId === sequence.visualId,
            );

        intents.push({
          intent: "presentation.sprite",
          preset: sequence.preset,
          assetUrl:
            asset?.status === "ready" && asset.publicUrl
              ? asset.publicUrl
              : null,
          durationMs: sequence.durationMs,
          scale: sequence.scale,
          direction: sequence.direction,
          zIndex: sequence.zIndex,
          fallback: asset?.fallback ?? sequence.reducedMotionFallback,
        });
      }
    }

    if (intents.length === 0) return;

    void this.fxTrigger(intents, {
      cell: payload.tile,
      fromCell: payload.fromTile,
      toCell: payload.tile,
      capturedPieceType: payload.capturedPieceType,
      capturedPieceColor: payload.capturedPieceColor,
      promotedPieceType: payload.promotedPieceType,
    }).catch(() => {
      console.error("[VFXAdapter] Presentation FX failed.");
    });
  }

  setPlaySoundCallback(callback: (effect: SoundEffect) => void): void {
    this.playSoundCallback = callback;
  }

  setDecalCallbacks(callbacks: {
    spawn?: (spriteId: SpriteId, tile: Tile) => void;
    clear?: (tile: Tile) => void;
  }): void {
    this.decalCallbacks.spawn = callbacks.spawn;
    this.decalCallbacks.clear = callbacks.clear;
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
    if (this.fxTrigger) {
      const intent = this.mapSpriteToFxIntent(spriteId);
      if (intent) {
        void this.fxTrigger([intent], { cell: tile }).catch(() => {
          console.error("[VFXAdapter] Built-in FX failed.");
        });
      }
    }

    this.animationCallback?.(spriteId, tile);
  }

  private mapSpriteToFxIntent(spriteId: SpriteId): FxIntent | null {
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
