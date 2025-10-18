import { VFXAPI, SpriteId, AudioId, Tile } from '../types';
import { SoundEffect } from '@/hooks/useSoundEffects';
import type { FxIntent, FxPayload } from '@/fx/types';

export class VFXAdapter implements VFXAPI {
  private playSoundCallback?: (effect: SoundEffect) => void;
  private decalCallbacks: {
    spawn?: (spriteId: SpriteId, tile: Tile) => void;
    clear?: (tile: Tile) => void;
  };
  private animationCallback?: (spriteId: SpriteId, tile: Tile) => void;
  private fxTrigger?: (intents: FxIntent[] | undefined, payload?: FxPayload) => Promise<void>;

  constructor() {
    this.decalCallbacks = {};
  }

  setFxTrigger(trigger: (intents: FxIntent[] | undefined, payload?: FxPayload) => Promise<void>): void {
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

  setAnimationCallback(callback: (spriteId: SpriteId, tile: Tile) => void): void {
    this.animationCallback = callback;
  }

  spawnDecal(spriteId: SpriteId, tile: Tile): void {
    if (this.decalCallbacks.spawn) {
      this.decalCallbacks.spawn(spriteId, tile);
    }
  }

  clearDecal(tile: Tile): void {
    if (this.decalCallbacks.clear) {
      this.decalCallbacks.clear(tile);
    }
  }

  playAnimation(spriteId: SpriteId, tile: Tile): void {
    // Phase 4: Déclencher via FxContext si disponible
    if (this.fxTrigger) {
      const intent = this.mapSpriteToFxIntent(spriteId);
      if (intent) {
        this.fxTrigger([intent], { cell: tile }).catch(err => {
          console.error('[VFXAdapter] Failed to trigger FX', err);
        });
      }
    }
    
    if (this.animationCallback) {
      this.animationCallback(spriteId, tile);
    }
  }

  private mapSpriteToFxIntent(spriteId: SpriteId): FxIntent | null {
    // Mapper les sprites du moteur vers les intents FX
    const mapping: Record<string, FxIntent> = {
      'explosion': { intent: 'combat.explosion', power: 'medium' },
      'freeze': { intent: 'combat.freeze' },
      'mine': { intent: 'object.spawn', kind: 'mine' },
      'hologram': { intent: 'viz.hologram' },
      'warp': { intent: 'space.warp', mode: 'blink' },
    };
    
    return mapping[spriteId] || null;
  }

  playAudio(audioId: AudioId): void {
    if (this.playSoundCallback) {
      const soundMap: Record<string, SoundEffect> = {
        'boom': 'explosion',
        'freeze': 'check',
        'missile': 'capture',
        'trap': 'mine-detonation',
        'spawn': 'capture',
        'cloaking': 'check'
      };

      const effect = soundMap[audioId] || 'move';
      this.playSoundCallback(effect);
    }
  }
}
