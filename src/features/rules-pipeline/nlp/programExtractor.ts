import { fewShotIntents } from "./fewShots";
import type {
  RuleProgram,
  RuleCommand,
  AddMechanicCommand,
  SetPiecesCommand,
} from "../rule-language/types";

export type ProgramExtractionWarning = {
  code: string;
  message: string;
};

// ---
// --- DÉFINITION DES BRIQUES DE MÉCANIQUES ---
// ---

/**
 * Une brique de mécanique est un composant de règle atomique
 * déclenché par des mots-clés.
 */
type MechanicBrick = {
  id: string;
  keywords: string[];
  commands: RuleCommand[];
};

type RuleBlueprint = {
  id: string;
  ruleName: string;
  templateId: string;
  category: string;
  requiredBricks: string[];
  forcedPieces?: string[];
};

/**
 * Construit une commande DEFINE_RULE.
 * Nous n'utilisons plus 'buildDefineRule' dans les briques,
 * car la définition est générée dynamiquement à la fin.
 */
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

// --- BIBLIOTHÈQUE DE BRIQUES ---
// (J'ai décomposé vos heuristiques existantes en briques)

const mechanicBricks: MechanicBrick[] = [
  // --- 1. BRIQUES DE PIÈCES ---
  {
    id: "piece_pawn",
    keywords: ["pion", "pions"],
    commands: [{ type: "SET_PIECES", pieces: ["pawn"] }],
  },
  {
    id: "piece_bishop",
    keywords: ["fou", "fous"],
    commands: [{ type: "SET_PIECES", pieces: ["bishop"] }],
  },
  {
    id: "piece_knight",
    keywords: ["cavalier", "cavaliers"],
    commands: [{ type: "SET_PIECES", pieces: ["knight"] }],
  },
  {
    id: "piece_rook",
    keywords: ["tour", "tours"],
    commands: [{ type: "SET_PIECES", pieces: ["rook"] }],
  },
  {
    id: "piece_queen",
    keywords: ["reine", "reines", "dame", "dames"],
    commands: [{ type: "SET_PIECES", pieces: ["queen"] }],
  },
  {
    id: "piece_king",
    keywords: ["roi", "rois"],
    commands: [{ type: "SET_PIECES", pieces: ["king"] }],
  },
  {
    id: "piece_all_but_king",
    keywords: [
      "pièces",
      "toutes les pièces",
      "chaque pièce",
      "chaque piece",
      "chaque pieces",
    ],
    commands: [
      {
        type: "SET_PIECES",
        pieces: ["pawn", "knight", "bishop", "rook", "queen"],
      },
    ],
  },
  {
    id: "piece_all",
    keywords: ["l'échiquier", "global", "partout"],
    commands: [
      {
        type: "SET_PIECES",
        pieces: ["pawn", "knight", "bishop", "rook", "queen", "king"],
      },
    ],
  },

  // --- 2. BRIQUES DE MÉCANIQUES (ACTIONS EXISTANTES) ---
  {
    id: "action_mine",
    keywords: ["mine", "piège"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "trigger:afterMove" },
      { type: "ADD_MECHANIC", mechanic: "hazard:mine" },
      { type: "ADD_HAZARD", hazard: "mine" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Arme une mine sur la case atteinte.",
      },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "La règle doit créer une mine.",
      },
    ],
  },
  {
    id: "action_teleport",
    keywords: ["téléport", "clignement", "blink"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "teleport" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.teleportDestinations",
        params: { inSightOnly: true, emptyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 2 },
      {
        type: "EXPECT_ACTION",
        action: "piece.teleport",
        expected: true,
        reason: "L'action doit téléporter la pièce.",
      },
    ],
  },
  {
    id: "action_ice_missile",
    keywords: ["glace", "geler", "missile", "projectile"],
    commands: [
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
      {
        type: "EXPECT_ACTION",
        action: "projectile.spawn",
        expected: true,
        reason: "La règle doit projeter un missile.",
      },
    ],
  },
  {
    id: "action_quicksand",
    keywords: ["sable", "sables mouvants", "trappe"],
    commands: [
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
    id: "action_wall",
    keywords: ["mur", "muraille", "barricade"],
    commands: [
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
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "La pièce doit créer une muraille.",
      },
    ],
  },
  {
    id: "action_morph_archer",
    keywords: ["archer", "métamorphose", "transforme"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "morph:archer" },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 5 },
      {
        type: "EXPECT_ACTION",
        action: "piece.morph",
        expected: true,
        reason: "La pièce doit se transformer en archer.",
      },
    ],
  },
  {
    id: "action_swap_enemy",
    keywords: ["échang", "inverse", "permutation"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "swap" },
      {
        type: "SET_TARGETING",
        mode: "pair",
        provider: "provider.swapPairsTargets",
        params: { visibility: "diagonal", enemyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      { type: "SET_REQUIREMENT", requirement: "noTargetKing", value: true },
      {
        type: "EXPECT_ACTION",
        action: "piece.swap",
        expected: true,
        reason: "La pièce doit échanger deux pièces.",
      },
    ],
  },
  {
    id: "action_dynamite",
    keywords: ["dynamite"],
    commands: [
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
        reason: "La dynamite doit être posée sur la case.",
      },
    ],
  },
  {
    id: "action_glue",
    keywords: ["colle", "ralentit", "glu"],
    commands: [
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

  // ---
  // --- 3. NOUVELLES BRIQUES DE MÉCANIQUES (30) ---
  // ---

  // --- Statuts & Effets ---
  {
    id: "action_poison",
    keywords: ["poison", "empoisonne", "toxique", "venin"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "status:poisoned" },
      { type: "ADD_STATUS", status: "poisoned" },
      { type: "SET_LIMIT", limit: "duration", value: 3 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Applique un poison qui inflige des dégâts sur la durée.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.setStatus",
        expected: true,
        reason: "Doit appliquer le statut 'poisoned'.",
      },
    ],
  },
  {
    id: "action_burn",
    keywords: ["brûle", "feu", "incendie", "brûlure"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "status:burning" },
      { type: "ADD_STATUS", status: "burning" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.raycastFirstHits",
        params: { directions: ["ortho"], maxRange: 4 },
      },
      { type: "SET_LIMIT", limit: "duration", value: 2 },
      {
        type: "EXPECT_ACTION",
        action: "piece.setStatus",
        expected: true,
        reason: "Doit appliquer le statut 'burning'.",
      },
    ],
  },
  {
    id: "action_lifesteal",
    keywords: ["vampire", "vole vie", "drain", "siphon"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "trigger:onCapture" },
      { type: "ADD_MECHANIC", mechanic: "support:lifesteal" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Se soigne en capturant une pièce ennemie.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.heal",
        expected: true,
        reason: "Doit se soigner après une capture.",
      },
    ],
  },
  {
    id: "action_explode_on_death",
    keywords: ["explose mort", "décès", "sacrifice", "kamikaze"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "trigger:onDeath" },
      { type: "ADD_MECHANIC", mechanic: "area:onDeath" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Explose à sa mort, blessant les pièces adjacentes.",
      },
      {
        type: "EXPECT_ACTION",
        action: "area.applyEffect",
        expected: true,
        reason: "Doit exploser à la mort.",
      },
    ],
  },
  {
    id: "action_stun",
    keywords: ["étourdit", "paralyse", "fige", "assomme"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "status:stunned" },
      { type: "ADD_STATUS", status: "stunned" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.piecesInRadius",
        params: { radius: 1, enemyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "EXPECT_ACTION",
        action: "piece.setStatus",
        expected: true,
        reason: "Doit étourdir une pièce adjacente.",
      },
    ],
  },
  {
    id: "action_invisible",
    keywords: ["invisible", "furtif", "camoufle", "cache"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "status:invisible" },
      { type: "ADD_STATUS", status: "invisible" },
      { type: "SET_LIMIT", limit: "duration", value: 2 },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 4 },
      {
        type: "EXPECT_ACTION",
        action: "piece.setStatus",
        expected: true,
        reason: "Doit devenir invisible.",
      },
    ],
  },
  {
    id: "action_reflect_damage",
    keywords: ["épines", "renvoie", "reflète", "riposte"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "status:thorns" },
      { type: "ADD_STATUS", status: "thorns" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Renvoie une partie des dégâts subis à l'attaquant.",
      },
    ],
  },
  {
    id: "action_anchor",
    keywords: ["ancre", "immobilise", "enracine", "fige"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "status:anchored" },
      { type: "ADD_STATUS", status: "anchored" },
      { type: "SET_LIMIT", limit: "duration", value: 1 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Immobilise une pièce ennemie pour 1 tour.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.setStatus",
        expected: true,
        reason: "Doit immobiliser la cible.",
      },
    ],
  },
  {
    id: "action_fear",
    keywords: ["peur", "effraie", "terreur", "repousse"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "control:fear" },
      {
        type: "SET_TARGETING",
        mode: "area",
        provider: "provider.areaFill",
        params: { shape: "disk", radius: 1 },
      },
      {
        type: "ADD_TEXT_HINT",
        hint: "Fait fuir les pièces ennemies adjacentes.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.move",
        expected: true,
        reason: "Doit repousser les pièces (fuite).",
      },
    ],
  },
  {
    id: "action_execute",
    keywords: ["exécution", "achève", "coup de grâce", "faible"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "attack:execute" },
      {
        type: "SET_REQUIREMENT",
        requirement: "targetHasStatus" as any, // Type extension needed for custom requirement
        value: "poisoned" as any,
      },
      {
        type: "ADD_TEXT_HINT",
        hint: "Capture instantanément les pièces faibles ou affectées par un statut.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.capture",
        expected: true,
        reason: "Doit capturer la pièce.",
      },
    ],
  },

  // --- Mobilité ---
  {
    id: "action_charge",
    keywords: ["charge", "fonce", "élan", "sprint"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "move:charge" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.raycastEmpty",
        params: { directions: ["ortho"], maxRange: 5 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 2 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Charge en ligne droite jusqu'à rencontrer un obstacle.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.move",
        expected: true,
        reason: "Doit charger en avant.",
      },
    ],
  },
  {
    id: "action_retreat",
    keywords: ["recule", "retraite", "repli", "arrière"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "move:retreat" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.patternTargets",
        params: { pattern: "backward", radius: 2 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Permet de reculer de 1 ou 2 cases.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.move",
        expected: true,
        reason: "Doit permettre de reculer.",
      },
    ],
  },
  {
    id: "action_jump",
    keywords: ["saute", "bondit", "par-dessus"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "move:jump" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.patternTargets",
        params: { pattern: "knightMove" },
      },
      {
        type: "ADD_TEXT_HINT",
        hint: "Peut sauter par-dessus une pièce.",
      },
      {
        type: "SET_REQUIREMENT",
        requirement: "pathClear",
        value: false,
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.move",
        expected: true,
        reason: "Doit sauter par-dessus les obstacles.",
      },
    ],
  },
  {
    id: "action_extra_move",
    keywords: ["rejoue", "extra tour", "coup supplémentaire", "agile"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "trigger:onCapture" },
      { type: "ADD_MECHANIC", mechanic: "action:extraMove" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Peut rejouer après avoir effectué une capture.",
      },
      {
        type: "EXPECT_ACTION",
        action: "turn.grantExtra",
        expected: true,
        reason: "Doit donner un tour supplémentaire.",
      },
    ],
  },
  {
    id: "action_double_attack",
    keywords: ["double attaque", "frappe double", "deux fois"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "attack:double" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Peut attaquer deux fois dans le même tour.",
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 4 },
      {
        type: "EXPECT_ACTION",
        action: "turn.grantExtra",
        expected: true,
        reason: "Nécessite une forme d'action supplémentaire.",
      },
    ],
  },

  // --- Contrôle ---
  {
    id: "action_push",
    keywords: ["repousse", "pousse", "bouscule"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "control:push" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.piecesInRadius",
        params: { radius: 1, enemyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 2 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Repousse une pièce ennemie adjacente d'une case.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.move",
        expected: true,
        reason: "Doit déplacer la pièce ennemie.",
      },
    ],
  },
  {
    id: "action_pull",
    keywords: ["attire", "grappin", "ramène", "ramene", "traction"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "control:pull" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.raycastFirstHits",
        params: { directions: ["ortho"], maxRange: 4, enemyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Attire une pièce ennemie en ligne droite.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.move",
        expected: true,
        reason: "Doit attirer la pièce ennemie.",
      },
    ],
  },
  {
    id: "action_hook",
    keywords: ["crochet", "harpon"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "control:hook" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.raycastFirstHits",
        params: { directions: ["diag"], maxRange: 4, enemyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Attire une pièce ennemie en diagonale.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.move",
        expected: true,
        reason: "Doit attirer la pièce ennemie.",
      },
    ],
  },
  {
    id: "action_convert",
    keywords: ["convertit", "charme", "contrôle", "capture mentale"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "control:convert" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.piecesInRadius",
        params: { radius: 1, enemyOnly: true, pieceTypes: ["pawn"] },
      },
      { type: "SET_LIMIT", limit: "oncePerMatch", value: true },
      {
        type: "EXPECT_ACTION",
        action: "piece.setSide",
        expected: true,
        reason: "Doit changer le camp d'un pion ennemi.",
      },
    ],
  },
  {
    id: "action_swap_ally",
    keywords: ["permutation allié", "échange allié", "intervertit"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "swap:ally" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.allyPiecesInSight",
        params: { directions: ["ortho", "diag"], maxRange: 4 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "EXPECT_ACTION",
        action: "piece.swap",
        expected: true,
        reason: "Doit échanger sa place avec un allié.",
      },
    ],
  },

  // --- Support ---
  {
    id: "action_heal",
    keywords: ["soin", "guérit", "régénère", "répare"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "support:heal" },
      { type: "ADD_MECHANIC", mechanic: "status:regenerating" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.allyPiecesInRadius",
        params: { radius: 2 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "EXPECT_ACTION",
        action: "piece.setStatus",
        expected: true,
        reason: "Doit soigner un allié.",
      },
    ],
  },
  {
    id: "action_shield",
    keywords: ["bouclier", "protège", "armure", "défend"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "support:shield" },
      { type: "ADD_MECHANIC", mechanic: "status:shielded" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.allyPiecesInRadius",
        params: { radius: 1 },
      },
      { type: "SET_LIMIT", limit: "duration", value: 1 },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "EXPECT_ACTION",
        action: "piece.setStatus",
        expected: true,
        reason: "Doit appliquer un bouclier à un allié.",
      },
    ],
  },
  {
    id: "action_inspire_aura",
    keywords: ["aura", "inspire", "buff", "moral", "encourage"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "aura:buff" },
      { type: "ADD_MECHANIC", mechanic: "status:inspired" },
      { type: "ADD_STATUS", status: "inspired" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Les alliés adjacents gagnent un bonus (ex: +1 attaque).",
      },
    ],
  },
  {
    id: "action_weaken_aura",
    keywords: [
      "affaiblit",
      "malédiction",
      "debuff",
      "terreur",
      "aura négative",
    ],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "aura:debuff" },
      { type: "ADD_MECHANIC", mechanic: "status:weakened" },
      { type: "ADD_STATUS", status: "weakened" },
      {
        type: "ADD_TEXT_HINT",
        hint: "Les ennemis adjacents subissent un malus.",
      },
    ],
  },

  // --- Hazop (Dangers & Terrain) ---
  {
    id: "action_portal",
    keywords: ["portail", "passage", "vortex"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "hazard:portal" },
      { type: "ADD_HAZARD", hazard: "portal" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.anyEmptyTile",
        params: {},
      },
      { type: "SET_LIMIT", limit: "oncePerMatch", value: true },
      {
        type: "ADD_TEXT_HINT",
        hint: "Crée un portail. Le suivant créé sera lié au premier.",
      },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "Doit créer un portail.",
      },
    ],
  },
  {
    id: "action_time_bomb",
    keywords: ["bombe", "retardement", "explosif", "tic tac"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "hazard:time_bomb" },
      { type: "ADD_HAZARD", hazard: "time_bomb" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.anyEmptyTile",
        params: {},
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 4 },
      { type: "SET_LIMIT", limit: "duration", value: 3 },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "Doit poser une bombe à retardement.",
      },
    ],
  },
  {
    id: "action_spawn_ally",
    keywords: [
      "invoque un allié",
      "invoque un pion",
      "crée allié",
      "créé allié",
      "cree allie",
      "clone",
      "duplique",
      "copie",
    ],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "spawn:ally" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.neighborsEmpty",
        params: { radius: 1 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 5 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Crée un pion allié sur une case adjacente.",
      },
      {
        type: "EXPECT_ACTION",
        action: "piece.spawn",
        expected: true,
        reason: "Doit invoquer une nouvelle pièce.",
      },
    ],
  },
  {
    id: "action_build_turret",
    keywords: ["tourelle", "construit", "défense", "sentinelle"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "hazard:turret" },
      { type: "ADD_HAZARD", hazard: "turret" },
      {
        type: "SET_TARGETING",
        mode: "tile",
        provider: "provider.neighborsEmpty",
        params: { radius: 1 },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 5 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Construit une tourelle qui tire automatiquement.",
      },
      {
        type: "EXPECT_ACTION",
        action: "hazard.spawn",
        expected: true,
        reason: "Doit construire une tourelle.",
      },
    ],
  },
  {
    id: "action_sacrifice_buff",
    keywords: ["sacrifice", "explose buff", "donne force"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "trigger:onDeath" },
      { type: "ADD_MECHANIC", mechanic: "area:onDeathBuff" },
      {
        type: "ADD_TEXT_HINT",
        hint: "À sa mort, donne un bonus aux alliés adjacents.",
      },
      {
        type: "EXPECT_ACTION",
        action: "area.applyEffect",
        expected: true,
        reason: "Doit buffer les alliés à la mort.",
      },
    ],
  },
  {
    id: "action_chain_lightning",
    keywords: ["chaîne", "éclair", "électrique", "foudre"],
    commands: [
      { type: "ADD_MECHANIC", mechanic: "projectile:chain" },
      {
        type: "SET_TARGETING",
        mode: "piece",
        provider: "provider.raycastFirstHits",
        params: { directions: ["ortho", "diag"], maxRange: 4, enemyOnly: true },
      },
      { type: "SET_LIMIT", limit: "cooldownPerPiece", value: 3 },
      {
        type: "ADD_TEXT_HINT",
        hint: "Lance un éclair qui rebondit sur 3 ennemis.",
      },
      {
        type: "EXPECT_ACTION",
        action: "projectile.spawn",
        expected: true,
        reason: "Doit lancer un éclair.",
      },
    ],
  },
];

