import { compileRuleBlueprint } from "@/rules-v2/compiler";
import type { RuleBlueprintV2, RuleCategory, BlueprintCondition, BlueprintEffect } from "@/rules-v2/types";
import type { RuleJSON } from "@/engine/types";

/**
 * Curated Aichess laboratory variants. The ability descriptions are authoritative:
 * labels are creative ideas, not guarantees that an unsupported advanced mechanic
 * (e.g. a novel win condition) already exists.
 * Every executable recipe is compiled through the *same* guarded V2 DSL as AI rules.
 * Catalog demos are intentionally local, never submitted as ranked rule versions.
 */
type AbilityMode = "trap" | "warp" | "warp-near" | "capture" | "duplicate" | "summon" | "promote" | "cloak" | "sacrifice";
type Piece = "any" | "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
type Group = {family: string; category: RuleCategory; titles: readonly string[]; modes: readonly AbilityMode[]; exact: readonly number[]; sprite: string};
const GROUPS: readonly Group[] = [
  {
    "family": "Pièges et terrain",
    "category": "special",
    "titles": [
      "Sables mouvants",
      "Mine de proximité",
      "Gel de case",
      "Lave montante",
      "Portail piégé",
      "Bombe retardée",
      "Brouillard toxique",
      "Ronces entravantes",
      "Faille gravitationnelle",
      "Case électrifiée"
    ],
    "modes": [
      "trap",
      "trap",
      "trap",
      "trap",
      "trap",
      "trap",
      "trap",
      "trap",
      "trap",
      "trap"
    ],
    "exact": [
      0
    ],
    "sprite": "aichess_sand"
  },
  {
    "family": "Déplacement",
    "category": "movement",
    "titles": [
      "Cavalier bondissant",
      "Tour sauteuse",
      "Fou zigzag",
      "Pion sprinteur",
      "Dame téléportée",
      "Roi esquive",
      "Marche arrière",
      "Glissade de glace",
      "Échange de places",
      "Charge diagonale"
    ],
    "modes": [
      "warp-near",
      "warp",
      "warp-near",
      "warp-near",
      "warp",
      "warp-near",
      "warp-near",
      "warp",
      "warp",
      "warp-near"
    ],
    "exact": [
      1,
      4,
      5
    ],
    "sprite": "aichess_portal"
  },
  {
    "family": "Captures",
    "category": "capture",
    "titles": [
      "Capture en chaîne",
      "Assassin furtif",
      "Capture explosive",
      "Vampirisme",
      "Riposte automatique",
      "Marque du chasseur",
      "Élimination à distance",
      "Capture ricochet",
      "Sacrifice tactique",
      "Piège de contre-attaque"
    ],
    "modes": [
      "capture",
      "capture",
      "capture",
      "capture",
      "capture",
      "capture",
      "capture",
      "capture",
      "sacrifice",
      "trap"
    ],
    "exact": [
      6,
      8
    ],
    "sprite": "aichess_lightning"
  },
  {
    "family": "Défense",
    "category": "defense",
    "titles": [
      "Bouclier temporaire",
      "Armure renforcée",
      "Invulnérabilité d'un tour",
      "Reflet protecteur",
      "Mur de pierre",
      "Protection du roi",
      "Interception héroïque",
      "Résurrection unique",
      "Déviation d'attaque",
      "Sanctuaire"
    ],
    "modes": [
      "duplicate",
      "duplicate",
      "cloak",
      "duplicate",
      "summon",
      "summon",
      "warp-near",
      "summon",
      "warp-near",
      "trap"
    ],
    "exact": [],
    "sprite": "aichess_rook"
  },
  {
    "family": "Transformations",
    "category": "special",
    "titles": [
      "Pion super-robot",
      "Cavalier dragon",
      "Tour forteresse",
      "Fou spectral",
      "Dame phénix",
      "Pion caméléon",
      "Métamorphose aléatoire",
      "Fusion alliée",
      "Miniaturisation",
      "Évolution par captures"
    ],
    "modes": [
      "promote",
      "promote",
      "duplicate",
      "cloak",
      "cloak",
      "promote",
      "promote",
      "duplicate",
      "cloak",
      "promote"
    ],
    "exact": [
      3,
      5
    ],
    "sprite": "aichess_robot"
  },
  {
    "family": "Magie et éléments",
    "category": "special",
    "titles": [
      "Foudre ciblée",
      "Tempête de sable",
      "Nova de glace",
      "Vortex de feu",
      "Portail dimensionnel",
      "Onde de choc",
      "Sphère d'énergie",
      "Champ magnétique",
      "Pluie de météores",
      "Vent repoussant"
    ],
    "modes": [
      "capture",
      "trap",
      "capture",
      "capture",
      "warp",
      "capture",
      "duplicate",
      "warp-near",
      "capture",
      "warp-near"
    ],
    "exact": [
      0,
      4
    ],
    "sprite": "aichess_fire"
  },
  {
    "family": "Temps et tours",
    "category": "behavior",
    "titles": [
      "Tour supplémentaire",
      "Gel temporel",
      "Compte à rebours",
      "Recharge accélérée",
      "Accélération des pions",
      "Retard d'action",
      "Écho du dernier coup",
      "Marqueur de tour",
      "Effet à durée limitée",
      "Réinitialisation des pouvoirs"
    ],
    "modes": [
      "warp",
      "cloak",
      "trap",
      "duplicate",
      "warp-near",
      "warp",
      "warp-near",
      "summon",
      "cloak",
      "duplicate"
    ],
    "exact": [
      0
    ],
    "sprite": "aichess_portal"
  },
  {
    "family": "Invocations et duplications",
    "category": "special",
    "titles": [
      "Clone de pion",
      "Invocation de sentinelle",
      "Tour fantôme",
      "Essaim de pions",
      "Renfort sur bord",
      "Pièce miroir",
      "Golem temporaire",
      "Gardien de case",
      "Copie éphémère",
      "Réapparition différée"
    ],
    "modes": [
      "duplicate",
      "summon",
      "duplicate",
      "summon",
      "summon",
      "duplicate",
      "summon",
      "summon",
      "duplicate",
      "summon"
    ],
    "exact": [
      0,
      1,
      3,
      5,
      7
    ],
    "sprite": "aichess_bishop"
  },
  {
    "family": "Objectifs et victoire",
    "category": "victory",
    "titles": [
      "Capture du drapeau",
      "Roi de la colline",
      "Contrôle de trois cases",
      "Survie dix tours",
      "Course de pions",
      "Points de captures",
      "Domination centrale",
      "Objectif secret",
      "Relique à protéger",
      "Victoire par élimination"
    ],
    "modes": [
      "summon",
      "capture",
      "trap",
      "duplicate",
      "warp",
      "capture",
      "summon",
      "cloak",
      "duplicate",
      "capture"
    ],
    "exact": [],
    "sprite": "aichess_queen"
  },
  {
    "family": "Chaos et stratégie",
    "category": "special",
    "titles": [
      "Gravité inversée",
      "Cases mouvantes",
      "Téléportation réciproque",
      "Brouillard de guerre",
      "Pièces invisibles",
      "Terrain aléatoire",
      "Pénalité de zone",
      "Bonus de série",
      "Aura de commandement",
      "Échange de compétences"
    ],
    "modes": [
      "warp",
      "trap",
      "warp",
      "cloak",
      "cloak",
      "trap",
      "trap",
      "capture",
      "duplicate",
      "promote"
    ],
    "exact": [
      4
    ],
    "sprite": "aichess_knight"
  }
];

