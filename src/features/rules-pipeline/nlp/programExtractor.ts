import { fewShotIntents } from "./fewShots";
import type { RuleProgram, RuleCommand, AddMechanicCommand } from "../rule-language/types";

export type ProgramExtractionWarning = {
  code: string;
  message: string;
};

type Heuristic = {
  template: string;
  keywords: string[];
  build: (input: string) => RuleCommand[];
};

const buildDefineRule = (
  name: string,
  template: string,
  category?: string,
): RuleCommand => ({
  type: "DEFINE_RULE",
  name,
  template,
  category,
});

const heuristics: Heuristic[] = [
  {
    template: "pawn_mines",
    keywords: ["pion", "mine"],
    build: (input) => [
      buildDefineRule("Pions piégeurs", "pawn_mines", "hazard"),
      { type: "SET_SUMMARY", summary: input },
      { type: "SET_PIECES", pieces: ["pawn"] },
      { type: "ADD_MECHANIC", mechanic: "trigger:afterMove" },
      { type: "ADD_MECHANIC", mechanic: "hazard:mine" },
      { type: "ADD_HAZARD", hazard: "mine" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Les pions arment une mine sur la case atteinte.",
      },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "La règle doit créer une mine après le déplacement.",
      },
    ],
  },
  {
    template: "bishop_blink",
    keywords: ["fou", "téléport"],
    build: (input) => [
      buildDefineRule("Clignement du fou", "bishop_blink", "mobility"),
      { type: "SET_SUMMARY", summary: input },
      { type: "SET_PIECES", pieces: ["bishop"] },
      { type: "ADD_MECHANIC", mechanic: "teleport" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.teleportDestinations",
        params: { inSightOnly: true, emptyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 2 },
      { type: "SET_REQUIREMENT", requirement: "kingSafety", value: true },
      { type: "SET_REQUIREMENT", requirement: "pathClear", value: true },
      {
        type: "ADD_TEXT_HINT",
        hint: "Choisir une case libre dans la ligne de vue du fou.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.teleport",
        expected: true,
        reason: "L'action doit téléporter le fou.",
      },
    ],
  },
  {
    template: "queen_ice_missile",
    keywords: ["reine", "glace"],
    build: (input) => [
      buildDefineRule("Missile de glace", "queen_ice_missile", "projectile"),
      { type: "SET_SUMMARY", summary: input },
      { type: "SET_PIECES", pieces: ["queen"] },
      { type: "ADD_MECHANIC", mechanic: "projectile" },
      { type: "ADD_MECHANIC", mechanic: "status:frozen" },
      { type: "ADD_STATUS", status: "frozen" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.raycastFirstHits",
        params: { directions: ["ortho", "diag"], maxRange: 7 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      { type: "SET_REQUIREMENT", requirement: "kingSafety", value: true },
      {
        type: "EXPECT_ACTION",
        action: "projectile.spawn",
        expected: true,
        reason: "La règle doit projeter un missile.",
      },
    ],
  },
  {
    template: "knight_quicksand",
    keywords: ["cavalier", "sable"],
    build: (input) => [
      buildDefineRule("Trappe mouvante", "knight_quicksand", "hazard"),
      { type: "SET_SUMMARY", summary: input },
      { type: "SET_PIECES", pieces: ["knight"] },
      { type: "ADD_MECHANIC", mechanic: "hazard:quicksand" },
      { type: "ADD_HAZARD", hazard: "quicksand" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.patternTargets",
        params: { pattern: "ring", radius: 1 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "La règle doit générer une zone de sable mouvant.",
      },
    ],
  },
  {
    template: "pawn_wall",
    keywords: ["pion", "mur"],
    build: (input) => [
      buildDefineRule("Muraille de pions", "pawn_wall", "terrain"),
      { type: "SET_SUMMARY", summary: input },
      { type: "SET_PIECES", pieces: ["pawn"] },
      { type: "ADD_MECHANIC", mechanic: "hazard:wall" },
      { type: "ADD_HAZARD", hazard: "wall" },
      {
        type: "SET_TARGETING",
        mode: "area",
        provider: "provider.areaFill",
        params: { shape: "line", length: 3, forwardOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 4 },
      { type: "SET_LIMIT", limit: "duration", value: 3 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Construit une muraille temporaire devant le pion.",
      },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "Les pions doivent créer une muraille.",
      },
    ],
  },
  {
    template: "knight_archer",
    keywords: ["cavalier", "archer"],
    build: (input) => [
      buildDefineRule("Métamorphose du cavalier", "knight_archer", "morph"),
      { type: "SET_SUMMARY", summary: input },
      { type: "SET_PIECES", pieces: ["knight"] },
      { type: "ADD_MECHANIC", mechanic: "morph:archer" },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 5 },
      { type: "SET_REQUIREMENT", requirement: "kingSafety", value: true },
      {
        type: "ADD_TEXT_HINT",
        hint: "Remplace le cavalier par un archer jusqu'à la fin de la partie.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.morph",
        expected: true,
        reason: "Le cavalier doit se transformer en archer.",
      },
    ],
  },
  {
    template: "bishop_swap",
    keywords: ["fou", "échang"],
    build: (input) => [
      buildDefineRule("Permutation de fou", "bishop_swap", "control"),
      { type: "SET_SUMMARY", summary: input },
      { type: "SET_PIECES", pieces: ["bishop"] },
      { type: "ADD_MECHANIC", mechanic: "swap" },
      {
        type: "SET_TARGETING",
        mode: "pair",
        provider: "provider.swapPairsTargets",
        params: { visibility: "diagonal", enemyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      { type: "SET_REQUIREMENT", requirement: "kingSafety", value: true },
      { type: "SET_REQUIREMENT", requirement: "noTargetKing", value: true },
      {
        type: "EXPECT_ACTION",
        action: "piece.swap",
        expected: true,
        reason: "Le fou doit échanger deux pièces.",
      },
    ],
  },
  {
    template: "dynamite_once",
    keywords: ["dynamite"],
    build: (input) => [
      buildDefineRule("Dynamite tactique", "dynamite_once", "hazard"),
      { type: "SET_SUMMARY", summary: input },
      {
        type: "SET_PIECES",
        pieces: ["pawn", "knight", "bishop", "rook", "queen"],
      },
      { type: "ADD_MECHANIC", mechanic: "hazard:dynamite" },
      { type: "ADD_HAZARD", hazard: "dynamite" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.patternTargets",
        params: { pattern: "self" },
      },
      { type: "SET_LIMIT", limit: "oncePerMatch", value: true },
      { type: "SET_LIMIT", limit: "duration", value: 2 },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "La dynamite doit être posée sur la case de la pièce.",
      },
    ],
  },
  {
    template: "glue_slow",
    keywords: ["colle", "ralent"],
    build: (input) => [
      buildDefineRule("Glu visqueuse", "glue_slow", "control"),
      { type: "SET_SUMMARY", summary: input },
      { type: "SET_PIECES", pieces: ["bishop", "rook", "queen"] },
      { type: "ADD_MECHANIC", mechanic: "hazard:glue" },
      { type: "ADD_MECHANIC", mechanic: "status:slowed" },
      { type: "ADD_HAZARD", hazard: "glue" },
      { type: "ADD_STATUS", status: "slowed" },
      {
        type: "SET_TARGETING",
        mode: "area",
        provider: "provider.areaFill",
        params: { shape: "disk", radius: 1 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      { type: "SET_LIMIT", limit: "duration", value: 3 },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "La colle doit apparaître sur la zone ciblée.",
      },
    ],
  },
];

const normalizeText = (input: string) => input.normalize("NFKC").toLowerCase();

const fallbackProgram = (input: string): RuleProgram => ({
  source: input.trim(),
  commands: [
    buildDefineRule(fewShotIntents[0].ruleName, fewShotIntents[0].templateId),
    { type: "SET_SUMMARY", summary: input },
    { type: "SET_PIECES", pieces: fewShotIntents[0].affectedPieces },
    ...fewShotIntents[0].mechanics.map((mechanic): AddMechanicCommand => ({
      type: "ADD_MECHANIC" as const,
      mechanic,
    })),
  ],
});

export const extractProgram = (
  input: string,
): { program: RuleProgram; warnings: ProgramExtractionWarning[] } => {
  const normalized = normalizeText(input);
  const warnings: ProgramExtractionWarning[] = [];

  const matchedHeuristic = heuristics.find((heuristic) =>
    heuristic.keywords.every((keyword) => normalized.includes(keyword)),
  );

  if (!matchedHeuristic) {
    warnings.push({
      code: "no_match",
      message:
        "Aucun gabarit heuristique ne correspond, fallback few-shot utilisé.",
    });
    return { program: fallbackProgram(input), warnings };
  }

  const commands = matchedHeuristic.build(input.trim());
  return { program: { source: input.trim(), commands }, warnings };
};