const ruleBlueprints: RuleBlueprint[] = [
  {
    id: "pawn_mines",
    ruleName: "Pions Mineurs",
    templateId: "pawn_mines",
    category: "special",
    requiredBricks: ["piece_pawn", "action_mine"],
    forcedPieces: ["pawn"],
  },
  {
    id: "bishop_blink",
    ruleName: "Blink du fou",
    templateId: "bishop_blink",
    category: "movement",
    requiredBricks: ["piece_bishop", "action_teleport"],
    forcedPieces: ["bishop"],
  },
  {
    id: "queen_ice_missile",
    ruleName: "Missile de glace",
    templateId: "queen_ice_missile",
    category: "capture",
    requiredBricks: ["piece_queen", "action_ice_missile"],
    forcedPieces: ["queen"],
  },
  {
    id: "knight_quicksand",
    ruleName: "Sables mouvants du cavalier",
    templateId: "knight_quicksand",
    category: "restriction",
    requiredBricks: ["piece_knight", "action_quicksand"],
    forcedPieces: ["knight"],
  },
  {
    id: "pawn_wall",
    ruleName: "Mur de pion",
    templateId: "pawn_wall",
    category: "defense",
    requiredBricks: ["piece_pawn", "action_wall"],
    forcedPieces: ["pawn"],
  },
  {
    id: "knight_archer",
    ruleName: "Chevalier archer",
    templateId: "knight_archer",
    category: "special",
    requiredBricks: ["piece_knight", "action_morph_archer"],
    forcedPieces: ["knight"],
  },
  {
    id: "bishop_swap",
    ruleName: "Permutation du fou",
    templateId: "bishop_swap",
    category: "special",
    requiredBricks: ["piece_bishop", "action_swap_enemy"],
    forcedPieces: ["bishop"],
  },
  {
    id: "dynamite_once",
    ruleName: "Dynamite tactique",
    templateId: "dynamite_once",
    category: "special",
    requiredBricks: ["action_dynamite"],
    forcedPieces: ["pawn", "knight", "bishop", "rook", "queen"],
  },
  {
    id: "glue_slow",
    ruleName: "Champ de colle",
    templateId: "glue_slow",
    category: "restriction",
    requiredBricks: ["action_glue"],
    forcedPieces: ["rook", "bishop", "queen"],
  },
];