export interface CatalogRule {
  id: string;
  title: string;
  family: string;
  category: RuleCategory;
  mode: AbilityMode;
  piece: Piece;
  sprite: string;
  cooldown: number;
  uses: number;
  faithful: boolean;
  summary: string;
  /** The goal of the original concept (which can exceed the current V2 engine). */
  intendedConcept: string;
}
const GLOSS: Record<AbilityMode, string> = {
  "trap": "Dépose un piège sur une case libre : la première pièce ennemie qui y entre est capturée. Les alliés ne le déclenchent pas.",
  "warp": "Téléporte la pièce sélectionnée sur une case libre choisie. Cette capacité consomme le tour.",
  "warp-near": "Déplace instantanément la pièce sélectionnée vers une case libre voisine autorisée.",
  "capture": "Capture une pièce ennemie ciblée à distance, une fois le délai de récupération écoulé.",
  "duplicate": "Copie la pièce sélectionnée sur une case libre choisie, sans déplacer l'original.",
  "summon": "Invoque un pion allié sur une case libre. Il respecte ensuite les mouvements normaux.",
  "promote": "Transforme la pièce sélectionnée en une pièce plus puissante définie par cette variante.",
  "cloak": "Rend invisible la pièce sélectionnée. L'effet dure jusqu'à la fin de la partie locale.",
  "sacrifice": "Sacrifie immédiatement la pièce sélectionnée et termine le tour.",
};

