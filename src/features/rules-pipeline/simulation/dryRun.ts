import type { RuleJSON } from "@/engine/types";
import type { CanonicalIntent } from "../schemas/canonicalIntent";
import type { RuleTestCase, MovementOverride } from "../factory/ruleFactory";
import type { TargetOccupation } from "../rule-language/types";

export type DryRunIssue = {
  code: string;
  message: string;
};

export type DryRunResult = {
  passed: boolean;
  issues: DryRunIssue[];
};

type Coordinate = { file: number; rank: number };

type MoveDefinition =
  | {
      kind: "step";
      dx: number;
      dy: number;
      captureOnly?: boolean;
      moveOnly?: boolean;
    }
  | {
      kind: "line";
      dx: number;
      dy: number;
      captureOnly?: boolean;
      moveOnly?: boolean;
      maxDistance?: number;
    }
  | {
      kind: "knight";
      dx: number;
      dy: number;
    };

const BASE_MOVES: Record<string, MoveDefinition[]> = {
  pawn: [
    { kind: "step", dx: 0, dy: 1, moveOnly: true },
    { kind: "step", dx: 1, dy: 1, captureOnly: true },
    { kind: "step", dx: -1, dy: 1, captureOnly: true },
  ],
  bishop: [
    { kind: "line", dx: 1, dy: 1 },
    { kind: "line", dx: -1, dy: 1 },
    { kind: "line", dx: 1, dy: -1 },
    { kind: "line", dx: -1, dy: -1 },
  ],
  rook: [
    { kind: "line", dx: 1, dy: 0 },
    { kind: "line", dx: -1, dy: 0 },
    { kind: "line", dx: 0, dy: 1 },
    { kind: "line", dx: 0, dy: -1 },
  ],
  queen: [
    { kind: "line", dx: 1, dy: 1 },
    { kind: "line", dx: -1, dy: 1 },
    { kind: "line", dx: 1, dy: -1 },
    { kind: "line", dx: -1, dy: -1 },
    { kind: "line", dx: 1, dy: 0 },
    { kind: "line", dx: -1, dy: 0 },
    { kind: "line", dx: 0, dy: 1 },
    { kind: "line", dx: 0, dy: -1 },
  ],
  knight: [
    { kind: "knight", dx: 2, dy: 1 },
    { kind: "knight", dx: 2, dy: -1 },
    { kind: "knight", dx: -2, dy: 1 },
    { kind: "knight", dx: -2, dy: -1 },
    { kind: "knight", dx: 1, dy: 2 },
    { kind: "knight", dx: 1, dy: -2 },
    { kind: "knight", dx: -1, dy: 2 },
    { kind: "knight", dx: -1, dy: -2 },
  ],
  king: [
    { kind: "step", dx: 1, dy: 1 },
    { kind: "step", dx: -1, dy: 1 },
    { kind: "step", dx: 1, dy: -1 },
    { kind: "step", dx: -1, dy: -1 },
    { kind: "step", dx: 1, dy: 0 },
    { kind: "step", dx: -1, dy: 0 },
    { kind: "step", dx: 0, dy: 1 },
    { kind: "step", dx: 0, dy: -1 },
  ],
};

const cloneMoves = (moves: MoveDefinition[]): MoveDefinition[] =>
  moves.map((move) => ({ ...move }));

const parseSquare = (square: string): Coordinate => {
  if (!/^[a-h][1-8]$/i.test(square)) {
    throw new Error(`Case invalide: ${square}`);
  }
  const file = square.toLowerCase().charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return { file, rank };
};

const sameDirection = (
  dx: number,
  dy: number,
  stepX: number,
  stepY: number,
) => {
  if (stepX === 0 && stepY === 0) return false;
  if (stepX === 0) return dx === 0 && Math.sign(dy) === Math.sign(stepY);
  if (stepY === 0) return dy === 0 && Math.sign(dx) === Math.sign(stepX);
  return (
    Math.sign(dx) === Math.sign(stepX) &&
    Math.sign(dy) === Math.sign(stepY) &&
    Math.abs(dx) === Math.abs(dy)
  );
};

