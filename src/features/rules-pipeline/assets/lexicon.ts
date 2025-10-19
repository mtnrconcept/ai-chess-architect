export type AssetBinding = {
  vfx: string[];
  sfx: string[];
};

export const assetLexicon: Record<string, AssetBinding> = {
  freeze: { vfx: ["ice_trail", "ice_burst"], sfx: ["ice_cast", "freeze_pop"] },
  mine: { vfx: ["mine_arm", "mine_blast"], sfx: ["arm_click", "boom_heavy"] },
  glue: { vfx: ["goo_splash"], sfx: ["sticky"] },
  quicksand: { vfx: ["sand_swirl"], sfx: ["rustle"] },
  teleport: { vfx: ["warp_blink"], sfx: ["warp"] },
  swap: { vfx: ["swap_spin"], sfx: ["whoosh"] },
  morph: { vfx: ["morph_flash"], sfx: ["transmute"] },
  wall: { vfx: ["wall_raise"], sfx: ["stone_growl"] },
  dynamite: {
    vfx: ["dynamite_warn", "dynamite_boom"],
    sfx: ["fuse", "explosion"],
  },
};

export const resolveAssets = (keywords: string[]): AssetBinding => {
  const aggregate: AssetBinding = { vfx: [], sfx: [] };
  keywords.forEach((keyword) => {
    const binding = assetLexicon[keyword];
    if (binding) {
      aggregate.vfx.push(...binding.vfx);
      aggregate.sfx.push(...binding.sfx);
    }
  });
  return {
    vfx: Array.from(new Set(aggregate.vfx)),
    sfx: Array.from(new Set(aggregate.sfx)),
  };
};
