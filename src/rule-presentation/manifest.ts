import type { RuleJSON } from "@/engine/types";
import {
  PRESENTATION_DIRECTIONS,
  PRESENTATION_EVENTS,
  PRESENTATION_FALLBACKS,
  PRESENTATION_PRESETS,
  type PresentationSequenceV1,
  type ResolvedPresentationAsset,
  type RulePresentationManifestV1,
} from "./types";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]{1,49}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const STORAGE_PATH_PATTERN =
  /^v1\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{64})\.(jpg|png|webp)$/i;
const SUPABASE_HOST_PATTERN = /^[a-z0-9]{15,40}\.supabase\.co$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LICENSES = new Set(["cc0", "pdm"]);

const MANIFEST_KEYS = [
  "schemaVersion",
  "contentHash",
  "enabled",
  "sequences",
  "assets",
] as const;
const SEQUENCE_KEYS = [
  "id",
  "event",
  "visualId",
  "preset",
  "assetRequestId",
  "durationMs",
  "scale",
  "direction",
  "zIndex",
  "reducedMotionFallback",
] as const;
const ASSET_KEYS = [
  "requestId",
  "visualId",
  "status",
  "provider",
  "providerAssetId",
  "storageBucket",
  "storagePath",
  "publicUrl",
  "mimeType",
  "byteSize",
  "sha256",
  "license",
  "licenseUrl",
  "attribution",
  "landingUrl",
  "fallback",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
};

const isNull = (value: unknown): value is null => value === null;

const safeText = (value: unknown, maximum: number): value is string =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= maximum &&
  !CONTROL_CHARACTERS.test(value);

const expectedLicenseUrl = (license: "cc0" | "pdm"): string =>
  license === "cc0"
    ? "https://creativecommons.org/publicdomain/zero/1.0/"
    : "https://creativecommons.org/publicdomain/mark/1.0/";

const isTrustedOpenverseLandingUrl = (
  value: unknown,
  providerAssetId: string,
): value is string => {
  if (typeof value !== "string" || !UUID_PATTERN.test(providerAssetId)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.origin === "https://api.openverse.org" &&
      url.pathname === `/v1/images/${providerAssetId}/` &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

export const isTrustedRuleAssetUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 600) return false;
  try {
    const url = new URL(value);
    const storagePrefix =
      "/storage/v1/object/public/rule-assets-public/";
    const storagePath = url.pathname.startsWith(storagePrefix)
      ? url.pathname.slice(storagePrefix.length)
      : "";
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      SUPABASE_HOST_PATTERN.test(url.hostname) &&
      !url.pathname.includes("%") &&
      STORAGE_PATH_PATTERN.test(storagePath)
    );
  } catch {
    return false;
  }
};

const parseSequence = (value: unknown): PresentationSequenceV1 | null => {
  if (!isRecord(value) || !hasExactKeys(value, SEQUENCE_KEYS)) return null;
  if (
    typeof value.id !== "string" ||
    !IDENTIFIER_PATTERN.test(value.id) ||
    typeof value.visualId !== "string" ||
    !IDENTIFIER_PATTERN.test(value.visualId) ||
    typeof value.assetRequestId !== "string" ||
    (value.assetRequestId !== "" &&
      !IDENTIFIER_PATTERN.test(value.assetRequestId)) ||
    typeof value.event !== "string" ||
    !PRESENTATION_EVENTS.includes(
      value.event as PresentationSequenceV1["event"],
    ) ||
    typeof value.preset !== "string" ||
    !PRESENTATION_PRESETS.includes(
      value.preset as PresentationSequenceV1["preset"],
    ) ||
    typeof value.direction !== "string" ||
    !PRESENTATION_DIRECTIONS.includes(
      value.direction as PresentationSequenceV1["direction"],
    ) ||
    typeof value.reducedMotionFallback !== "string" ||
    !PRESENTATION_FALLBACKS.includes(
      value.reducedMotionFallback as PresentationSequenceV1["reducedMotionFallback"],
    ) ||
    typeof value.durationMs !== "number" ||
    !Number.isInteger(value.durationMs) ||
    value.durationMs < 200 ||
    value.durationMs > 5000 ||
    typeof value.scale !== "number" ||
    !Number.isFinite(value.scale) ||
    value.scale < 0.25 ||
    value.scale > 4 ||
    typeof value.zIndex !== "number" ||
    !Number.isInteger(value.zIndex) ||
    value.zIndex < 1 ||
    value.zIndex > 20
  ) {
    return null;
  }

  return {
    id: value.id,
    event: value.event as PresentationSequenceV1["event"],
    visualId: value.visualId,
    preset: value.preset as PresentationSequenceV1["preset"],
    assetRequestId: value.assetRequestId,
    durationMs: value.durationMs,
    scale: value.scale,
    direction: value.direction as PresentationSequenceV1["direction"],
    zIndex: value.zIndex,
    reducedMotionFallback:
      value.reducedMotionFallback as PresentationSequenceV1["reducedMotionFallback"],
  };
};