const pickPiece = (title: string, mode: AbilityMode): Piece => {
  if (/\broi\b/i.test(title)) return "king";
  if (/\bdame\b|\breine\b/i.test(title)) return "queen";
  if (/\bcavalier\b/i.test(title)) return "knight";
  if (/\bfou\b/i.test(title)) return "bishop";
  if (/\btour\b/i.test(title) && !/tour supplémentaire|tour de/i.test(title)) return "rook";
  if (/\bpion\b/i.test(title)) return "pawn";
  return mode === "promote" ? "pawn" : "any";
};

export const RULE_CATALOGUE_100: CatalogRule[] = GROUPS.flatMap((group, familyIndex) =>
  group.titles.map((title, index) => {
    const mode = group.modes[index];
    const piece = pickPiece(title, mode);
    const id = `catalog-${String(familyIndex * 10 + index + 1).padStart(3, "0")}`;
    const faithful = ["catalog-001", "catalog-015", "catalog-027", "catalog-029", "catalog-055", "catalog-061", "catalog-071", "catalog-076", "catalog-095"].includes(id);
    const summary = GLOSS[mode];
    return {
      id, title, family: group.family, category: group.category, mode, piece,
      sprite: group.sprite,
      cooldown: 1 + (index % 4),
      uses: 1 + (index % 3),
      faithful,
      summary,
      intendedConcept: title,
    };
  }),
);

function argument(name: string, value: string | number | boolean, token = false) {
  const kind = token ? "token" : typeof value;
  return {
    name, kind: kind as "string" | "number" | "boolean" | "token",
    stringValue: kind === "string" || kind === "token" ? String(value) : "",
    numberValue: kind === "number" ? Number(value) : 0,
    booleanValue: kind === "boolean" ? Boolean(value) : false,
    stringListValue: [] as string[],
  };
}
const cond = (id: string, op: BlueprintCondition["op"]): BlueprintCondition => ({id, op, negate:false, arguments:[]});
const eff = (id: string, op: BlueprintEffect["op"], args: ReturnType<typeof argument>[] = []): BlueprintEffect => ({id, op, arguments:args});
const selected = (name: string) => argument(name, "$pieceId", true);
const targetTile = (name: string) => argument(name, "$targetTile", true);
const sourceTile = (name: string) => argument(name, "$sourceTile", true);

