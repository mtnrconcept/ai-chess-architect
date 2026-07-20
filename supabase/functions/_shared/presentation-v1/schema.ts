import {
  PRESENTATION_DIRECTIONS,
  PRESENTATION_EVENTS,
  PRESENTATION_FALLBACKS,
  PRESENTATION_LICENSE_POLICIES,
  PRESENTATION_MEDIA_TYPES,
  PRESENTATION_PRESETS,
  PRESENTATION_SCHEMA_VERSION,
  type PresentationAssetRequestV1,
  type PresentationBlueprintV1,
  type PresentationDiagnostic,
  type PresentationSequenceV1,
} from "./types.ts";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]{1,49}$/;
const PRESENTATION_KEY_PATTERN = /^[a-z][a-z0-9-]{2,59}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const URL_LIKE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|data:|javascript:)/i;
const QUERY_METACHARACTERS = /[<>\[\]{}\\`$;&|]/;
const MAX_SEQUENCES = 8;
const MAX_ASSET_REQUESTS = 4;

const enumSchema = (values: readonly string[]) => ({
  type: "string",
  enum: [...values],
});

const identifierSchema = {
  type: "string",
  pattern: "^[a-z][a-z0-9-]{1,49}$",
};

export const PRESENTATION_BLUEPRINT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "presentationKey",
    "enabled",
    "sequences",
    "assetRequests",
    "explanation",
  ],
  properties: {
    schemaVersion: {
      type: "string",
      enum: [PRESENTATION_SCHEMA_VERSION],
    },
    presentationKey: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]{2,59}$",
    },
    enabled: { type: "boolean" },
    sequences: {
      type: "array",
      maxItems: MAX_SEQUENCES,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
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
        ],
        properties: {
          id: identifierSchema,
          event: enumSchema(PRESENTATION_EVENTS),
          visualId: identifierSchema,
          preset: enumSchema(PRESENTATION_PRESETS),
          assetRequestId: { type: "string" },
          durationMs: { type: "integer" },
          scale: { type: "number" },
          direction: enumSchema(PRESENTATION_DIRECTIONS),
          zIndex: { type: "integer" },
          reducedMotionFallback: enumSchema(PRESENTATION_FALLBACKS),
        },
      },
    },
    assetRequests: {
      type: "array",
      maxItems: MAX_ASSET_REQUESTS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "visualId",
          "mediaType",
          "query",
          "licensePolicy",
          "preferredStyle",
          "transparentPreferred",
          "fallback",
        ],
        properties: {
          id: identifierSchema,
          visualId: identifierSchema,
          mediaType: enumSchema(PRESENTATION_MEDIA_TYPES),
          query: { type: "string" },
          licensePolicy: enumSchema(PRESENTATION_LICENSE_POLICIES),
          preferredStyle: { type: "string" },
          transparentPreferred: { type: "boolean" },
          fallback: enumSchema(PRESENTATION_FALLBACKS),
        },
      },
    },
    explanation: {
      type: "object",
      additionalProperties: false,
      required: ["plainLanguage", "limitations"],
      properties: {
        plainLanguage: { type: "string" },
        limitations: {
          type: "array",
          maxItems: 8,
          items: { type: "string" },
        },
      },
    },
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const safeText = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is string =>
  typeof value === "string" &&
  value.trim().length >= minimum &&
  value.trim().length <= maximum &&
  !CONTROL_CHARACTERS.test(value);

const safeIdentifier = (value: unknown): value is string =>
  typeof value === "string" && IDENTIFIER_PATTERN.test(value);

export const normalizePresentationSearchQuery = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim();

export const isSafePresentationSearchQuery = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const normalized = normalizePresentationSearchQuery(value);
  return (
    normalized.length >= 3 &&
    normalized.length <= 120 &&
    !CONTROL_CHARACTERS.test(normalized) &&
    !URL_LIKE.test(normalized) &&
    !QUERY_METACHARACTERS.test(normalized)
  );
};

const push = (
  diagnostics: PresentationDiagnostic[],
  code: string,
  path: string,
  message: string,
): void => {
  diagnostics.push({ code, severity: "error", path, message });
};

const validateSequence = (
  value: unknown,
  index: number,
  diagnostics: PresentationDiagnostic[],
): PresentationSequenceV1 | null => {
  const path = `sequences.${index}`;
  if (!isRecord(value)) {
    push(diagnostics, "SEQUENCE_NOT_OBJECT", path, "La séquence doit être un objet.");
    return null;
  }

  const keys = [
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
  if (!hasExactKeys(value, keys)) {
    push(
      diagnostics,
      "SEQUENCE_KEYS_INVALID",
      path,
      "La séquence contient des propriétés absentes ou non autorisées.",
    );
    return null;
  }

  if (!safeIdentifier(value.id) || !safeIdentifier(value.visualId)) {
    push(
      diagnostics,
      "SEQUENCE_IDENTIFIER_INVALID",
      path,
      "Les identifiants de séquence et de visuel sont invalides.",
    );
    return null;
  }

  if (
    typeof value.event !== "string" ||
    !PRESENTATION_EVENTS.includes(value.event as PresentationSequenceV1["event"])
  ) {
    push(diagnostics, "SEQUENCE_EVENT_INVALID", `${path}.event`, "Événement visuel invalide.");
    return null;
  }

  if (
    typeof value.preset !== "string" ||
    !PRESENTATION_PRESETS.includes(value.preset as PresentationSequenceV1["preset"])
  ) {
    push(diagnostics, "SEQUENCE_PRESET_INVALID", `${path}.preset`, "Preset visuel invalide.");
    return null;
  }

  if (
    typeof value.assetRequestId !== "string" ||
    (value.assetRequestId !== "" && !safeIdentifier(value.assetRequestId))
  ) {
    push(
      diagnostics,
      "SEQUENCE_ASSET_LINK_INVALID",
      `${path}.assetRequestId`,
      "La référence d'asset doit être vide ou contenir un identifiant sûr.",
    );
    return null;
  }

  if (
    typeof value.durationMs !== "number" ||
    !Number.isInteger(value.durationMs) ||
    value.durationMs < 200 ||
    value.durationMs > 5000
  ) {
    push(
      diagnostics,
      "SEQUENCE_DURATION_INVALID",
      `${path}.durationMs`,
      "La durée doit être un entier compris entre 200 et 5000 ms.",
    );
    return null;
  }

  if (
    typeof value.scale !== "number" ||
    !Number.isFinite(value.scale) ||
    value.scale < 0.25 ||
    value.scale > 4
  ) {
    push(
      diagnostics,
      "SEQUENCE_SCALE_INVALID",
      `${path}.scale`,
      "L'échelle doit être comprise entre 0.25 et 4.",
    );
    return null;
  }

  if (
    typeof value.direction !== "string" ||
    !PRESENTATION_DIRECTIONS.includes(
      value.direction as PresentationSequenceV1["direction"],
    )
  ) {
    push(
      diagnostics,
      "SEQUENCE_DIRECTION_INVALID",
      `${path}.direction`,
      "Direction visuelle invalide.",
    );
    return null;
  }

  if (
    typeof value.zIndex !== "number" ||
    !Number.isInteger(value.zIndex) ||
    value.zIndex < 1 ||
    value.zIndex > 20
  ) {
    push(
      diagnostics,
      "SEQUENCE_Z_INDEX_INVALID",
      `${path}.zIndex`,
      "Le z-index doit être un entier compris entre 1 et 20.",
    );
    return null;
  }

  if (
    typeof value.reducedMotionFallback !== "string" ||
    !PRESENTATION_FALLBACKS.includes(
      value.reducedMotionFallback as PresentationSequenceV1["reducedMotionFallback"],
    )
  ) {
    push(
      diagnostics,
      "SEQUENCE_REDUCED_MOTION_INVALID",
      `${path}.reducedMotionFallback`,
      "Fallback d'accessibilité invalide.",
    );
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

const validateAssetRequest = (
  value: unknown,
  index: number,
  diagnostics: PresentationDiagnostic[],
): PresentationAssetRequestV1 | null => {
  const path = `assetRequests.${index}`;
  if (!isRecord(value)) {
    push(diagnostics, "ASSET_REQUEST_NOT_OBJECT", path, "La demande d'asset doit être un objet.");
    return null;
  }

  const keys = [
    "id",
    "visualId",
    "mediaType",
    "query",
    "licensePolicy",
    "preferredStyle",
    "transparentPreferred",
    "fallback",
  ] as const;
  if (!hasExactKeys(value, keys)) {
    push(
      diagnostics,
      "ASSET_REQUEST_KEYS_INVALID",
      path,
      "La demande d'asset contient des propriétés absentes ou non autorisées.",
    );
    return null;
  }

  if (!safeIdentifier(value.id) || !safeIdentifier(value.visualId)) {
    push(
      diagnostics,
      "ASSET_REQUEST_IDENTIFIER_INVALID",
      path,
      "Les identifiants de demande et de visuel sont invalides.",
    );
    return null;
  }

  if (
    typeof value.mediaType !== "string" ||
    !PRESENTATION_MEDIA_TYPES.includes(
      value.mediaType as PresentationAssetRequestV1["mediaType"],
    )
  ) {
    push(diagnostics, "ASSET_MEDIA_TYPE_INVALID", `${path}.mediaType`, "Type de média invalide.");
    return null;
  }

  if (!isSafePresentationSearchQuery(value.query)) {
    push(
      diagnostics,
      "ASSET_QUERY_UNSAFE",
      `${path}.query`,
      "La requête d'asset contient une URL, des métacaractères ou une longueur invalide.",
    );
    return null;
  }

  if (
    typeof value.licensePolicy !== "string" ||
    !PRESENTATION_LICENSE_POLICIES.includes(
      value.licensePolicy as PresentationAssetRequestV1["licensePolicy"],
    )
  ) {
    push(
      diagnostics,
      "ASSET_LICENSE_POLICY_INVALID",
      `${path}.licensePolicy`,
      "Politique de licence invalide.",
    );
    return null;
  }

  if (!safeText(value.preferredStyle, 0, 80)) {
    push(
      diagnostics,
      "ASSET_STYLE_INVALID",
      `${path}.preferredStyle`,
      "Le style préféré est trop long ou contient des caractères de contrôle.",
    );
    return null;
  }

  if (typeof value.transparentPreferred !== "boolean") {
    push(
      diagnostics,
      "ASSET_TRANSPARENCY_INVALID",
      `${path}.transparentPreferred`,
      "Le choix de transparence doit être booléen.",
    );
    return null;
  }

  if (
    typeof value.fallback !== "string" ||
    !PRESENTATION_FALLBACKS.includes(
      value.fallback as PresentationAssetRequestV1["fallback"],
    )
  ) {
    push(diagnostics, "ASSET_FALLBACK_INVALID", `${path}.fallback`, "Fallback d'asset invalide.");
    return null;
  }

  return {
    id: value.id,
    visualId: value.visualId,
    mediaType: value.mediaType as PresentationAssetRequestV1["mediaType"],
    query: normalizePresentationSearchQuery(value.query),
    licensePolicy:
      value.licensePolicy as PresentationAssetRequestV1["licensePolicy"],
    preferredStyle: value.preferredStyle.trim(),
    transparentPreferred: value.transparentPreferred,
    fallback: value.fallback as PresentationAssetRequestV1["fallback"],
  };
};

export function validatePresentationBlueprint(value: unknown): {
  ok: boolean;
  blueprint: PresentationBlueprintV1 | null;
  diagnostics: PresentationDiagnostic[];
} {
  const diagnostics: PresentationDiagnostic[] = [];
  if (!isRecord(value)) {
    push(diagnostics, "BLUEPRINT_NOT_OBJECT", "$", "Le blueprint visuel doit être un objet.");
    return { ok: false, blueprint: null, diagnostics };
  }

  const keys = [
    "schemaVersion",
    "presentationKey",
    "enabled",
    "sequences",
    "assetRequests",
    "explanation",
  ] as const;
  if (!hasExactKeys(value, keys)) {
    push(
      diagnostics,
      "BLUEPRINT_KEYS_INVALID",
      "$",
      "Le blueprint visuel contient des propriétés absentes ou non autorisées.",
    );
    return { ok: false, blueprint: null, diagnostics };
  }

  if (value.schemaVersion !== PRESENTATION_SCHEMA_VERSION) {
    push(
      diagnostics,
      "SCHEMA_VERSION_INVALID",
      "schemaVersion",
      `La version attendue est ${PRESENTATION_SCHEMA_VERSION}.`,
    );
  }

  if (
    typeof value.presentationKey !== "string" ||
    !PRESENTATION_KEY_PATTERN.test(value.presentationKey)
  ) {
    push(
      diagnostics,
      "PRESENTATION_KEY_INVALID",
      "presentationKey",
      "La clé de présentation est invalide.",
    );
  }

  if (typeof value.enabled !== "boolean") {
    push(diagnostics, "ENABLED_INVALID", "enabled", "enabled doit être booléen.");
  }

  if (!Array.isArray(value.sequences) || value.sequences.length > MAX_SEQUENCES) {
    push(
      diagnostics,
      "SEQUENCES_INVALID",
      "sequences",
      `Le blueprint accepte au maximum ${MAX_SEQUENCES} séquences.`,
    );
  }

  if (
    !Array.isArray(value.assetRequests) ||
    value.assetRequests.length > MAX_ASSET_REQUESTS
  ) {
    push(
      diagnostics,
      "ASSET_REQUESTS_INVALID",
      "assetRequests",
      `Le blueprint accepte au maximum ${MAX_ASSET_REQUESTS} demandes d'assets.`,
    );
  }

  const sequences = Array.isArray(value.sequences)
    ? value.sequences
        .map((item, index) => validateSequence(item, index, diagnostics))
        .filter((item): item is PresentationSequenceV1 => item !== null)
    : [];
  const assetRequests = Array.isArray(value.assetRequests)
    ? value.assetRequests
        .map((item, index) => validateAssetRequest(item, index, diagnostics))
        .filter((item): item is PresentationAssetRequestV1 => item !== null)
    : [];

  if (!isRecord(value.explanation)) {
    push(
      diagnostics,
      "EXPLANATION_INVALID",
      "explanation",
      "L'explication doit être un objet.",
    );
  } else {
    if (!hasExactKeys(value.explanation, ["plainLanguage", "limitations"])) {
      push(
        diagnostics,
        "EXPLANATION_KEYS_INVALID",
        "explanation",
        "L'explication contient des propriétés absentes ou non autorisées.",
      );
    }
    if (!safeText(value.explanation.plainLanguage, 3, 600)) {
      push(
        diagnostics,
        "EXPLANATION_TEXT_INVALID",
        "explanation.plainLanguage",
        "L'explication doit contenir entre 3 et 600 caractères.",
      );
    }
    if (
      !Array.isArray(value.explanation.limitations) ||
      value.explanation.limitations.length > 8 ||
      value.explanation.limitations.some((item) => !safeText(item, 1, 180))
    ) {
      push(
        diagnostics,
        "EXPLANATION_LIMITATIONS_INVALID",
        "explanation.limitations",
        "Les limitations doivent être une liste de huit textes courts au maximum.",
      );
    }
  }

  const sequenceIds = new Set<string>();
  const requestIds = new Set<string>();
  for (const sequence of sequences) {
    if (sequenceIds.has(sequence.id)) {
      push(
        diagnostics,
        "SEQUENCE_ID_DUPLICATE",
        `sequences.${sequence.id}`,
        "Deux séquences utilisent le même identifiant.",
      );
    }
    sequenceIds.add(sequence.id);
  }
  for (const request of assetRequests) {
    if (requestIds.has(request.id)) {
      push(
        diagnostics,
        "ASSET_REQUEST_ID_DUPLICATE",
        `assetRequests.${request.id}`,
        "Deux demandes d'assets utilisent le même identifiant.",
      );
    }
    requestIds.add(request.id);
  }

  const requestsById = new Map(assetRequests.map((request) => [request.id, request]));
  for (const sequence of sequences) {
    if (!sequence.assetRequestId) continue;
    const request = requestsById.get(sequence.assetRequestId);
    if (!request) {
      push(
        diagnostics,
        "ASSET_REQUEST_NOT_FOUND",
        `sequences.${sequence.id}.assetRequestId`,
        "La séquence référence une demande d'asset inexistante.",
      );
    } else if (request.visualId !== sequence.visualId) {
      push(
        diagnostics,
        "VISUAL_ID_MISMATCH",
        `sequences.${sequence.id}.visualId`,
        "Le visualId de la séquence ne correspond pas à celui de sa demande d'asset.",
      );
    }
  }

  if (value.enabled === false && (sequences.length > 0 || assetRequests.length > 0)) {
    push(
      diagnostics,
      "DISABLED_BLUEPRINT_NOT_EMPTY",
      "enabled",
      "Un blueprint désactivé ne doit contenir ni séquence ni demande d'asset.",
    );
  }
  if (value.enabled === true && sequences.length === 0) {
    push(
      diagnostics,
      "ENABLED_BLUEPRINT_EMPTY",
      "sequences",
      "Une présentation activée doit contenir au moins une séquence.",
    );
  }

  if (diagnostics.length > 0 || !isRecord(value.explanation)) {
    return { ok: false, blueprint: null, diagnostics };
  }

  return {
    ok: true,
    blueprint: {
      schemaVersion: PRESENTATION_SCHEMA_VERSION,
      presentationKey: value.presentationKey as string,
      enabled: value.enabled as boolean,
      sequences,
      assetRequests,
      explanation: {
        plainLanguage: (value.explanation.plainLanguage as string).trim(),
        limitations: (value.explanation.limitations as string[]).map((item) =>
          item.trim()
        ),
      },
    },
    diagnostics,
  };
}