const parseAsset = (value: unknown): ResolvedPresentationAsset | null => {
  if (!isRecord(value) || !hasExactKeys(value, ASSET_KEYS)) return null;
  if (
    typeof value.requestId !== "string" ||
    !IDENTIFIER_PATTERN.test(value.requestId) ||
    typeof value.visualId !== "string" ||
    !IDENTIFIER_PATTERN.test(value.visualId) ||
    typeof value.status !== "string" ||
    !["ready", "fallback"].includes(value.status) ||
    typeof value.provider !== "string" ||
    !["openverse", "builtin"].includes(value.provider) ||
    typeof value.fallback !== "string" ||
    !PRESENTATION_FALLBACKS.includes(
      value.fallback as ResolvedPresentationAsset["fallback"],
    ) ||
    !safeText(value.attribution, 500)
  ) {
    return null;
  }

  if (value.status === "ready") {
    if (
      value.provider !== "openverse" ||
      typeof value.providerAssetId !== "string" ||
      !UUID_PATTERN.test(value.providerAssetId) ||
      value.storageBucket !== "rule-assets-public" ||
      typeof value.storagePath !== "string" ||
      !STORAGE_PATH_PATTERN.test(value.storagePath) ||
      !isTrustedRuleAssetUrl(value.publicUrl) ||
      new URL(value.publicUrl).pathname !==
        `/storage/v1/object/public/rule-assets-public/${value.storagePath}` ||
      typeof value.mimeType !== "string" ||
      !MIME_TYPES.has(value.mimeType) ||
      typeof value.byteSize !== "number" ||
      !Number.isInteger(value.byteSize) ||
      value.byteSize < 1 ||
      value.byteSize > 2 * 1024 * 1024 ||
      typeof value.sha256 !== "string" ||
      !SHA256_PATTERN.test(value.sha256) ||
      !value.storagePath.includes(value.sha256) ||
      typeof value.license !== "string" ||
      !LICENSES.has(value.license) ||
      value.licenseUrl !==
        expectedLicenseUrl(value.license as "cc0" | "pdm") ||
      !isTrustedOpenverseLandingUrl(
        value.landingUrl,
        value.providerAssetId,
      )
    ) {
      return null;
    }

    const extension = value.storagePath.split(".").pop();
    const expectedMime =
      extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : "image/jpeg";
    if (value.mimeType !== expectedMime) return null;
  } else if (
    value.provider !== "builtin" ||
    !isNull(value.providerAssetId) ||
    !isNull(value.storageBucket) ||
    !isNull(value.storagePath) ||
    !isNull(value.publicUrl) ||
    !isNull(value.mimeType) ||
    !isNull(value.byteSize) ||
    !isNull(value.sha256) ||
    value.license !== "builtin" ||
    !isNull(value.licenseUrl) ||
    !isNull(value.landingUrl)
  ) {
    return null;
  }

  return {
    requestId: value.requestId,
    visualId: value.visualId,
    status: value.status as ResolvedPresentationAsset["status"],
    provider: value.provider as ResolvedPresentationAsset["provider"],
    providerAssetId: value.providerAssetId as string | null,
    storageBucket: value.storageBucket as string | null,
    storagePath: value.storagePath as string | null,
    publicUrl: value.publicUrl as string | null,
    mimeType: value.mimeType as string | null,
    byteSize: value.byteSize as number | null,
    sha256: value.sha256 as string | null,
    license: value.license as ResolvedPresentationAsset["license"],
    licenseUrl: value.licenseUrl as string | null,
    attribution: value.attribution,
    landingUrl: value.landingUrl as string | null,
    fallback: value.fallback as ResolvedPresentationAsset["fallback"],
  };
};

export const parseRulePresentationManifest = (
  value: unknown,
): RulePresentationManifestV1 | null => {
  if (!isRecord(value) || !hasExactKeys(value, MANIFEST_KEYS)) return null;
  if (
    value.schemaVersion !== "1.0.0" ||
    typeof value.contentHash !== "string" ||
    !SHA256_PATTERN.test(value.contentHash) ||
    typeof value.enabled !== "boolean" ||
    !Array.isArray(value.sequences) ||
    value.sequences.length > 8 ||
    !Array.isArray(value.assets) ||
    value.assets.length > 4
  ) {
    return null;
  }

  const sequences = value.sequences.map(parseSequence);
  const assets = value.assets.map(parseAsset);
  if (
    sequences.some((item) => item === null) ||
    assets.some((item) => item === null)
  ) {
    return null;
  }

  const safeSequences = sequences as PresentationSequenceV1[];
  const safeAssets = assets as ResolvedPresentationAsset[];
  const sequenceIds = new Set<string>();
  const requestIds = new Set<string>();
  const assetsByRequest = new Map<string, ResolvedPresentationAsset>();

  for (const sequence of safeSequences) {
    if (sequenceIds.has(sequence.id)) return null;
    sequenceIds.add(sequence.id);
  }
  for (const asset of safeAssets) {
    if (requestIds.has(asset.requestId)) return null;
    requestIds.add(asset.requestId);
    assetsByRequest.set(asset.requestId, asset);
  }

  if (
    safeSequences.some((sequence) => {
      if (sequence.assetRequestId === "") return false;
      const asset = assetsByRequest.get(sequence.assetRequestId);
      return !asset || asset.visualId !== sequence.visualId;
    })
  ) {
    return null;
  }
  if (!value.enabled && (safeSequences.length > 0 || safeAssets.length > 0)) {
    return null;
  }
  if (value.enabled && safeSequences.length === 0) return null;

  return {
    schemaVersion: "1.0.0",
    contentHash: value.contentHash,
    enabled: value.enabled,
    sequences: safeSequences,
    assets: safeAssets,
  };
};

export const extractRulePresentationManifests = (
  rules: readonly RuleJSON[],
): RulePresentationManifestV1[] => {
  const manifests: RulePresentationManifestV1[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const assets = isRecord(rule.assets) ? rule.assets : null;
    const manifest = parseRulePresentationManifest(assets?.presentation);
    if (!manifest || !manifest.enabled || seen.has(manifest.contentHash)) continue;
    seen.add(manifest.contentHash);
    manifests.push(manifest);
  }
  return manifests;
};