const applyRemoval = (moves: MoveDefinition[], override: MovementOverride) => {
  override.removed.forEach((command) => {
    switch (command.pattern) {
      case "forward":
        moves = moves.filter(
          (move) => !(move.kind === "step" && move.dx === 0 && move.dy === 1),
        );
        break;
      case "diagonal":
        moves = moves.filter(
          (move) =>
            !(
              (move.kind === "step" || move.kind === "line") &&
              Math.abs(move.dx) === 1 &&
              Math.abs(move.dy) === 1
            ),
        );
        break;
      case "orthogonal":
        moves = moves.filter(
          (move) =>
            !(
              (move.kind === "step" || move.kind === "line") &&
              ((Math.abs(move.dx) === 1 && move.dy === 0) ||
                (Math.abs(move.dy) === 1 && move.dx === 0))
            ),
        );
        break;
      case "knight":
        moves = moves.filter((move) => move.kind !== "knight");
        break;
      case "line":
        moves = moves.filter((move) => move.kind !== "line");
        break;
      case "teleport":
        moves = moves.filter((move) => move.kind !== "step");
        break;
    }
  });
  return moves;
};

const addMoveDefinitions = (override: MovementOverride): MoveDefinition[] => {
  const additions: MoveDefinition[] = [];
  override.added.forEach((command) => {
    const constraints = new Set(command.constraints ?? []);
    switch (command.pattern) {
      case "forward":
        additions.push({
          kind: "step",
          dx: 0,
          dy: 1,
          captureOnly: constraints.has("capture_only") || undefined,
          moveOnly:
            constraints.has("non_capture") ||
            (!constraints.has("capture_only") ? true : undefined),
        });
        break;
      case "diagonal": {
        const maxDistance = command.maxDistance ?? 1;
        const createEntry = (dx: number, dy: number): MoveDefinition =>
          maxDistance > 1 || constraints.has("multi_step")
            ? {
                kind: "line",
                dx,
                dy,
                maxDistance,
                captureOnly: constraints.has("capture_only") || undefined,
                moveOnly: constraints.has("non_capture") || undefined,
              }
            : {
                kind: "step",
                dx,
                dy,
                captureOnly: constraints.has("capture_only") || undefined,
                moveOnly: constraints.has("non_capture") || undefined,
              };
        additions.push(createEntry(1, 1), createEntry(-1, 1));
        if (!constraints.has("single_step")) {
          additions.push(createEntry(1, -1), createEntry(-1, -1));
        }
        break;
      }
      case "orthogonal": {
        const maxDistance = command.maxDistance;
        const createEntry = (dx: number, dy: number): MoveDefinition => ({
          kind: maxDistance && maxDistance <= 1 ? "step" : "line",
          dx,
          dy,
          maxDistance,
          captureOnly: constraints.has("capture_only") || undefined,
          moveOnly: constraints.has("non_capture") || undefined,
        });
        additions.push(
          createEntry(1, 0),
          createEntry(-1, 0),
          createEntry(0, 1),
          createEntry(0, -1),
        );
        break;
      }
      case "knight":
        additions.push(
          { kind: "knight", dx: 2, dy: 1 },
          { kind: "knight", dx: 2, dy: -1 },
          { kind: "knight", dx: -2, dy: 1 },
          { kind: "knight", dx: -2, dy: -1 },
          { kind: "knight", dx: 1, dy: 2 },
          { kind: "knight", dx: 1, dy: -2 },
          { kind: "knight", dx: -1, dy: 2 },
          { kind: "knight", dx: -1, dy: -2 },
        );
        break;
      case "line":
        additions.push(
          { kind: "line", dx: 1, dy: 0, maxDistance: command.maxDistance },
          { kind: "line", dx: -1, dy: 0, maxDistance: command.maxDistance },
          { kind: "line", dx: 0, dy: 1, maxDistance: command.maxDistance },
          { kind: "line", dx: 0, dy: -1, maxDistance: command.maxDistance },
        );
        break;
      case "teleport":
        additions.push({ kind: "step", dx: 0, dy: 0 });
        break;
    }
  });
  return additions;
};

