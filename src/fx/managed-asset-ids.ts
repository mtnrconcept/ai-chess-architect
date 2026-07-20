export const RULE_ASSET_BUCKET = "rule-assets";
export const RULE_ASSET_PREFIX = "managed";

export type ManagedCinematicMotion = "carry" | "swoop" | "burst";

export interface ManagedCinematicResource {
  resourceId: string;
  motion: ManagedCinematicMotion;
  assetId: string;
  storagePath: string;
}

const MANAGED_CINEMATIC_RESOURCE =
  /^cinematic\.(carry|swoop|burst)\.(asset_[0-9a-f]{40}\.(?:png|jpg|webp))$/;
const MANAGED_ASSET_ID = /^asset_[0-9a-f]{40}\.(?:png|jpg|webp)$/;

export function buildManagedAssetStoragePath(assetId: string): string | null {
  if (!MANAGED_ASSET_ID.test(assetId)) return null;
  return `${RULE_ASSET_PREFIX}/${assetId}`;
}

export function parseManagedCinematicResourceId(
  resourceId: string,
): ManagedCinematicResource | null {
  const match = MANAGED_CINEMATIC_RESOURCE.exec(resourceId);
  if (!match) return null;

  const motion = match[1] as ManagedCinematicMotion;
  const assetId = match[2];
  const storagePath = buildManagedAssetStoragePath(assetId);
  if (!storagePath) return null;

  return {
    resourceId,
    motion,
    assetId,
    storagePath,
  };
}
