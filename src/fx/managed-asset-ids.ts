export const RULE_ASSET_BUCKET = "rule-assets";
export const RULE_ASSET_PREFIX = "managed";

export type ManagedCinematicMotion = "carry" | "swoop" | "burst";

export interface ManagedCinematicResource {
  resourceId: string;
  motion: ManagedCinematicMotion;
  assetId: string;
  storagePath: string;
}

const MANAGED_RESOURCE_PATTERN =
  /^cinematic\.(carry|swoop|burst)\.(asset_[0-9a-f]{40}\.(?:png|jpg|webp))$/;
const MANAGED_ASSET_PATTERN = /^asset_[0-9a-f]{40}\.(?:png|jpg|webp)$/;

export function buildManagedAssetStoragePath(assetId: string): string | null {
  return MANAGED_ASSET_PATTERN.test(assetId)
    ? `${RULE_ASSET_PREFIX}/${assetId}`
    : null;
}

export function parseManagedCinematicResourceId(
  resourceId: string,
): ManagedCinematicResource | null {
  const match = MANAGED_RESOURCE_PATTERN.exec(String(resourceId));
  if (!match) return null;
  const assetId = match[2];
  const storagePath = buildManagedAssetStoragePath(assetId);
  if (!storagePath) return null;
  return {
    resourceId,
    motion: match[1] as ManagedCinematicMotion,
    assetId,
    storagePath,
  };
}