const resolveBlueprint = (
  bricks: MechanicBrick[],
): RuleBlueprint | undefined => {
  const matchedIds = new Set(bricks.map((brick) => brick.id));

  const scoredCandidates = ruleBlueprints
    .map((blueprint) => {
      const matches = blueprint.requiredBricks.every((id) =>
        matchedIds.has(id),
      );

      if (!matches) return null;

      return {
        blueprint,
        score: blueprint.requiredBricks.length,
      };
    })
    .filter(
      (candidate): candidate is { blueprint: RuleBlueprint; score: number } =>
        candidate !== null,
    )
    .sort((a, b) => b.score - a.score);

  return scoredCandidates[0]?.blueprint;
};

const overridePieces = (
  commands: RuleCommand[],
  forcedPieces: string[],
): RuleCommand[] => {
  if (!forcedPieces.length) return commands;

  const normalizedPieces = Array.from(
    new Set(forcedPieces.map((piece) => piece.toLowerCase())),
  );

  const withoutPieces = commands.filter(
    (command) => command.type !== "SET_PIECES",
  );

  return [
    {
      type: "SET_PIECES",
      pieces: normalizedPieces,
    } satisfies SetPiecesCommand,
    ...withoutPieces,
  ];
};

const normalizeText = (input: string) => input.normalize("NFKC").toLowerCase();