export function makeCatalogBlueprint(item: CatalogRule): RuleBlueprintV2 {
  const noTarget = item.mode === "cloak" || item.mode === "promote" || item.mode === "sacrifice";
  const targetEnemy = item.mode === "capture";
  const targetingMode = noTarget ? "none" : targetEnemy ? "piece" : "tile";
  const provider = noTarget ? "none"
    : targetEnemy ? "provider.enemyPieces"
    : item.mode === "warp-near" ? "provider.neighborsEmpty"
    : "provider.anyEmptyTile";
  let pieceTypes: Piece[] = item.piece === "any"
    ? item.mode === "duplicate" || item.mode === "promote" || item.mode === "sacrifice"
      ? ["pawn","knight","bishop","rook","queen"] : ["any"]
    : [item.piece];
  if ((item.mode === "promote" || item.mode === "duplicate" || item.mode === "sacrifice") && pieceTypes.includes("king")) pieceTypes = ["pawn"];
  const guarded = noTarget ? [cond("source-exists","piece.exists")]
    : targetEnemy ? [cond("tile-present","ctx.hasTargetTile"), cond("target-present","ctx.hasTargetPiece"), cond("target-enemy","target.isEnemy")]
    : [cond("tile-present","ctx.hasTargetTile"), cond("tile-empty","tile.isEmpty")];
  let primary: BlueprintEffect;
  switch (item.mode) {
    case "trap":
      primary = eff("lay-trap","tile.setTrap",[targetTile("tile"),argument("kind","quicksand"),argument("owner","$ctx.side",true),argument("sprite","quicksand_trap")]); break;
    case "warp": case "warp-near":
      primary = eff("teleport","piece.move",[selected("pieceId"),targetTile("to")]); break;
    case "capture":
      primary = eff("capture-target","piece.capture",[argument("pieceId","$targetPieceId",true),argument("reason",item.title)]); break;
    case "duplicate":
      primary = eff("duplicate","piece.duplicate",[selected("sourceId"),targetTile("tile")]); break;
    case "summon":
      primary = eff("summon","piece.spawn",[argument("type","pawn"),argument("side","$ctx.side",true),targetTile("tile")]); break;
    case "promote":
      primary = eff("promote","piece.promote",[selected("pieceId"),argument("toType",item.id.endsWith("06") ? "bishop" : "queen")]); break;
    case "cloak":
      primary = eff("cloak","piece.setInvisible",[selected("pieceId"),argument("value",true)]); break;
    case "sacrifice":
      primary = eff("sacrifice","piece.capture",[selected("pieceId"),argument("reason","voluntary")]); break;
  }
  const visualTile = noTarget ? sourceTile("tile") : targetTile("tile");
  const triggers: RuleBlueprintV2["triggers"] = [{
    id: "use-power",event:"ui.action", actionId:"activate", priority:10,
    conditions:guarded, effects:[primary,eff("animated-effect","vfx.play",[argument("sprite",item.sprite),visualTile])],
    onFailure:"blockAction",message:"Cette cible ne respecte pas les conditions de la règle.",
  }];
  if (item.mode === "trap") {
    triggers.push({
      id:"resolve-trap",event:"lifecycle.onEnterTile", actionId:"", priority:10,
      conditions:[],
      effects:[eff("resolve-quicksand","tile.resolveTrap",[argument("tile","$ctx.to",true)])],
      onFailure:"skip",message:"",
    });
  }
  return {
    schemaVersion:"2.0.0",ruleKey:item.id,
    title:item.title,
    summary:item.summary,
    category:item.category,tags:["catalogue","local","aichess",item.mode],
    affectedPieces: pieceTypes, sides:["white","black"],
    stateNamespace:item.id,initialStateJson:"{}",
    actions:[{
      id:"activate",label:item.title.slice(0,60),description:item.summary.slice(0,240),
      targetingMode,validTilesProvider:provider,consumesTurn:item.id === "catalog-061" ? false : true,
      cooldownTurns:item.cooldown,maxPerPiece:item.uses,requiresSelection:true,pieceTypes,
    }],
    triggers,
    balance:{
      powerLevel: 3,
      counterplay:["Empêcher la pièce concernée d'utiliser son pouvoir."],
      limitations:[`Au plus ${item.uses} activation(s) par pièce.`,`Recharge : ${item.cooldown} tour(s).`],
    },
    explanation:{
      plainLanguage:item.summary,
      examples:["Sélectionne une pièce compatible, déclenche le pouvoir, puis choisis une case si nécessaire."],
    },
  };
}

export function getCompiledCatalogRule(id: string): RuleJSON | null {
  const item = RULE_CATALOGUE_100.find((entry) => entry.id === id);
  if (!item) return null;
  const result = compileRuleBlueprint(makeCatalogBlueprint(item));
  if (!result.ok || !result.compiledRule) return null;
  // The V2 compiler validates the DSL before this legacy-engine adapter.
  // Its typed "if?: unknown" is already checked by the V2 compiler.
  const compiled = {
    ...result.compiledRule,
    meta:{...result.compiledRule.meta,isActive:true},
  };
  return compiled as unknown as RuleJSON;
}
