import { VFXAPI, SpriteId, AudioId, Tile } from '../types';
import { SoundEffect } from '@/hooks/useSoundEffects';

export class VFXAdapter implements VFXAPI {
  private playSoundCallback?: (effect: SoundEffect) => void;
  private decalCallbacks: {
    spawn?: (spriteId: SpriteId, tile: Tile) => void;
    clear?: (tile: Tile) => void;
  };
  private animationCallback?: (spriteId: SpriteId, tile: Tile) => void;

  constructor() {
    this.decalCallbacks = {};
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
    if (this.animationCallback) {
      this.animationCallback(spriteId, tile);
    }
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
