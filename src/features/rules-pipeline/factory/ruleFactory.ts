import {
  canonicalIntentSchema,
  type CanonicalIntent,
} from "../schemas/canonicalIntent";
import { resolveAssets } from "../assets/lexicon";
import type {
  RuleProgram,
  RuleCommand,
  RuleCommand as Command,
  AddMoveCommand,
  RemoveMoveCommand,
  ExpectMoveCommand,
  TargetOccupation,
} from "../rule-language/types";

export type RuleFactoryWarning = {
  code: string;
  message: string;
};

export type MoveExpectation = {
  type: "move";
  piece: string;
  from: string;
  to: string;
  expected: "legal" | "illegal";
  occupation: TargetOccupation;
  reason?: string;
};

export type ActionExpectation = {
  type: "action";
  action: string;
  expected: boolean;
  reason?: string;
};

export type RuleTestCase = MoveExpectation | ActionExpectation;

export type MovementOverride = {
  piece: string;
  added: AddMoveCommand[];
  removed: RemoveMoveCommand[];
};

export type RuleFactoryResult = {
  intent: CanonicalIntent;
  warnings: RuleFactoryWarning[];
  tests: RuleTestCase[];
  movementOverrides: MovementOverride[];
};

const normalizePieces = (pieces: string[]): string[] =>
  Array.from(new Set(pieces.map((piece) => piece.toLowerCase())));

const ensureArray = <T>(arr: T[] | undefined): T[] =>
  arr ? Array.from(new Set(arr)) : [];

const DEFAULT_LIMITS: CanonicalIntent["limits"] = {};

const applyCommand = (
  state: RuleFactoryState,
  command: Command,
  warnings: RuleFactoryWarning[],
  tests: RuleTestCase[],
) => {
  switch (command.type) {
    case "DEFINE_RULE":
      state.ruleName = command.name;
      state.templateId = command.template;
      state.category = command.category;
      break;
    case "SET_SUMMARY":
      state.summary = command.summary;
      break;
    case "SET_PIECES":
      state.pieces = normalizePieces(command.pieces);
      break;
    case "ADD_MECHANIC":
      state.mechanics.add(command.mechanic);
      break;
    case "ADD_HAZARD":
      state.hazards.add(command.hazard);
      break;
    case "ADD_STATUS":
      state.statuses.add(command.status);
      break;
    case "ADD_KEYWORD":
      state.keywords.add(command.keyword);
      break;
    case "SET_TARGETING":
      state.targeting = {
        mode: command.mode,
        provider: command.provider,
        params: command.params,
      };
      break;
    case "SET_LIMIT":
      state.limits = state.limits ?? { ...DEFAULT_LIMITS };
      if (
        command.limit === "cooldownPerPiece" &&
        typeof command.value === "number"
      ) {
        state.limits.cooldownPerPiece = command.value;
      } else if (
        command.limit === "duration" &&
        typeof command.value === "number"
      ) {
        state.limits.duration = command.value;
      } else if (
        command.limit === "chargesPerMatch" &&
        typeof command.value === "number"
      ) {
        state.limits.chargesPerMatch = command.value;
      } else if (
        command.limit === "oncePerMatch" &&
        typeof command.value === "boolean"
      ) {
        state.limits.oncePerMatch = command.value;
      } else {
        warnings.push({
          code: "invalid_limit",
          message: `Valeur invalide pour la limite ${command.limit}.`,
        });
      }
      break;
    case "SET_REQUIREMENT":
      state.requirements = state.requirements ?? {};
      state.requirements[command.requirement] = command.value;
      break;
    case "ADD_TEXT_HINT":
      state.textHints.push(command.hint);
      break;
    case "ADD_NOTE":
      state.notes.push(command.note);
      break;
    case "EXPECT_ACTION": {
      const expectation: ActionExpectation = {
        type: "action",
        action: command.action,
        expected: command.expected ?? true,
        reason: command.reason,
      };
      tests.push(expectation);
      break;
    }
    case "EXPECT_MOVE": {
      const expectation: MoveExpectation = {
        type: "move",
        piece: command.piece,
        from: command.from,
        to: command.to,
        expected: command.expected,
        occupation: command.occupation ?? "empty",
        reason: command.reason,
      };
      tests.push(expectation);
      break;
    }
    case "ADD_MOVE": {
      state.movementOverrides.set(command.piece, {
        piece: command.piece,
        added: [
          ...(state.movementOverrides.get(command.piece)?.added ?? []),
          command,
        ],
        removed: state.movementOverrides.get(command.piece)?.removed ?? [],
      });
      break;
    }
    case "REMOVE_MOVE": {
      state.movementOverrides.set(command.piece, {
        piece: command.piece,
        added: state.movementOverrides.get(command.piece)?.added ?? [],
        removed: [
          ...(state.movementOverrides.get(command.piece)?.removed ?? []),
          command,
        ],
      });
      break;
    }
    default: {
      // TypeScript exhaustive check - this should never happen
      const _exhaustiveCheck: never = command;
      warnings.push({
        code: "unknown_command",
        message: `Commande non gérée par le RuleFactory.`,
      });
      break;
    }
  }
};

