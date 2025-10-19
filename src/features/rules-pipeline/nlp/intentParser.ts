import Ajv from "ajv";
import {
  canonicalIntentJsonSchema,
  canonicalIntentSchema,
  type CanonicalIntent,
} from "../schemas/canonicalIntent";
import { resolveAssets } from "../assets/lexicon";
import { fewShotIntents } from "./fewShots";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validateCanonical = ajv.compile(canonicalIntentJsonSchema);

export type IntentParseWarning = {
  code: string;
  message: string;
};

type Heuristic = {
  templateId: CanonicalIntent["templateId"];
  keywords: string[];
  build: (input: string) => CanonicalIntent;
};

const withAssets = (
  intent: Omit<CanonicalIntent, "vfx" | "sfx"> &
    Partial<Pick<CanonicalIntent, "vfx" | "sfx">>,
  keywords: string[],
): CanonicalIntent => {
  const assets = resolveAssets(keywords);
  return canonicalIntentSchema.parse({
    ...intent,
    vfx: intent.vfx ?? assets.vfx,
    sfx: intent.sfx ?? assets.sfx,
  });
};

const heuristics: Heuristic[] = [
  {
    templateId: "pawn_mines",
    keywords: ["pion", "mine"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Pions piégeurs",
          text: input,
          templateId: "pawn_mines",
          category: "hazard",
          affectedPieces: ["pawn"],
          mechanics: ["trigger:afterMove", "hazard:mine"],
          hazards: ["mine"],
          requirements: { kingSafety: false },
          textHints: ["Les pions arment une mine sur la case atteinte."],
        },
        ["mine"],
      ),
  },
  {
    templateId: "bishop_blink",
    keywords: ["fou", "téléport"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Clignement du fou",
          text: input,
          templateId: "bishop_blink",
          category: "mobility",
          affectedPieces: ["bishop"],
          mechanics: ["teleport"],
          targeting: {
            mode: "tile",
            provider: "provider.teleportDestinations",
            params: { inSightOnly: true, emptyOnly: true },
          },
          limits: { cooldownPerPiece: 2 },
          requirements: { kingSafety: true, pathClear: true },
          textHints: ["Choisir une case libre dans la ligne de vue du fou."],
        },
        ["teleport"],
      ),
  },
  {
    templateId: "queen_ice_missile",
    keywords: ["reine", "glace"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Missile de glace",
          text: input,
          templateId: "queen_ice_missile",
          category: "projectile",
          affectedPieces: ["queen"],
          mechanics: ["projectile", "status:frozen"],
          targeting: {
            mode: "tile",
            provider: "provider.raycastFirstHits",
            params: { directions: ["ortho", "diag"], maxRange: 7 },
          },
          limits: { cooldownPerPiece: 3 },
          statuses: ["frozen"],
          requirements: { kingSafety: true },
        },
        ["freeze"],
      ),
  },
  {
    templateId: "knight_quicksand",
    keywords: ["cavalier", "sable"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Trappe mouvante",
          text: input,
          templateId: "knight_quicksand",
          category: "hazard",
          affectedPieces: ["knight"],
          mechanics: ["hazard:quicksand"],
          hazards: ["quicksand"],
          targeting: {
            mode: "tile",
            provider: "provider.patternTargets",
            params: { pattern: "ring", radius: 1 },
          },
          limits: { cooldownPerPiece: 3 },
          requirements: { kingSafety: false },
        },
        ["quicksand"],
      ),
  },
  {
    templateId: "pawn_wall",
    keywords: ["pion", "mur"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Muraille de pions",
          text: input,
          templateId: "pawn_wall",
          category: "terrain",
          affectedPieces: ["pawn"],
          mechanics: ["hazard:wall"],
          hazards: ["wall"],
          targeting: {
            mode: "area",
            provider: "provider.areaFill",
            params: { shape: "line", length: 3, forwardOnly: true },
          },
          limits: { cooldownPerPiece: 4, duration: 3 },
          textHints: ["Construit une muraille temporaire devant le pion."],
        },
        ["wall"],
      ),
  },
  {
    templateId: "knight_archer",
    keywords: ["cavalier", "archer"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Métamorphose du cavalier",
          text: input,
          templateId: "knight_archer",
          category: "morph",
          affectedPieces: ["knight"],
          mechanics: ["morph:archer"],
          limits: { cooldownPerPiece: 5 },
          requirements: { kingSafety: true },
          textHints: [
            "Remplace le cavalier par un archer jusqu'à la fin de la partie.",
          ],
        },
        ["morph"],
      ),
  },
  {
    templateId: "bishop_swap",
    keywords: ["fou", "échang"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Permutation de fou",
          text: input,
          templateId: "bishop_swap",
          category: "control",
          affectedPieces: ["bishop"],
          mechanics: ["swap"],
          targeting: {
            mode: "pair",
            provider: "provider.swapPairsTargets",
            params: { visibility: "diagonal", enemyOnly: true },
          },
          limits: { cooldownPerPiece: 3 },
          requirements: { kingSafety: true, noTargetKing: true },
        },
        ["swap"],
      ),
  },
  {
    templateId: "dynamite_once",
    keywords: ["dynamite"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Dynamite tactique",
          text: input,
          templateId: "dynamite_once",
          category: "hazard",
          affectedPieces: ["pawn", "knight", "bishop", "rook", "queen"],
          mechanics: ["hazard:dynamite"],
          hazards: ["dynamite"],
          targeting: {
            mode: "tile",
            provider: "provider.patternTargets",
            params: { pattern: "self" },
          },
          limits: { oncePerMatch: true, duration: 2 },
          requirements: { kingSafety: false },
          textHints: ["Armement limité à une seule charge par partie."],
        },
        ["dynamite"],
      ),
  },
  {
    templateId: "glue_slow",
    keywords: ["colle", "ralent"],
    build: (input) =>
      withAssets(
        {
          ruleName: "Glu visqueuse",
          text: input,
          templateId: "glue_slow",
          category: "control",
          affectedPieces: ["bishop", "rook", "queen"],
          mechanics: ["hazard:glue", "status:slowed"],
          hazards: ["glue"],
          statuses: ["slowed"],
          targeting: {
            mode: "area",
            provider: "provider.areaFill",
            params: { shape: "disk", radius: 1 },
          },
          limits: { cooldownPerPiece: 3, duration: 3 },
          requirements: { kingSafety: false },
        },
        ["glue"],
      ),
  },
];

const normalizeText = (input: string) => input.normalize("NFKC").toLowerCase();

export const parseIntent = (
  input: string,
): { intent: CanonicalIntent; warnings: IntentParseWarning[] } => {
  const normalized = normalizeText(input);
  const warnings: IntentParseWarning[] = [];

  const matchedHeuristic = heuristics.find((heuristic) =>
    heuristic.keywords.every((keyword) => normalized.includes(keyword)),
  );

  if (!matchedHeuristic) {
    warnings.push({
      code: "no_match",
      message:
        "Aucun gabarit heuristique ne correspond, fallback few-shot utilisé.",
    });
    const fallback = fewShotIntents[0];
    return { intent: fallback, warnings };
  }

  const intent = matchedHeuristic.build(input.trim());
  const isValid = validateCanonical(intent);
  if (!isValid) {
    const errors =
      validateCanonical.errors?.map(
        (err) => `${err.instancePath} ${err.message}`,
      ) ?? [];
    throw new Error(`Intent canonique invalide: ${errors.join(", ")}`);
  }

  return { intent, warnings };
};