/**
 * Logique de fallback si aucune brique n'est trouvée.
 */
const fallbackProgram = (input: string): RuleProgram => ({
  source: input.trim(),
  commands: [
    buildDefineRule(fewShotIntents[0].ruleName, fewShotIntents[0].templateId),
    { type: "SET_SUMMARY", summary: input },
    { type: "SET_PIECES", pieces: fewShotIntents[0].affectedPieces },
    ...fewShotIntents[0].mechanics.map(
      (mechanic): AddMechanicCommand => ({
        type: "ADD_MECHANIC" as const,
        mechanic,
      }),
    ),
  ],
});

/**
 * Combine les commandes de plusieurs briques en gérant les fusions.
 * @param bricks - Briques de mécaniques identifiées
 * @returns - Liste de commandes fusionnées et dédoublonnées
 */
function combineCommands(bricks: MechanicBrick[]): RuleCommand[] {
  // Map pour les commandes "SET" (la dernière gagne)
  const commandMap = new Map<string, RuleCommand>();

  // Liste pour les commandes "ADD" (cumulables)
  const additiveCommands: RuleCommand[] = [];

  // Logique de fusion spéciale pour SET_PIECES
  const pieceList = new Set<SetPiecesCommand["pieces"][number]>();
  let pieceCommandFound = false;

  for (const brick of bricks) {
    for (const command of brick.commands) {
      switch (command.type) {
        case "SET_PIECES":
          pieceCommandFound = true;
          command.pieces.forEach((piece) => pieceList.add(piece));
          break;
        case "SET_TARGETING":
          commandMap.set(command.type, command);
          break;
        case "ADD_MECHANIC":
        case "ADD_HAZARD":
        case "ADD_STATUS":
        case "SET_LIMIT":
        case "SET_REQUIREMENT":
        case "ADD_TEXT_HINT":
        case "EXPECT_ACTION":
          additiveCommands.push(command);
          break;
        default:
          break;
      }
    }
  }

  const mergedSetterCommands = Array.from(commandMap.values());
  if (pieceCommandFound) {
    mergedSetterCommands.push({
      type: "SET_PIECES",
      pieces: Array.from(pieceList),
    });
  }

  const uniqueAdditiveCommands = Array.from(
    new Map(additiveCommands.map((cmd) => [JSON.stringify(cmd), cmd])).values(),
  );

  return [...mergedSetterCommands, ...uniqueAdditiveCommands];
}