type RuleFactoryState = {
  ruleName?: string;
  templateId?: CanonicalIntent["templateId"];
  category?: string;
  summary?: string;
  pieces: string[];
  mechanics: Set<string>;
  hazards: Set<string>;
  statuses: Set<string>;
  keywords: Set<string>;
  targeting?: CanonicalIntent["targeting"];
  limits?: CanonicalIntent["limits"];
  requirements?: CanonicalIntent["requirements"];
  textHints: string[];
  notes: string[];
  movementOverrides: Map<string, MovementOverride>;
};

export const buildRuleFromProgram = (
  program: RuleProgram,
): RuleFactoryResult => {
  const warnings: RuleFactoryWarning[] = [];
  const tests: RuleTestCase[] = [];
  const state: RuleFactoryState = {
    pieces: [],
    mechanics: new Set(),
    hazards: new Set(),
    statuses: new Set(),
    keywords: new Set(),
    textHints: [],
    notes: [],
    movementOverrides: new Map(),
  };

  program.commands.forEach((command) =>
    applyCommand(state, command, warnings, tests),
  );

  if (state.summary) {
    state.notes.push(state.summary);
  }

  if (!state.ruleName) {
    warnings.push({
      code: "missing_rule_name",
      message: "DEFINE_RULE est obligatoire.",
    });
    state.ruleName = "Règle personnalisée";
  }

  if (!state.templateId) {
    warnings.push({
      code: "missing_template",
      message: "Aucun template défini, fallback générique appliqué.",
    });
    state.templateId = "custom_template";
  }

  if (state.pieces.length === 0) {
    warnings.push({
      code: "missing_pieces",
      message: "SET_PIECES doit être fourni avec au moins une pièce.",
    });
    state.pieces = ["pawn"];
  }

  if (state.mechanics.size === 0) {
    warnings.push({
      code: "missing_mechanics",
      message: "Au moins une mécanique doit être définie.",
    });
    state.mechanics.add("custom");
  }

  const assetKeywords = new Set<string>([
    ...state.keywords,
    ...Array.from(state.hazards),
    ...Array.from(state.statuses),
  ]);
  Array.from(state.mechanics).forEach((mechanic) => {
    const keyword = mechanic.split(":").pop();
    if (keyword) assetKeywords.add(keyword);
  });

  const assets = resolveAssets(Array.from(assetKeywords));

  const intent = canonicalIntentSchema.parse({
    ruleName: state.ruleName,
    text: program.source,
    category: state.category,
    templateId: state.templateId,
    affectedPieces: state.pieces,
    mechanics: Array.from(state.mechanics),
    hazards: ensureArray(Array.from(state.hazards)),
    statuses: ensureArray(Array.from(state.statuses)),
    targeting: state.targeting,
    limits: state.limits,
    textHints: state.textHints.length ? state.textHints : undefined,
    notes: state.notes.length ? state.notes : undefined,
    requirements: state.requirements,
    vfx: assets.vfx,
    sfx: assets.sfx,
  });

  const movementOverrides = Array.from(state.movementOverrides.values());

  return {
    intent,
    warnings,
    tests,
    movementOverrides,
  };
};