const buildMoveset = (
  piece: string,
  override: MovementOverride | undefined,
): MoveDefinition[] => {
  const base = cloneMoves(BASE_MOVES[piece] ?? []);
  if (!override) return base;
  const moves = applyRemoval(base, override);
  moves.push(...addMoveDefinitions(override));
  return moves;
};

const evaluateMove = (
  piece: string,
  from: string,
  to: string,
  occupation: TargetOccupation,
  overrides: MovementOverride | undefined,
): boolean => {
  const origin = parseSquare(from);
  const destination = parseSquare(to);
  const dx = destination.file - origin.file;
  const dy = destination.rank - origin.rank;
  const moves = buildMoveset(piece, overrides);

  return moves.some((move) => {
    if (move.kind === "knight") {
      if (dx === move.dx && dy === move.dy) {
        return occupation !== "ally";
      }
      return false;
    }

    if (move.kind === "step") {
      if (dx === move.dx && dy === move.dy) {
        if (move.captureOnly && occupation !== "enemy") return false;
        if (move.moveOnly && occupation !== "empty") return false;
        if (occupation === "ally") return false;
        return true;
      }
      return false;
    }

    if (move.kind === "line") {
      if (!sameDirection(dx, dy, move.dx, move.dy)) return false;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      if (move.maxDistance && distance > move.maxDistance) return false;
      if (move.captureOnly && occupation !== "enemy") return false;
      if (move.moveOnly && occupation !== "empty") return false;
      if (occupation === "ally") return false;
      return distance > 0;
    }

    return false;
  });
};

const checkActionExpectation = (rule: RuleJSON, action: string): boolean => {
  const effects = rule.logic?.effects ?? [];
  return effects.some((effect) => {
    const actions = Array.isArray(effect.do)
      ? effect.do
      : effect.do
        ? [effect.do]
        : [];
    return actions.some((entry) => entry.action === action);
  });
};

export const dryRunRule = (
  intent: CanonicalIntent,
  rule: RuleJSON,
  tests: RuleTestCase[],
  movementOverrides: MovementOverride[],
): DryRunResult => {
  const issues: DryRunIssue[] = [];
  const overrides = new Map<string, MovementOverride>();
  movementOverrides.forEach((override) =>
    overrides.set(override.piece, override),
  );

  tests.forEach((test, index) => {
    if (test.type === "action") {
      const hasAction = checkActionExpectation(rule, test.action);
      if (hasAction !== test.expected) {
        issues.push({
          code: "action_mismatch",
          message:
            `Test #${index + 1}: action ${test.action} ` +
            (test.expected
              ? "attendue absente."
              : "présente alors qu'elle devrait être absente."),
        });
      }
      return;
    }

    const override = overrides.get(test.piece);
    let passed = false;
    try {
      passed = evaluateMove(
        test.piece,
        test.from,
        test.to,
        test.occupation ?? "empty",
        override,
      );
    } catch (error) {
      issues.push({
        code: "invalid_test",
        message: `Test #${index + 1}: ${String(error)}`,
      });
      return;
    }

    if (
      (test.expected === "legal" && !passed) ||
      (test.expected === "illegal" && passed)
    ) {
      issues.push({
        code: "move_mismatch",
        message:
          `Test #${index + 1}: le déplacement ${test.from}→${test.to} ` +
          (test.expected === "legal"
            ? "devrait être légal."
            : "devrait être interdit."),
      });
    }
  });

  // Conserver les vérifications de cohérence hazard basées sur l'intent.
  const hasHazard = intent.hazards && intent.hazards.length > 0;
  if (hasHazard) {
    const spawnsHazard = (rule.logic?.effects ?? []).some((effect) => {
      const actions = Array.isArray(effect.do)
        ? effect.do
        : effect.do
          ? [effect.do]
          : [];
      return actions.some((action) => action.action === "hazard.spawn");
    });
    if (!spawnsHazard) {
      issues.push({
        code: "hazard_missing",
        message:
          "Le intent attend une création de danger mais aucun hazard.spawn n'est présent.",
      });
    }
  }

  return { passed: issues.length === 0, issues };
};
