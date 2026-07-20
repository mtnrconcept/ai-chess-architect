export const PRESENTATION_EVENTS = [
  "capture",
  "move",
  "promotion",
  "check",
  "turnStart",
] as const;

export const PRESENTATION_PRESETS = [
  "dragon-carry",
  "sprite-carry",
  "spectral-carry",
  "impact",
  "portal",
  "burst",
  "trail",
] as const;

export const PRESENTATION_DIRECTIONS = [
  "left-to-right",
  "right-to-left",
  "top-to-bottom",
  "bottom-to-top",
  "center-out",
] as const;

export const PRESENTATION_FALLBACKS = [
  "procedural-dragon",
  "procedural-specter",
  "procedural-impact",
  "procedural-portal",
  "none",
] as const;

export type PresentationEvent = (typeof PRESENTATION_EVENTS)[number];
export type PresentationPreset = (typeof PRESENTATION_PRESETS)[number];
export type PresentationDirection = (typeof PRESENTATION_DIRECTIONS)[number];
export type PresentationFallback = (typeof PRESENTATION_FALLBACKS)[number];

export interface PresentationSequenceV1 {
  id: string;
  event: PresentationEvent;
  visualId: string;
  preset: PresentationPreset;
  assetRequestId: string;
  durationMs: number;
  scale: number;
  direction: PresentationDirection;
  zIndex: number;
  reducedMotionFallback: PresentationFallback;
}

export interface PresentationAssetRequestV1 {
  id: string;
  visualId: string;
  mediaType: "image";
  query: string;
  licensePolicy: "public-domain-only";
  preferredStyle: string;
  transparentPreferred: boolean;
  fallback: PresentationFallback;
}

export interface PresentationBlueprintV1 {
  schemaVersion: "1.0.0";
  presentationKey: string;
  enabled: boolean;
  sequences: PresentationSequenceV1[];
  assetRequests: PresentationAssetRequestV1[];
  explanation: {
    plainLanguage: string;
    limitations: string[];
  };
}

export interface ResolvedPresentationAsset {
  requestId: string;
  visualId: string;
  status: "ready" | "fallback";
  provider: "openverse" | "builtin";
  providerAssetId: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  mimeType: string | null;
  byteSize: number | null;
  sha256: string | null;
  license: "cc0" | "pdm" | "builtin";
  licenseUrl: string | null;
  attribution: string;
  landingUrl: string | null;
  fallback: PresentationFallback;
}

export interface RulePresentationManifestV1 {
  schemaVersion: "1.0.0";
  contentHash: string;
  enabled: boolean;
  sequences: PresentationSequenceV1[];
  assets: ResolvedPresentationAsset[];
}

export interface PresentationDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
}

export interface CompilePresentationResponse {
  presentationId: string;
  status: "ready" | "fallback";
  model: string;
  requestId: string | null;
  contentHash: string;
  blueprint: PresentationBlueprintV1;
  assets: ResolvedPresentationAsset[];
  diagnostics: PresentationDiagnostic[];
  generationDurationMs: number;
}

export interface PresentationEventPayload {
  tile: string;
  fromTile?: string;
  capturedPieceType?: string;
  capturedPieceColor?: string;
  promotedPieceType?: string;
}
