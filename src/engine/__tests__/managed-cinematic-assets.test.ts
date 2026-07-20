import { describe, expect, it } from "vitest";
import {
  buildManagedAssetStoragePath,
  parseManagedCinematicResourceId,
} from "@/fx/managed-asset-ids";

const HASH = "0123456789abcdef0123456789abcdef01234567";

describe("managed cinematic asset identifiers", () => {
  it("parses an opaque carry resource", () => {
    const parsed = parseManagedCinematicResourceId(
      `cinematic.carry.asset_${HASH}.png`,
    );

    expect(parsed).toEqual({
      resourceId: `cinematic.carry.asset_${HASH}.png`,
      motion: "carry",
      assetId: `asset_${HASH}.png`,
      storagePath: `managed/asset_${HASH}.png`,
    });
  });

  it("rejects URLs, traversal and unknown presets", () => {
    expect(parseManagedCinematicResourceId("https://example.com/a.png")).toBeNull();
    expect(
      parseManagedCinematicResourceId(
        `cinematic.carry.asset_${HASH}.png/../../secret`,
      ),
    ).toBeNull();
    expect(
      parseManagedCinematicResourceId(`cinematic.script.asset_${HASH}.png`),
    ).toBeNull();
  });

  it("builds only the fixed managed storage path", () => {
    expect(buildManagedAssetStoragePath(`asset_${HASH}.webp`)).toBe(
      `managed/asset_${HASH}.webp`,
    );
    expect(buildManagedAssetStoragePath("../asset.png")).toBeNull();
  });
});
