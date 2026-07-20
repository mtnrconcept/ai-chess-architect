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
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const STORAGE_PATH_PATTERN =
  /^\/storage\/v1\/object\/public\/rule-assets-public\/v1\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(?:jpg|png|webp)$/;
const SUPABASE_HOST_PATTERN = /^[a-z0-9]{15,40}\.supabase\.co$/;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LICENSES = new Set(["cc0", "pdm"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isTrustedRuleAssetUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 600) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      SUPABASE_HOST_PATTERN.test(url.hostname) &&
      !url.pathname.includes("%") &&
      STORAGE_PATH_PATTERN.test(url.pathname)
    );
  } catch {
    return false;
  }
};

const parseSequence = (value: unknown): PresentationSequenceV1 | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !IDENTIFIER_PATTERN.test(value.id) ||
    typeof value.visualId !== "string" ||
    !IDENTIFIER_PATTERN.test(value.visualId) ||
    typeof value.assetRequestId !== "string" ||
    (value.assetRequestId !== "" && !IDENTIFIER_PATTERN.test(value.assetRequestId)) ||
    typeof value.event !== "string" ||
    !PRESENTATION_EVENTS.includes(value.event as PresentationSequenceV1["event"]) ||
    typeof value.preset !== "string" ||
    !PRESENTATION_PRESETS.includes(value.preset as PresentationSequenceV1["preset"]) ||
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
  if (!isRecord(value)) return null;
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
    typeof value.attribution !== "string" ||
    value.attribution.length < 1 ||
    value.attribution.length > 500
  ) {
    return null;
  }

  if (value.status === "ready") {
    if (
      value.provider !== "openverse" ||
      typeof value.providerAssetId !== "string" ||
      typeof value.storageBucket !== "string" ||
      value.storageBucket !== "rule-assets-public" ||
      typeof value.storagePath !== "string" ||
      !/^v1\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(?:jpg|png|webp)$/.test(
        value.storagePath,
      ) ||
      !isTrustedRuleAssetUrl(value.publicUrl) ||
      typeof value.mimeType !== "string" ||
      !MIME_TYPES.has(value.mimeType) ||
      typeof value.byteSize !== "number" ||
      !Number.isInteger(value.byteSize) ||
      value.byteSize < 1 ||
      value.byteSize > 2 * 1024 * 1024 ||
      typeof value.sha256 !== "string" ||
      !SHA256_PATTERN.test(value.sha256) ||
      typeof value.license !== "string" ||
      !LICENSES.has(value.license)
    ) {
      return null;
    }
  } else if (
    value.provider !== "builtin" ||
    value.publicUrl !== null ||
    value.storagePath !== null ||
    value.sha256 !== null ||
    value.license !== "builtin"
  ) {
    return null;
  }

  return value as unknown as ResolvedPresentationAsset;
};

export const parseRulePresentationManifest = (
  value: unknown,
): RulePresentationManifestV1 | null => {
  if (!isRecord(value)) return null;
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
  if (sequences.some((item) => item === null) || assets.some((item) => item === null)) {
    return null;
  }

  const safeSequences = sequences as PresentationSequenceV1[];
  const safeAssets = assets as ResolvedPresentationAsset[];
  const requestIds = new Set(safeAssets.map((asset) => asset.requestId));
  if (
    safeSequences.some(
      (sequence) =>
        sequence.assetRequestId !== "" && !requestIds.has(sequence.assetRequestId),
    )
  ) {
    return null;
  }
  if (!value.enabled && (safeSequences.length > 0 || safeAssets.length > 0)) {
    return null;
  }

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