/**
 * Extrait un programme de règles en combinant les mots-clés du prompt.
 */
export const extractProgram = (
  input: string,
): { program: RuleProgram; warnings: ProgramExtractionWarning[] } => {
  const normalized = normalizeText(input);
  const warnings: ProgramExtractionWarning[] = [];

  // 1. Trouver TOUTES les briques correspondantes (au lieu de .find())
  const matchedBricks = mechanicBricks.filter((brick) =>
    brick.keywords.some((keyword) => normalized.includes(keyword)),
  );

  // 2. Gérer le cas où aucune brique n'est trouvée
  if (matchedBricks.length === 0) {
    warnings.push({
      code: "no_match",
      message:
        "Aucune brique de mécanique ne correspond, fallback few-shot utilisé.",
    });
    return { program: fallbackProgram(input), warnings };
  }

  // 3. Combiner les commandes des briques trouvées
  const blueprint = resolveBlueprint(matchedBricks);

  let combinedCommands = combineCommands(matchedBricks);
  if (blueprint?.forcedPieces) {
    combinedCommands = overridePieces(combinedCommands, blueprint.forcedPieces);
  }

  // 4. Construire le programme final
  const ruleName =
    blueprint?.ruleName ??
    matchedBricks
      .map((brick) => brick.id.split("_").pop())
      .map((name) => name?.charAt(0).toUpperCase() + name?.slice(1))
      .join(" ");

  const templateId =
    blueprint?.templateId ?? matchedBricks.map((brick) => brick.id).join("-");

  const category = blueprint?.category ?? "custom";

  const finalCommands: RuleCommand[] = [
    buildDefineRule(
      ruleName || "Règle Combinée",
      templateId || `custom_${Date.now()}`,
      category,
    ),
    { type: "SET_SUMMARY", summary: input.trim() },
    ...combinedCommands,
  ];

  return {
    program: { source: input.trim(), commands: finalCommands },
    warnings,
  };
};
